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
from .coach._core import read_json_body, send_cors_preflight, send_json
from ._sync.allowlist import is_preserved


MAX_BODY_BYTES = 1_000_000  # 1 MB hard cap on PUT payloads

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
    def do_OPTIONS(self):
        send_cors_preflight(self)

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
            send_json(self, 413, {"error": "body exceeds 1MB limit"})
            return

        body = read_json_body(self)
        items = body.get("items")
        if not isinstance(items, list):
            send_json(self, 400, {"error": "items must be a list"})
            return

        # Pre-validate every row before opening a DB transaction so a bad
        # batch fails fast and atomically (we don't half-write).
        rows: list[tuple[str, str, datetime]] = []
        for i, item in enumerate(items):
            if not isinstance(item, dict):
                send_json(self, 400, {"error": f"items[{i}] not an object"})
                return
            key = item.get("key")
            value = item.get("value")
            updated_at_raw = item.get("updatedAt")
            if not isinstance(key, str) or not key:
                send_json(self, 400, {"error": f"items[{i}].key invalid"})
                return
            if not is_preserved(key):
                send_json(self, 400, {"error": f"items[{i}].key not on allowlist: {key}"})
                return
            if not isinstance(value, str):
                send_json(self, 400, {"error": f"items[{i}].value must be a string"})
                return
            updated_at = _parse_iso(updated_at_raw) if isinstance(updated_at_raw, str) else None
            if updated_at is None:
                send_json(self, 400, {"error": f"items[{i}].updatedAt invalid ISO timestamp"})
                return
            rows.append((key, value, updated_at))

        written = 0
        skipped = 0
        try:
            conn = _get_conn()
            with conn.cursor() as cur:
                for key, value, updated_at in rows:
                    cur.execute(
                        "INSERT INTO user_state (athlete_id, key, value, updated_at) "
                        "VALUES (%s, %s, %s, %s) "
                        "ON CONFLICT (athlete_id, key) DO UPDATE SET "
                        "  value = EXCLUDED.value, "
                        "  updated_at = EXCLUDED.updated_at "
                        "WHERE user_state.updated_at < EXCLUDED.updated_at",
                        (athlete_id, key, Jsonb(value), updated_at),
                    )
                    # rowcount == 1 for fresh insert or successful LWW update;
                    # 0 when the WHERE-guard blocked an older incoming row.
                    if cur.rowcount == 1:
                        written += 1
                    else:
                        skipped += 1
        except Exception as e:
            send_json(self, 500, {"error": f"db write failed: {type(e).__name__}"})
            return

        send_json(self, 200, {"written": written, "skipped": skipped})
