"""Garmin authentication endpoint with per-athlete MFA support.

POST /api/garmin/auth?athlete=mike
- Step 1: POST with no body → triggers login, Garmin sends SMS → returns {mfa_required: true}
- Step 2: POST with {mfa_code: "123456"} → completes MFA, saves session to KV → returns {authenticated: true}
- Subsequent: loads saved session from KV → no MFA needed

Each athlete has their own session stored in KV under "garmin_session_{athlete}".
Credentials resolve from GARMIN_EMAIL_{ATHLETE} / GARMIN_PASSWORD_{ATHLETE} env vars,
falling back to GARMIN_EMAIL / GARMIN_PASSWORD for single-user setups.

GET /api/garmin/auth?athlete=mike
- Debug: checks if session exists in KV and if env vars are set
"""

import json
import os
from http.server import BaseHTTPRequestHandler
from ._session import (
    get_client, save_session, login_fresh, get_athlete_from_query,
    _kv_get, _kv_del, _session_key, _get_credentials, _client_cache,
)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_DELETE(self):
        """Wipe the saved session for an athlete. Use to clear stale/cross-user tokens."""
        athlete = get_athlete_from_query(self.path)
        _kv_del(_session_key(athlete))
        _client_cache.pop(athlete or "__default__", None)
        self._send_json(200, {"cleared": True, "athlete": athlete})

    def do_GET(self):
        """Debug endpoint to check KV and env var status for an athlete."""
        athlete = get_athlete_from_query(self.path)
        kv_url = os.environ.get("KV_REST_API_URL", "")
        kv_token = os.environ.get("KV_REST_API_TOKEN", "")

        # Check for per-athlete credentials
        has_creds = False
        try:
            _get_credentials(athlete)
            has_creds = True
        except ValueError:
            pass

        saved = _kv_get(_session_key(athlete))
        has_session = saved is not None and len(str(saved)) > 0

        self._send_json(200, {
            "athlete": athlete,
            "kv_url_set": bool(kv_url),
            "kv_token_set": bool(kv_token),
            "credentials_configured": has_creds,
            "session_in_kv": has_session,
            "session_length": len(str(saved)) if saved else 0,
        })

    def do_POST(self):
        try:
            athlete = get_athlete_from_query(self.path)

            # Parse request body
            content_length = int(self.headers.get("Content-Length", 0))
            body = {}
            if content_length > 0:
                raw = self.rfile.read(content_length)
                body = json.loads(raw.decode())

            # Credentials from request body (user-entered on frontend)
            email = body.get("email", "")
            password = body.get("password", "")
            mfa_code = body.get("mfa_code", "")
            force_fresh = bool(body.get("force_fresh"))

            # Step 2: Complete MFA with provided code
            # This ALWAYS does a fresh login with the caller's credentials —
            # never falls back to a saved session.
            if mfa_code:
                # Clear any stale session before writing the new one.
                _kv_del(_session_key(athlete))
                _client_cache.pop(athlete or "__default__", None)
                client = login_fresh(
                    athlete, mfa_code=mfa_code,
                    email=email or None, password=password or None,
                )
                display_name = client.get_full_name()
                self._send_json(200, {
                    "authenticated": True,
                    "displayName": display_name or "Garmin User",
                    "athlete": athlete,
                    "session_saved": True,
                })
                return

            # If the caller submitted credentials OR requested force_fresh,
            # SKIP the saved-session branch. Otherwise a stale/cross-user
            # token saved at garmin_session_{athlete} would be returned as
            # "authenticated" and the user would see someone else's data.
            if not email and not password and not force_fresh:
                try:
                    client = get_client(athlete)
                    display_name = client.get_full_name()
                    self._send_json(200, {
                        "authenticated": True,
                        "displayName": display_name or "Garmin User",
                        "athlete": athlete,
                        "session_restored": True,
                    })
                    return
                except RuntimeError:
                    pass

            # Step 1: Fresh login — may trigger MFA SMS.
            # Wipe any stale session/cache for this athlete first so we never
            # silently restore a token that belongs to someone else.
            _kv_del(_session_key(athlete))
            _client_cache.pop(athlete or "__default__", None)

            # Credentials come from request body (frontend form) or env vars
            if not email or not password:
                self._send_json(401, {
                    "authenticated": False,
                    "error": "Garmin email and password required. Please enter your credentials.",
                })
                return

            try:
                client = login_fresh(athlete, email=email, password=password)
                display_name = client.get_full_name()
                self._send_json(200, {
                    "authenticated": True,
                    "displayName": display_name or "Garmin User",
                    "athlete": athlete,
                    "session_saved": True,
                })
            except Exception as e:
                if "MFA" in str(e) or "mfa" in str(e).lower():
                    self._send_json(200, {
                        "authenticated": False,
                        "mfa_required": True,
                        "athlete": athlete,
                        "message": "SMS verification code sent. POST back with {\"mfa_code\": \"123456\"} to complete.",
                    })
                else:
                    raise

        except ValueError as e:
            self._send_json(500, {"authenticated": False, "error": str(e)})
        except Exception as e:
            self._send_json(401, {"authenticated": False, "error": f"Garmin authentication failed: {str(e)}"})

    def _send_json(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
