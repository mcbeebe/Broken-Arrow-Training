"""Google OAuth callback endpoint.

POST /api/auth/google
Body: { "credential": "..." }  (Google ID token from Sign In with Google)

Verifies the Google ID token, maps email to athlete ID,
returns a signed session token.
"""

import json
import os
import urllib.request
from http.server import BaseHTTPRequestHandler
from ._helpers import lookup_athlete, create_session_token, get_email_to_athlete_map


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(content_length).decode()) if content_length > 0 else {}

            credential = body.get("credential", "")
            if not credential:
                self._send_json(400, {"error": "credential required"})
                return

            # Verify the Google ID token via Google's tokeninfo endpoint
            verify_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={urllib.parse.quote(credential)}"
            req = urllib.request.Request(verify_url)
            with urllib.request.urlopen(req, timeout=10) as resp:
                token_data = json.loads(resp.read().decode())

            email = token_data.get("email", "").lower()
            email_verified = token_data.get("email_verified", "false")

            if email_verified != "true" or not email:
                self._send_json(401, {"error": "Email not verified"})
                return

            # Check Google client ID matches
            client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
            if client_id and token_data.get("aud") != client_id:
                self._send_json(401, {"error": "Invalid client ID"})
                return

            # Map email to athlete
            athlete_id = lookup_athlete(email)
            if not athlete_id:
                configured_count = len(get_email_to_athlete_map())
                self._send_json(403, {
                    "error": f"No athlete account found for {email}. {configured_count} athlete(s) configured. Contact Mike to get set up.",
                    "email": email,
                })
                return

            # Create session token
            session_token = create_session_token(athlete_id, email, "google")

            self._send_json(200, {
                "authenticated": True,
                "athleteId": athlete_id,
                "email": email,
                "name": token_data.get("name", ""),
                "token": session_token,
            })

        except Exception as e:
            self._send_json(500, {"error": f"Google auth failed: {str(e)}"})

    def _send_json(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
