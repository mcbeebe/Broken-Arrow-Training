"""Cross-device sync: per-(athlete, key) JSONB store with LWW semantics.

GET  /api/sync           → {items: [{key, value, updatedAt}], serverNow}
PUT  /api/sync           → {written: N, skipped: M}
GET  /api/version        → {commit, message, deployedAt, ...}

Both sync methods require a Bearer session token (HMAC-signed; minted
by `api/auth/google.py`). The token's `sub` claim is the authoritative
athlete id — clients can't override it via query string.

The PUT body shape is `{items: [{key, value, updatedAt}]}` where every
`value` is the raw localStorage string and `updatedAt` is an ISO 8601
timestamp. Stale rows (server `updated_at` newer than incoming) are
skipped without error so an idempotent retry stays safe.

Body cap: 1 MB. Per-key allowlist: `api/_sync/allowlist.py`.

`/api/version` rides this same function (routed via a vercel.json
rewrite that appends `?__endpoint=version`) so we stay within the
Hobby-plan 12-function limit. Dispatch happens at the top of `do_GET`.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import psycopg
from psycopg.types.json import Jsonb

from .auth._helpers import decode_session_token
from .coach._core import read_json_body, send_json
from ._sync.allowlist import is_preserved
from ._sync.upsert import build_upsert, dedupe_rows


MAX_BODY_BYTES = 4_000_000  # 4 MB hard cap on PUT payloads (Vercel's
                            # request-body limit is 4.5 MB; the client
                            # chunks at 800 KB so most PUTs are smaller,
                            # but coach memory + a fresh device's first
                            # push can spike higher).

# Reuse a single connection per warmed Vercel function instance. Python
# serverless on Vercel serves one request per process at a time, so a
# module-level handle is safe; we lazy-init and reconnect on closed-
# connection errors so the first cold start doesn't pay the connect cost
# twice and idle disconnects self-heal on next call.
_conn: psycopg.Connection | None = None


def _get_conn() -> psycopg.Connection:
    global _conn
    if _conn is None or _conn.closed:
        url = os.environ.get("POSTGRES_URL")
        if not url:
            raise RuntimeError("POSTGRES_URL not configured")
        _conn = psycopg.connect(url, autocommit=True)
    return _conn


def _bearer_token(handler: BaseHTTPRequestHandler) -> str | None:
    auth = handler.headers.get("Authorization", "") or ""
    if not auth.startswith("Bearer "):
        return None
    return auth[7:].strip() or None


def _authenticate(handler: BaseHTTPRequestHandler) -> str | None:
    """Return the athlete_id from a verified bearer token, or send 401
    and return None. Caller should `return` on None."""
    token = _bearer_token(handler)
    payload = decode_session_token(token) if token else None
    if not payload:
        send_json(handler, 401, {"error": "missing or invalid session token"})
        return None
    sub = str(payload.get("sub", "")).strip().lower()
    if not sub:
        send_json(handler, 401, {"error": "session token missing subject"})
        return None
    return sub


def _parse_iso(s: str) -> datetime | None:
    """ISO 8601 with optional trailing Z. Returns None on parse failure
    so callers can reject the row."""
    if not isinstance(s, str) or not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def partition_items(items: list) -> tuple[list[tuple[str, str, datetime]], list[dict]]:
    """Split a PUT batch into valid rows and per-item rejections.

    FAIL-SOFT BY DESIGN (P0 postmortem): the old behavior 400'd the ENTIRE
    batch when any single item failed validation — so one key missing from
    the allowlist silently poisoned every push from a device for weeks
    (nothing synced, the UI said nothing). One bad item must never block
    the other 99: it gets skipped and REPORTED, the client surfaces it,
    and the allowlist-parity test keeps drift from happening again.
    """
    rows: list[tuple[str, str, datetime]] = []
    rejected: list[dict] = []
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            rejected.append({"index": i, "key": None, "reason": "not an object"})
            continue
        key = item.get("key")
        value = item.get("value")
        updated_at_raw = item.get("updatedAt")
        if not isinstance(key, str) or not key:
            rejected.append({"index": i, "key": None, "reason": "invalid key"})
            continue
        if not is_preserved(key):
            rejected.append({"index": i, "key": key, "reason": "not on allowlist"})
            continue
        if not isinstance(value, str):
            rejected.append({"index": i, "key": key, "reason": "value must be a string"})
            continue
        updated_at = _parse_iso(updated_at_raw) if isinstance(updated_at_raw, str) else None
        if updated_at is None:
            rejected.append({"index": i, "key": key, "reason": "invalid updatedAt"})
            continue
        rows.append((key, value, updated_at))
    return rows, rejected


def _is_version_request(handler: BaseHTTPRequestHandler) -> bool:
    """True when this request was routed here by the /api/version
    rewrite (`?__endpoint=version`). Using a query-param signal instead
    of `self.path` since Vercel's rewrite layer may or may not surface
    the original URL to the handler — the query string always survives."""
    try:
        qs = parse_qs(urlparse(handler.path).query)
        return qs.get("__endpoint", [""])[0] == "version"
    except Exception:
        return False


def _serve_version(handler: BaseHTTPRequestHandler) -> None:
    """Live deploy metadata — same payload the dropped api/version.py
    used to serve. Vercel injects VERCEL_GIT_COMMIT_* into every
    function's runtime env on each deploy."""
    full_sha = os.environ.get("VERCEL_GIT_COMMIT_SHA", "")
    short_sha = full_sha[:7] if full_sha else "unknown"
    message = os.environ.get("VERCEL_GIT_COMMIT_MESSAGE", "")
    subject = message.split("\n", 1)[0] if message else ""
    branch = os.environ.get("VERCEL_GIT_COMMIT_REF", "")
    deployed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    payload = {
        "commit": short_sha,
        "commitFull": full_sha,
        "message": subject,
        "branch": branch,
        "deployedAt": deployed_at,
        "runtime": "vercel-python",
    }
    handler.send_response(200)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET,OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    # The whole point of this endpoint is to confirm a fresh deploy —
    # caching it would defeat the purpose.
    handler.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
    handler.end_headers()
    handler.wfile.write(json.dumps(payload).encode())


