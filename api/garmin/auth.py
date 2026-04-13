"""Garmin authentication endpoint.

POST /api/garmin/auth
- Reads GARMIN_EMAIL and GARMIN_PASSWORD from environment
- Initializes Garmin Connect session via python-garminconnect
- Returns connection status and display name
"""

import json
import os
from http.server import BaseHTTPRequestHandler
from garminconnect import Garmin

# Module-level session cache (persists across warm invocations)
_garmin_client = None


def _get_client() -> Garmin:
    """Get or create a Garmin client with cached session."""
    global _garmin_client

    email = os.environ.get("GARMIN_EMAIL", "")
    password = os.environ.get("GARMIN_PASSWORD", "")

    if not email or not password:
        raise ValueError("GARMIN_EMAIL and GARMIN_PASSWORD must be set")

    if _garmin_client is not None:
        try:
            # Test if session is still valid
            _garmin_client.get_full_name()
            return _garmin_client
        except Exception:
            _garmin_client = None

    client = Garmin(email, password)
    client.login()
    _garmin_client = client
    return client


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        try:
            client = _get_client()
            display_name = client.get_full_name()

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "authenticated": True,
                "displayName": display_name or "Garmin User",
            }).encode())

        except ValueError as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "authenticated": False,
                "error": str(e),
            }).encode())

        except Exception as e:
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "authenticated": False,
                "error": f"Garmin authentication failed: {str(e)}",
            }).encode())
