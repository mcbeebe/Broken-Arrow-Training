"""Session verification endpoint.

GET /api/auth/verify
Header: Authorization: Bearer <session_token>

Verifies a stored session token is still valid.
Returns the athlete info if valid.
"""

import json
from http.server import BaseHTTPRequestHandler
from ._helpers import verify_session_token


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        try:
            auth_header = self.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                self._send_json(401, {"error": "No token provided"})
                return

            token = auth_header[7:]
            payload = verify_session_token(token)

            if not payload:
                self._send_json(401, {"error": "Invalid or expired token"})
                return

            self._send_json(200, {
                "valid": True,
                "athleteId": payload.get("sub"),
                "email": payload.get("email"),
                "provider": payload.get("provider"),
            })

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _send_json(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
