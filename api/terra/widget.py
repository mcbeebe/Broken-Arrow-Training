"""Terra widget session endpoint.

POST /api/terra/widget?athlete=mike
- Generates a Terra widget session URL for the user to connect their wearable
- Returns { widgetUrl, sessionId }
"""

import json
from http.server import BaseHTTPRequestHandler
from ._session import (
    is_configured, get_athlete_from_query, get_terra_headers,
    TERRA_API_BASE,
)
import urllib.request


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        try:
            if not is_configured():
                self._send_json(500, {"error": "Terra API not configured"})
                return

            athlete = get_athlete_from_query(self.path)
            reference_id = athlete or "default"

            body = json.dumps({
                "reference_id": reference_id,
                "providers": "APPLE",
                "language": "en",
                "auth_success_redirect_url": "https://broken-arrow-training.vercel.app/settings",
            }).encode()

            req = urllib.request.Request(
                f"{TERRA_API_BASE}/auth/generateWidgetSession",
                data=body,
                headers=get_terra_headers(),
                method="POST",
            )

            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode())

            self._send_json(200, {
                "widgetUrl": data.get("url", ""),
                "sessionId": data.get("session_id", ""),
            })

        except Exception as e:
            self._send_json(500, {"error": f"Widget generation failed: {str(e)}"})

    def _send_json(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
