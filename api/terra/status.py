"""Terra connection status endpoint.

GET /api/terra/status?athlete=mike
- Checks if an athlete has a connected Terra user
- Returns { connected, userId, provider, displayName }
"""

import json
from http.server import BaseHTTPRequestHandler
from ._session import (
    is_configured, get_athlete_from_query, get_user_id,
    terra_api_get,
)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        try:
            if not is_configured():
                self._send_json(200, {"connected": False})
                return

            athlete = get_athlete_from_query(self.path)
            user_id = get_user_id(athlete)

            if not user_id:
                self._send_json(200, {"connected": False})
                return

            try:
                data = terra_api_get(f"/userInfo", {"user_id": user_id})
                user = data.get("user", {})
                provider = user.get("provider", "APPLE")
                self._send_json(200, {
                    "connected": True,
                    "userId": user_id,
                    "provider": provider,
                    "displayName": f"Apple Health",
                })
            except Exception:
                self._send_json(200, {
                    "connected": True,
                    "userId": user_id,
                    "provider": "APPLE",
                    "displayName": "Apple Health",
                })

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _send_json(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
