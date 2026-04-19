"""Shared auth helpers for the Apple Health endpoint.

Duplicates the session-JWT verification from api/auth/_helpers.py so
that this Vercel function doesn't need cross-directory imports. Uses
the same OAUTH_JWT_SECRET, so tokens minted by /api/auth/google are
accepted here verbatim.
"""

import base64
import hashlib
import hmac
import json
import os
import time


def verify_session_token(token: str) -> dict | None:
    """Verify and decode a session JWT. Returns claims dict or None."""
    secret = os.environ.get("OAUTH_JWT_SECRET", "")
    if not secret:
        return None
    parts = token.split(".")
    if len(parts) != 2:
        return None
    payload_b64, sig = parts
    expected_sig = hmac.new(
        secret.encode(), payload_b64.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        return None
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


def authenticate(handler_self) -> tuple[bool, int, str, str]:
    """Validate Authorization: Bearer <session-jwt>.

    Returns (ok, status_code, error_message, athlete_id).

    Fails closed if OAUTH_JWT_SECRET is not configured on the server so
    a misdeployed function can't accidentally expose this endpoint.
    """
    if not os.environ.get("OAUTH_JWT_SECRET"):
        return (False, 503, "server misconfigured: OAUTH_JWT_SECRET not set", "")
    header = handler_self.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return (False, 401, "missing or invalid Authorization header", "")
    token = header[len("Bearer "):].strip()
    claims = verify_session_token(token)
    if not claims:
        return (False, 401, "invalid or expired session token", "")
    athlete_id = str(claims.get("sub") or "").strip()
    if not athlete_id:
        return (False, 401, "session token missing athleteId", "")
    return (True, 200, "", athlete_id)
