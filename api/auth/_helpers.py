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


def get_jwt_secret() -> str:
    return os.environ.get("OAUTH_JWT_SECRET", "")


def get_email_to_athlete_map() -> dict[str, str]:
    """Load email→athleteId mapping from env var.

    Format: ATHLETE_EMAILS=mike:mike@email.com,joel:joel@email.com,lori:lori@email.com,jim:jim@email.com
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


def lookup_athlete(email: str) -> str | None:
    email_map = get_email_to_athlete_map()
    return email_map.get(email.lower())


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
