"""Garmin authentication endpoint with MFA support.

POST /api/garmin/auth
- Step 1: POST with no body → triggers login, Garmin sends SMS → returns {mfa_required: true}
- Step 2: POST with {mfa_code: "123456"} → completes MFA, saves session to KV → returns {authenticated: true}
- Subsequent: loads saved session from KV → no MFA needed

GET /api/garmin/auth
- Debug: checks if session exists in KV and if env vars are set

Session tokens are persisted in Upstash KV so MFA is only needed once.
"""

import json
import os
import urllib.request
from http.server import BaseHTTPRequestHandler
from garminconnect import Garmin

_garmin_client = None


def _kv_headers():
    token = os.environ.get("KV_REST_API_TOKEN", "")
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _kv_get(key: str):
    """Get a value from Upstash KV via REST API."""
    url = os.environ.get("KV_REST_API_URL", "")
    token = os.environ.get("KV_REST_API_TOKEN", "")
    if not url or not token:
        return None
    req = urllib.request.Request(
        f"{url}/get/{key}",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
            return data.get("result")
    except Exception as e:
        return None


def _kv_set(key: str, value: str, ex: int = 86400 * 30):
    """Set a value in Upstash KV via REST API with expiration."""
    url = os.environ.get("KV_REST_API_URL", "")
    token = os.environ.get("KV_REST_API_TOKEN", "")
    if not url or not token:
        raise RuntimeError(f"KV not configured: url={'set' if url else 'missing'}, token={'set' if token else 'missing'}")

    # Use the simple REST endpoint: POST /set/key/value/EX/seconds
    # Value needs to be URL-encoded since it contains JSON
    encoded_value = urllib.request.quote(value, safe='')
    set_url = f"{url}/set/{key}/{encoded_value}/EX/{ex}"
    req = urllib.request.Request(
        set_url,
        headers={"Authorization": f"Bearer {token}"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode())
        if result.get("error"):
            raise RuntimeError(f"KV set error: {result['error']}")


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
        client.get_full_name()
        _garmin_client = client
        return client
    except Exception:
        return None


def _save_session(client: Garmin):
    """Save Garmin session tokens to KV."""
    session_data = client.session_data
    if session_data:
        serialized = json.dumps(session_data)
        _kv_set("garmin_session", serialized)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        """Debug endpoint to check KV and env var status."""
        kv_url = os.environ.get("KV_REST_API_URL", "")
        kv_token = os.environ.get("KV_REST_API_TOKEN", "")
        email = os.environ.get("GARMIN_EMAIL", "")

        # Try to read session from KV
        saved = _kv_get("garmin_session")
        has_session = saved is not None and len(str(saved)) > 0

        self._send_json(200, {
            "kv_url_set": bool(kv_url),
            "kv_token_set": bool(kv_token),
            "email_set": bool(email),
            "session_in_kv": has_session,
            "session_length": len(str(saved)) if saved else 0,
        })

    def do_POST(self):
        global _garmin_client

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
                client = Garmin(email, password, prompt_mfa=lambda: mfa_code)
                client.login()
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
                client.login()
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
                    self._send_json(200, {
                        "authenticated": False,
                        "mfa_required": True,
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
