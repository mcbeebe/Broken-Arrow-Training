"""Admin-only athlete allowlist management.

GET    /api/auth/athletes              -> list the allowlist (env seed + KV)
POST   /api/auth/athletes  {email, athleteId} -> add/update a KV entry
DELETE /api/auth/athletes  {email}     -> remove a KV entry

All methods require an admin session token (Authorization: Bearer <token>).
The env-seeded entries are read-only; only KV entries can be edited/removed,
which is what lets a new athlete be added without a redeploy.
"""

import json
import re
from http.server import BaseHTTPRequestHandler
from ._helpers import (
    verify_admin,
    get_env_email_map,
    get_kv_email_map,
    set_kv_email_map,
)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ATHLETE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if not self._require_admin():
            return
        self._send_json(200, {"athletes": self._athlete_list()})

    def do_POST(self):
        if not self._require_admin():
            return
        body = self._read_body()
        email = str(body.get("email", "")).strip().lower()
        athlete_id = str(body.get("athleteId", "")).strip().lower()

        if not EMAIL_RE.match(email):
            self._send_json(400, {"error": "A valid email is required"})
            return
        if not ATHLETE_ID_RE.match(athlete_id):
            self._send_json(400, {"error": "athleteId must be lowercase letters, numbers, or hyphens"})
            return
        if email in get_env_email_map():
            self._send_json(409, {"error": f"{email} is configured in the env seed and can't be edited here"})
            return

        try:
            kv_map = get_kv_email_map()
            kv_map[email] = athlete_id
            set_kv_email_map(kv_map)
        except RuntimeError:
            self._send_json(503, {"error": "Allowlist storage (KV) is not configured"})
            return

        self._send_json(200, {"athletes": self._athlete_list(), "added": {"email": email, "athleteId": athlete_id}})

    def do_DELETE(self):
        if not self._require_admin():
            return
        body = self._read_body()
        email = str(body.get("email", "")).strip().lower()

        kv_map = get_kv_email_map()
        if email not in kv_map:
            self._send_json(404, {"error": f"{email} is not an admin-managed athlete"})
            return

        try:
            del kv_map[email]
            set_kv_email_map(kv_map)
        except RuntimeError:
            self._send_json(503, {"error": "Allowlist storage (KV) is not configured"})
            return

        self._send_json(200, {"athletes": self._athlete_list(), "removed": email})

    # ── helpers ──────────────────────────────────────────────────

    def _athlete_list(self) -> list[dict]:
        env_map = get_env_email_map()
        kv_map = get_kv_email_map()
        rows = [
            {"email": email, "athleteId": athlete_id, "source": "env", "managed": False}
            for email, athlete_id in env_map.items()
        ]
        rows += [
            {"email": email, "athleteId": athlete_id, "source": "kv", "managed": True}
            for email, athlete_id in kv_map.items()
            if email not in env_map
        ]
        rows.sort(key=lambda r: r["athleteId"])
        return rows

    def _require_admin(self) -> bool:
        if verify_admin(self.headers.get("Authorization")):
            return True
        self._send_json(403, {"error": "Admin access required"})
        return False

    def _read_body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length <= 0:
                return {}
            return json.loads(self.rfile.read(length).decode())
        except Exception:
            return {}

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")

    def _send_json(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
