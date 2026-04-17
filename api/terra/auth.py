"""Terra auth management endpoint.

POST /api/terra/auth?athlete=mike
- Called after widget auth completes. Body: { user_id: "..." }
- Saves user_id to KV for this athlete.

DELETE /api/terra/auth?athlete=mike
- Deauthorizes the Terra user and clears KV.
"""

import json
from http.server import BaseHTTPRequestHandler
from ._session import (
    is_configured, get_athlete_from_query,
    get_user_id, save_user_id, clear_user, terra_api_get,
)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        try:
            if not is_configured():
                self._send_json(500, {"error": "Terra not configured"})
                return

            athlete = get_athlete_from_query(self.path)
            content_length = int(self.headers.get("Content-Length", 0))
            body = {}
            if content_length > 0:
                body = json.loads(self.rfile.read(content_length).decode())

            user_id = body.get("user_id", "")
            if not user_id:
                self._send_json(400, {"error": "user_id required"})
                return

            save_user_id(user_id, athlete)
            self._send_json(200, {
                "connected": True,
                "userId": user_id,
                "athlete": athlete,
            })

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def do_DELETE(self):
        try:
            athlete = get_athlete_from_query(self.path)
            user_id = get_user_id(athlete)

            if user_id:
                try:
                    terra_api_get(f"/auth/deauthenticateUser", {"user_id": user_id})
                except Exception:
                    pass

            clear_user(athlete)
            self._send_json(200, {"cleared": True, "athlete": athlete})

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _send_json(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
