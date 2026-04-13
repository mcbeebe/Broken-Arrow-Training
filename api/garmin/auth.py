"""Garmin authentication endpoint with MFA support.

POST /api/garmin/auth
- Step 1: POST with no body → triggers login, Garmin sends SMS → returns {mfa_required: true}
- Step 2: POST with {mfa_code: "123456"} → completes MFA, saves session to KV → returns {authenticated: true}
- Subsequent: loads saved session from KV → no MFA needed

Session tokens are persisted in Upstash KV so MFA is only needed once
(or when the session expires, typically weeks/months).
"""

import json
import os
from http.server import BaseHTTPRequestHandler
from garminconnect import Garmin

# Module-level cache for the current request lifecycle
_garmin_client = None
_pending_mfa_client = None


def _get_kv_headers():
    """Get Upstash KV REST API headers."""
    token = os.environ.get("KV_REST_API_TOKEN", "")
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _kv_get(key: str):
    """Get a value from Upstash KV."""
    import urllib.request
    url = os.environ.get("KV_REST_API_URL", "")
    if not url:
        return None
    req = urllib.request.Request(
        f"{url}/get/{key}",
        headers=_get_kv_headers(),
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
            return data.get("result")
    except Exception:
        return None


def _kv_set(key: str, value: str, ex: int = 86400 * 30):
    """Set a value in Upstash KV with expiration (default 30 days)."""
    import urllib.request
    url = os.environ.get("KV_REST_API_URL", "")
    if not url:
        return
    body = json.dumps(["SET", key, value, "EX", str(ex)]).encode()
    req = urllib.request.Request(
        f"{url}/pipeline",
        data=body,
        headers=_get_kv_headers(),
        method="POST",
    )
    try:
        urllib.request.urlopen(req)
    except Exception:
        pass


def _try_saved_session() -> Garmin | None:
    """Try to restore a Garmin client from a saved session in KV."""
    global _garmin_client

    email = os.environ.get("GARMIN_EMAIL", "")
    password = os.environ.get("GARMIN_PASSWORD", "")

    saved_session = _kv_get("garmin_session")
    if not saved_session:
        return None

    try:
        session_data = json.loads(saved_session) if isinstance(saved_session, str) else saved_session
        client = Garmin(email, password)
        client.login(session_data)
        # Verify session is valid
        client.get_full_name()
        _garmin_client = client
        return client
    except Exception:
        return None


def _save_session(client: Garmin):
    """Save Garmin session tokens to KV."""
    try:
        session_data = client.session_data
        if session_data:
            _kv_set("garmin_session", json.dumps(session_data))
    except Exception:
        pass


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        global _garmin_client, _pending_mfa_client

        try:
            email = os.environ.get("GARMIN_EMAIL", "")
            password = os.environ.get("GARMIN_PASSWORD", "")

            if not email or not password:
                raise ValueError("GARMIN_EMAIL and GARMIN_PASSWORD must be set")

            # Parse request body
            content_length = int(self.headers.get("Content-Length", 0))
            body = {}
            if content_length > 0:
                raw = self.rfile.read(content_length)
                body = json.loads(raw.decode())

            mfa_code = body.get("mfa_code", "")

            # Step 2: Complete MFA with provided code
            if mfa_code:
                client = Garmin(email, password)
                client.login(prompt_mfa=lambda: mfa_code)
                _garmin_client = client
                _save_session(client)

                display_name = client.get_full_name()
                self._send_json(200, {
                    "authenticated": True,
                    "displayName": display_name or "Garmin User",
                    "session_saved": True,
                })
                return

            # Try saved session first
            client = _try_saved_session()
            if client:
                display_name = client.get_full_name()
                self._send_json(200, {
                    "authenticated": True,
                    "displayName": display_name or "Garmin User",
                    "session_saved": True,
                })
                return

            # Step 1: Fresh login — will trigger MFA SMS
            try:
                client = Garmin(email, password)
                # Try login without MFA handler — if MFA is required, it raises
                client.login()
                # If we get here, no MFA was needed
                _garmin_client = client
                _save_session(client)
                display_name = client.get_full_name()
                self._send_json(200, {
                    "authenticated": True,
                    "displayName": display_name or "Garmin User",
                    "session_saved": True,
                })
            except Exception as e:
                if "MFA" in str(e) or "mfa" in str(e).lower():
                    # MFA was triggered — SMS has been sent
                    self._send_json(200, {
                        "authenticated": False,
                        "mfa_required": True,
                        "message": "SMS verification code sent to your phone. POST back with {\"mfa_code\": \"123456\"} to complete authentication.",
                    })
                else:
                    raise

        except ValueError as e:
            self._send_json(500, {
                "authenticated": False,
                "error": str(e),
            })

        except Exception as e:
            self._send_json(401, {
                "authenticated": False,
                "error": f"Garmin authentication failed: {str(e)}",
            })

    def _send_json(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
