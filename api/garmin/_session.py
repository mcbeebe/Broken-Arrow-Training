"""Shared Garmin session management for all API endpoints.

Loads saved session from Upstash KV to avoid MFA on every request.
"""

import json
import os
import urllib.request
from garminconnect import Garmin

_garmin_client = None


def _get_kv_headers():
    token = os.environ.get("KV_REST_API_TOKEN", "")
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _kv_get(key: str):
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


def get_client() -> Garmin:
    """Get an authenticated Garmin client using saved session from KV."""
    global _garmin_client

    email = os.environ.get("GARMIN_EMAIL", "")
    password = os.environ.get("GARMIN_PASSWORD", "")

    if not email or not password:
        raise ValueError("GARMIN_EMAIL and GARMIN_PASSWORD must be set")

    # Try module-level cache first (warm invocation)
    if _garmin_client is not None:
        try:
            _garmin_client.get_full_name()
            return _garmin_client
        except Exception:
            _garmin_client = None

    # Try saved session from KV
    saved_session = _kv_get("garmin_session")
    if saved_session:
        try:
            session_data = json.loads(saved_session) if isinstance(saved_session, str) else saved_session
            client = Garmin(email, password)
            client.login(session_data)
            client.get_full_name()  # Verify it works
            _garmin_client = client
            return client
        except Exception:
            pass

    raise RuntimeError(
        "No valid Garmin session found. "
        "Please authenticate first via POST /api/garmin/auth"
    )
