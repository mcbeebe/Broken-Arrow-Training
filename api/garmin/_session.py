"""Shared Garmin session management for all API endpoints.

Supports multiple athletes — each athlete has their own Garmin credentials
and session stored in Upstash KV under a scoped key.

Credential resolution:
  1. Per-athlete env vars: GARMIN_EMAIL_MIKE / GARMIN_PASSWORD_MIKE
  2. Fallback: GARMIN_EMAIL / GARMIN_PASSWORD (single-user mode)

Session KV keys:
  - "garmin_session_{athlete}" for per-athlete sessions
  - "garmin_session" for default (no athlete param)
"""

import json
import os
import urllib.request
from garminconnect import Garmin

# Module-level cache: { athlete_id: Garmin client }
_client_cache: dict[str, Garmin] = {}


def _get_kv_headers():
    token = os.environ.get("KV_REST_API_TOKEN", "")
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _kv_get(key: str):
    """Get a value from Upstash KV via REST API."""
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
    """Set a value in Upstash KV via REST API with expiration."""
    url = os.environ.get("KV_REST_API_URL", "")
    token = os.environ.get("KV_REST_API_TOKEN", "")
    if not url or not token:
        raise RuntimeError(
            f"KV not configured: url={'set' if url else 'missing'}, "
            f"token={'set' if token else 'missing'}"
        )
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


def _kv_del(key: str):
    """Delete a key from Upstash KV via REST API. Silently ignores failures."""
    url = os.environ.get("KV_REST_API_URL", "")
    token = os.environ.get("KV_REST_API_TOKEN", "")
    if not url or not token:
        return
    req = urllib.request.Request(
        f"{url}/del/{key}",
        headers={"Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req).read()
    except Exception:
        pass


def _session_key(athlete: str | None) -> str:
    """KV key for an athlete's Garmin session."""
    if athlete:
        return f"garmin_session_{athlete}"
    return "garmin_session"


def _get_credentials(athlete: str | None) -> tuple[str, str]:
    """Resolve Garmin credentials for an athlete.

    Tries per-athlete env vars first (e.g., GARMIN_EMAIL_JIM),
    then falls back to the default GARMIN_EMAIL / GARMIN_PASSWORD.
    """
    if athlete:
        suffix = athlete.upper()
        email = os.environ.get(f"GARMIN_EMAIL_{suffix}", "")
        password = os.environ.get(f"GARMIN_PASSWORD_{suffix}", "")
        if email and password:
            return email, password

    # Fallback to default credentials
    email = os.environ.get("GARMIN_EMAIL", "")
    password = os.environ.get("GARMIN_PASSWORD", "")
    if not email or not password:
        raise ValueError(
            "Garmin credentials not configured. "
            f"Set GARMIN_EMAIL_{(athlete or '').upper()} / GARMIN_PASSWORD_{(athlete or '').upper()} "
            "or GARMIN_EMAIL / GARMIN_PASSWORD."
        )
    return email, password


def get_client(athlete: str | None = None) -> Garmin:
    """Get an authenticated Garmin client for the given athlete.

    Uses cached client if available, then tries saved session from KV.
    For session restore, credentials from env vars are optional — the
    garminconnect library can restore from a session token alone if the
    email/password used during auth are provided (or dummy values for
    session-only restore).
    Raises RuntimeError if no valid session exists.
    """
    global _client_cache
    cache_key = athlete or "__default__"

    # Try module-level cache first (warm serverless invocation)
    if cache_key in _client_cache:
        try:
            _client_cache[cache_key].get_full_name()
            return _client_cache[cache_key]
        except Exception:
            del _client_cache[cache_key]

    # For session restore, use env var credentials if available, otherwise
    # use placeholder values — the session token has the real auth.
    try:
        email, password = _get_credentials(athlete)
    except ValueError:
        email, password = "session@restore", "session_token_auth"

    kv_key = _session_key(athlete)

    # Try saved session from KV
    saved_token = _kv_get(kv_key)
    if saved_token:
        try:
            client = Garmin(email, password)
            client.login(tokenstore=saved_token)
            client.get_full_name()  # Verify it works
            _client_cache[cache_key] = client
            return client
        except Exception:
            pass

    raise RuntimeError(
        "No valid Garmin session found. "
        "Please authenticate first via POST /api/garmin/auth"
        + (f"?athlete={athlete}" if athlete else "")
    )


def save_session(client: Garmin, athlete: str | None = None):
    """Save Garmin session tokens to KV for the given athlete."""
    token_data = client.client.dumps()
    if not token_data:
        raise RuntimeError("client.client.dumps() returned empty")
    _kv_set(_session_key(athlete), token_data)
    # Also cache in memory
    cache_key = athlete or "__default__"
    _client_cache[cache_key] = client


def login_fresh(
    athlete: str | None = None,
    mfa_code: str | None = None,
    email: str | None = None,
    password: str | None = None,
) -> Garmin:
    """Perform a fresh Garmin login (with optional MFA code).

    Credentials can come from:
    1. email/password params (user-provided via frontend form)
    2. Per-athlete env vars (GARMIN_EMAIL_JIM)
    3. Default env vars (GARMIN_EMAIL)

    If mfa_code is provided, passes it as the MFA prompt response.
    On success, saves the session to KV and returns the client.
    The password is never stored — only the session token.
    """
    if not email or not password:
        email, password = _get_credentials(athlete)

    if mfa_code:
        client = Garmin(email, password, prompt_mfa=lambda: mfa_code)
    else:
        client = Garmin(email, password)

    client.login()
    save_session(client, athlete)
    return client


def get_athlete_from_query(path: str) -> str | None:
    """Extract the 'athlete' query parameter from a request path."""
    from urllib.parse import urlparse, parse_qs
    query = parse_qs(urlparse(path).query)
    values = query.get("athlete", [None])
    return values[0] if values and values[0] else None