class handler(BaseHTTPRequestHandler):
    # ── CORS preflight ──────────────────────────────────────────
    # Inline (not via the shared `send_cors_preflight` helper) because
    # this endpoint accepts PUT + Authorization, neither of which the
    # shared helper advertises. Safari rejects the preflight when the
    # function-emitted headers don't include the methods/headers the
    # browser is about to use, even if vercel.json layers them on top.
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    # ── GET: dispatch to /api/version (rewritten) or sync read ──
    def do_GET(self):
        if _is_version_request(self):
            _serve_version(self)
            return

        athlete_id = _authenticate(self)
        if athlete_id is None:
            return

        try:
            conn = _get_conn()
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT key, value, updated_at "
                    "FROM user_state WHERE athlete_id = %s",
                    (athlete_id,),
                )
                rows = cur.fetchall()
        except Exception as e:
            send_json(self, 500, {"error": f"db read failed: {type(e).__name__}"})
            return

        items = [
            {
                "key": row[0],
                # Stored as a JSONB string of the raw localStorage value,
                # so psycopg deserialises it back to a Python str. Just
                # pass it through.
                "value": row[1],
                "updatedAt": row[2].astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            }
            for row in rows
        ]
        server_now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        send_json(self, 200, {"items": items, "serverNow": server_now})

    # ── PUT: LWW upsert a batch of (key, value, updatedAt) rows ─
    def do_PUT(self):
        athlete_id = _authenticate(self)
        if athlete_id is None:
            return

        # Body-size guard. Read Content-Length first so we can short-
        # circuit oversize uploads before pulling them into memory.
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length > MAX_BODY_BYTES:
            send_json(self, 413, {"error": "body exceeds 4MB limit"})
            return

        body = read_json_body(self)
        items = body.get("items")
        if not isinstance(items, list):
            send_json(self, 400, {"error": "items must be a list"})
            return

        rows, rejected = partition_items(items)
        rows = dedupe_rows(rows)

        # One multi-row INSERT = one database round trip (P0 postmortem,
        # part two: per-row execute × backlog × Neon latency blew the
        # function's time budget → 504, and the backlog could never
        # drain). rowcount counts inserts + LWW updates; rows blocked by
        # the WHERE-guard (stale incoming) are the skipped remainder.
        written = 0
        skipped = 0
        if rows:
            try:
                sql, params = build_upsert(athlete_id, rows, wrap_value=Jsonb)
                conn = _get_conn()
                with conn.cursor() as cur:
                    cur.execute(sql, params)
                    written = max(cur.rowcount, 0)
                skipped = len(rows) - written
            except Exception as e:
                send_json(self, 500, {"error": f"db write failed: {type(e).__name__}"})
                return

        send_json(self, 200, {"written": written, "skipped": skipped, "rejected": rejected})
