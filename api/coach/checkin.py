"""Coach check-in email settings, snapshot upload and test send (initiative 005).

GET  /api/coach/checkin
  → { allowed, enabled, email, snapshotAsOf, lastSent: {at, subject, test} | null }
POST /api/coach/checkin  body { action, ... }
  action=settings { enabled }  — turn the Sun/Wed email on or off. Turning it
                                 on records the address the athlete signed in
                                 with; turning it off deletes the snapshot.
  action=snapshot { snapshot } — store the app's latest check-in snapshot
                                 (schema: `_checkin.clean_snapshot`)
  action=test                  — send a check-in now from the stored snapshot

AUTH: every call requires `Authorization: Bearer <session>`; the athlete is
the token subject. Owner-only until CHECKIN_ATHLETES names others (D2).

Errors are short codes:
  400 bad_request | bad_snapshot | bad_version | bad_as_of | bad_days | unknown_action
  403 not_available   404 no_snapshot   409 not_enabled | no_email
  413 too_large       429 test_limit    502 send_failed
"""

from __future__ import annotations

import time
from http.server import BaseHTTPRequestHandler

from ._checkin import (
    MAX_BODY_BYTES,
    TEST_SENDS_PER_DAY,
    SnapshotError,
    checkin_allowed,
    clean_snapshot,
    last_sent_key,
    load_prefs,
    load_snapshot,
    local_now,
    save_prefs,
    save_snapshot,
    send_checkin,
    test_counter_key,
)
from ._core import kv_get_json, read_json_body, send_cors_preflight, send_json
from ..auth._helpers import (
    ADMIN_ATHLETE_ID,
    athlete_from_bearer,
    get_email_to_athlete_map,
    kv_bump_counter,
    verify_session_token,
)


def recipient_for(headers, athlete_id: str) -> str:
    """The address the athlete signed in with; else their allowlisted one."""
    header = headers.get("Authorization", "") or ""
    claims = verify_session_token(header[len("Bearer "):].strip()) if header.startswith("Bearer ") else None
    email = str((claims or {}).get("email") or "").strip().lower()
    if email and "@" in email:
        return email
    for addr, aid in sorted(get_email_to_athlete_map().items()):
        if aid == athlete_id:
            return addr
    return ""


def _content_length(headers) -> int | None:
    try:
        return int(headers.get("Content-Length", "0") or "0")
    except (TypeError, ValueError):
        return None


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_GET(self):
        ok, _auth_status, _auth_err, athlete_id = athlete_from_bearer(self.headers)
        if not ok:
            send_json(self, _auth_status, {"error": _auth_err})
            return
        if not checkin_allowed(athlete_id, ADMIN_ATHLETE_ID):
            send_json(self, 200, {"allowed": False})
            return
        prefs = load_prefs(athlete_id)
        snap = load_snapshot(athlete_id)
        last = kv_get_json(last_sent_key(athlete_id))
        send_json(self, 200, {
            "allowed": True,
            "enabled": bool(prefs.get("enabled")),
            "email": prefs.get("email") or recipient_for(self.headers, athlete_id),
            "snapshotAsOf": snap["asOf"] if snap else None,
            "lastSent": last if isinstance(last, dict) else None,
        })

    def do_POST(self):
        ok, _auth_status, _auth_err, athlete_id = athlete_from_bearer(self.headers)
        if not ok:
            send_json(self, _auth_status, {"error": _auth_err})
            return
        if not checkin_allowed(athlete_id, ADMIN_ATHLETE_ID):
            send_json(self, 403, {"error": "not_available"})
            return
        length = _content_length(self.headers)
        if length is None or length <= 0:
            send_json(self, 400, {"error": "bad_request"})
            return
        if length > MAX_BODY_BYTES:
            send_json(self, 413, {"error": "too_large"})
            return
        body = read_json_body(self)
        action = str(body.get("action", "")).strip()

        if action == "settings":
            enabled = body.get("enabled")
            if not isinstance(enabled, bool):
                send_json(self, 400, {"error": "bad_request"})
                return
            email = recipient_for(self.headers, athlete_id)
            if enabled and not email:
                send_json(self, 409, {"error": "no_email"})
                return
            prefs = save_prefs(athlete_id, enabled, email)
            send_json(self, 200, {"ok": True, "enabled": prefs["enabled"], "email": email})
            return

        if action == "snapshot":
            if not load_prefs(athlete_id).get("enabled"):
                send_json(self, 409, {"error": "not_enabled"})
                return
            try:
                snap = clean_snapshot(body.get("snapshot"))
            except SnapshotError as e:
                send_json(self, 400, {"error": e.code})
                return
            save_snapshot(athlete_id, snap)
            send_json(self, 200, {"ok": True, "asOf": snap["asOf"], "days": len(snap["days"])})
            return

        if action == "test":
            prefs = load_prefs(athlete_id)
            email = str(prefs.get("email") or "")
            if not prefs.get("enabled") or not email:
                send_json(self, 409, {"error": "not_enabled"})
                return
            snap = load_snapshot(athlete_id)
            if not snap:
                send_json(self, 404, {"error": "no_snapshot"})
                return
            try:
                used = kv_bump_counter(test_counter_key(athlete_id), 26 * 3600)
            except Exception:
                used = 0  # KV unreachable: don't block the owner's test
            if used > TEST_SENDS_PER_DAY:
                send_json(self, 429, {"error": "test_limit", "limit": TEST_SENDS_PER_DAY})
                return
            today = local_now(snap["timezone"], None).date()
            try:
                sent = send_checkin(athlete_id, email, snap, today, test=True)
            except Exception as e:
                print(f"[checkin] test send failed: {type(e).__name__}", flush=True)
                sent = False
            if not sent:
                send_json(self, 502, {"error": "send_failed"})
                return
            send_json(self, 200, {"ok": True, "sentAt": int(time.time() * 1000)})
            return

        send_json(self, 400, {"error": "unknown_action"})
