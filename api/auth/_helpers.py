"""Shared auth helpers for Google/Apple OAuth.

Maps verified emails to athlete IDs. Session tokens are signed
JWTs stored in frontend localStorage.

Environment variables:
  GOOGLE_CLIENT_ID: Google OAuth client ID
  GOOGLE_CLIENT_SECRET: Google OAuth client secret
  APPLE_CLIENT_ID: Apple Sign-In service ID
  APPLE_TEAM_ID: Apple Developer Team ID
  APPLE_KEY_ID: Apple Sign-In key ID
  APPLE_PRIVATE_KEY: Apple Sign-In private key (PEM, base64-encoded)
  OAUTH_JWT_SECRET: Secret for signing session JWTs
  KV_REST_API_URL / KV_REST_API_TOKEN: Upstash KV
"""

import hashlib
import hmac
import json
import os
import time
import base64
import urllib.request
import urllib.parse


# Runtime-managed allowlist. Admin-added athletes live here so a new athlete
# can be onboarded without editing the ATHLETE_EMAILS env var + redeploying.
KV_ATHLETE_EMAILS_KEY = "auth:athlete_emails"

# Only this athlete may read/write the allowlist via /api/auth/athletes.
ADMIN_ATHLETE_ID = os.environ.get("ADMIN_ATHLETE_ID", "mike").lower()


def get_jwt_secret() -> str:
    return os.environ.get("OAUTH_JWT_SECRET", "")


def _kv_base() -> str | None:
    return os.environ.get("KV_REST_API_URL", "") or None


def _kv_get(key: str) -> str | None:
    url = _kv_base()
    token = os.environ.get("KV_REST_API_TOKEN", "")
    if not url or not token:
        return None
    req = urllib.request.Request(
        f"{url}/get/{urllib.parse.quote(key, safe='')}",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode()).get("result")
    except Exception:
        return None


def _kv_set(key: str, value: str) -> None:
    url = _kv_base()
    token = os.environ.get("KV_REST_API_TOKEN", "")
    if not url or not token:
        raise RuntimeError("KV not configured")
    set_url = f"{url}/set/{urllib.parse.quote(key, safe='')}/{urllib.parse.quote(value, safe='')}"
    req = urllib.request.Request(set_url, headers={"Authorization": f"Bearer {token}"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        resp.read()


def _normalize_map(data: object) -> dict[str, str]:
    if not isinstance(data, dict):
        return {}
    return {
        str(email).strip().lower(): str(athlete_id).strip().lower()
        for email, athlete_id in data.items()
        if str(email).strip() and str(athlete_id).strip()
    }


def get_env_email_map() -> dict[str, str]:
    """email→athleteId from the ATHLETE_EMAILS env seed (read-only).

    Format: ATHLETE_EMAILS=mike:mike@email.com,joel:joel@email.com
    """
    raw = os.environ.get("ATHLETE_EMAILS", "")
    mapping: dict[str, str] = {}
    for pair in raw.split(","):
        pair = pair.strip()
        if ":" not in pair:
            continue
        athlete_id, email = pair.split(":", 1)
        mapping[email.strip().lower()] = athlete_id.strip().lower()
    return mapping


def get_kv_email_map() -> dict[str, str]:
    """email→athleteId added at runtime via the admin panel (KV-backed)."""
    raw = _kv_get(KV_ATHLETE_EMAILS_KEY)
    if not raw:
        return {}
    try:
        return _normalize_map(json.loads(raw))
    except Exception:
        return {}


def set_kv_email_map(mapping: dict[str, str]) -> None:
    _kv_set(KV_ATHLETE_EMAILS_KEY, json.dumps(_normalize_map(mapping), separators=(",", ":")))


def get_email_to_athlete_map() -> dict[str, str]:
    """Merged allowlist used at login. Admin-added (KV) entries override the
    env seed so the same email can be re-pointed without a redeploy."""
    merged = get_env_email_map()
    merged.update(get_kv_email_map())
    return merged


def lookup_athlete(email: str) -> str | None:
    return get_email_to_athlete_map().get(email.lower())


def verify_admin(token: str | None) -> str | None:
    """Return the admin athleteId iff the session token is valid and maps to
    the admin account; otherwise None."""
    if not token:
        return None
    payload = verify_session_token(token)
    if not payload:
        return None
    sub = str(payload.get("sub", "")).lower()
    return sub if sub == ADMIN_ATHLETE_ID else None


def create_session_token(athlete_id: str, email: str, provider: str) -> str:
    """Create a signed JWT-like session token."""
    secret = get_jwt_secret()
    if not secret:
        raise RuntimeError("OAUTH_JWT_SECRET not configured")

    payload = {
        "sub": athlete_id,
        "email": email,
        "provider": provider,
        "iat": int(time.time()),
        "exp": int(time.time()) + 86400 * 365,  # 1 year (stay logged in)
    }

    payload_json = json.dumps(payload, separators=(",", ":"))
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode()).decode().rstrip("=")

    sig = hmac.new(secret.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()

    return f"{payload_b64}.{sig}"


def verify_session_token(token: str) -> dict | None:
    """Verify and decode a session token. Returns payload or None."""
    secret = get_jwt_secret()
    if not secret:
        return None

    parts = token.split(".")
    if len(parts) != 2:
        return None

    payload_b64, sig = parts
    expected_sig = hmac.new(secret.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(sig, expected_sig):
        return None

    # Decode payload
    padding = 4 - len(payload_b64) % 4
    if padding != 4:
        payload_b64 += "=" * padding

    try:
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
    except Exception:
        return None

    if payload.get("exp", 0) < time.time():
        return None

    return payload


def get_athlete_from_query(path: str) -> str | None:
    from urllib.parse import urlparse, parse_qs
    query = parse_qs(urlparse(path).query)
    values = query.get("athlete", [None])
    return values[0] if values and values[0] else None
