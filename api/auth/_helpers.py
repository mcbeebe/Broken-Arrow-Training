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


# ─── Access requests ─────────────────────────────────────────────
# Would-be athletes submit an "add me" request from the login screen; it lands
# here (KV-backed) for the admin to approve (→ allowlist) or dismiss in the
# Settings → Athletes panel. Writes are unauthenticated, so we de-dupe by email
# and cap the queue to bound storage and abuse.
KV_ACCESS_REQUESTS_KEY = "auth:access_requests"
MAX_ACCESS_REQUESTS = 50
MAX_REQUEST_NOTE_LEN = 200


def get_access_requests() -> list[dict]:
    """Pending access requests, oldest first. [] if none or KV unconfigured."""
    raw = _kv_get(KV_ACCESS_REQUESTS_KEY)
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except Exception:
        return []
    return data if isinstance(data, list) else []


def set_access_requests(requests: list[dict]) -> None:
    _kv_set(KV_ACCESS_REQUESTS_KEY, json.dumps(requests, separators=(",", ":")))


def add_access_request(email: str, note: str) -> None:
    """Queue a request, de-duped by email (an existing one is refreshed) and
    capped at MAX_ACCESS_REQUESTS (oldest dropped first under a flood)."""
    email = email.strip().lower()
    note = note.strip()[:MAX_REQUEST_NOTE_LEN]
    requests = [
        r for r in get_access_requests()
        if str(r.get("email", "")).strip().lower() != email
    ]
    requests.append({"email": email, "note": note, "ts": int(time.time())})
    set_access_requests(requests[-MAX_ACCESS_REQUESTS:])


def remove_access_request(email: str) -> None:
    """Drop a queued request (on approve or dismiss). No KV write if absent."""
    email = email.strip().lower()
    requests = get_access_requests()
    remaining = [
        r for r in requests
        if str(r.get("email", "")).strip().lower() != email
    ]
    if len(remaining) != len(requests):
        set_access_requests(remaining)


def get_email_to_athlete_map() -> dict[str, str]:
    """Merged allowlist used at login. Admin-added (KV) entries override the
    env seed so the same email can be re-pointed without a redeploy."""
    merged = get_env_email_map()
    merged.update(get_kv_email_map())
    return merged


# ─── Notifications (transactional email via Resend) ──────────────
# Both ends of the access-request loop are closed by email: the admin is
# alerted when a request arrives, and the requester is told when they're
# approved (they aren't signed in yet, so push can't reach them). Sends are
# best-effort — a failed email must never break queueing or approval.
#
# Config (all optional; email is skipped entirely if RESEND_API_KEY is unset):
#   RESEND_API_KEY — Resend API key
#   EMAIL_FROM     — verified sender, e.g. "Attune <noreply@attune.coach>".
#                    The default uses Resend's sandbox sender, which only
#                    delivers to your own Resend account email — set a verified
#                    domain to reach real users.
#   NOTIFY_EMAIL   — where new-request alerts go (defaults to the admin's
#                    allowlisted email)
#   APP_URL        — sign-in link used in emails (default https://attune.coach)


def _esc(s: str) -> str:
    """Minimal HTML escape for user-supplied text dropped into email bodies."""
    return (
        s.replace("&", "&amp;").replace("<", "&lt;")
        .replace(">", "&gt;").replace('"', "&quot;")
    )


def app_url() -> str:
    return os.environ.get("APP_URL", "https://attune.coach").rstrip("/")


def get_admin_email() -> str | None:
    """Where new-request alerts go: NOTIFY_EMAIL if set, else the email that
    maps to the admin athlete in the allowlist."""
    override = os.environ.get("NOTIFY_EMAIL", "").strip().lower()
    if override:
        return override
    for email, athlete_id in get_email_to_athlete_map().items():
        if athlete_id == ADMIN_ATHLETE_ID:
            return email
    return None


def send_email(to: str, subject: str, html: str, text: str | None = None) -> bool:
    """Best-effort transactional email via Resend. Returns True on a 2xx,
    False otherwise (including when unconfigured). Never raises."""
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    sender = os.environ.get("EMAIL_FROM", "Attune <onboarding@resend.dev>").strip()
    if not api_key or not to:
        return False
    payload = {"from": sender, "to": [to], "subject": subject, "html": html}
    if text:
        payload["text"] = text
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return 200 <= resp.status < 300
    except Exception:
        return False


def notify_admin_of_request(requester_email: str, note: str) -> None:
    """Email the admin that someone asked for access. Best-effort."""
    admin_email = get_admin_email()
    if not admin_email:
        return
    note = note.strip()
    note_html = (
        f"<p style='margin:8px 0;color:#475569'>Note: {_esc(note)}</p>" if note else ""
    )
    html = (
        f"<p>New Attune access request from <strong>{_esc(requester_email)}</strong>.</p>"
        f"{note_html}"
        f"<p>Open <a href='{app_url()}'>Attune</a> → Settings → Athletes to approve or dismiss.</p>"
    )
    text = (
        f"New Attune access request from {requester_email}."
        + (f"\n\nNote: {note}" if note else "")
        + f"\n\nApprove in Attune → Settings → Athletes: {app_url()}"
    )
    send_email(admin_email, f"New Attune access request: {requester_email}", html, text)


def notify_user_approved(user_email: str) -> None:
    """Email a newly-approved athlete that they can sign in now. Best-effort."""
    url = app_url()
    html = (
        "<p>You're in! Your Attune account is ready.</p>"
        f"<p>Sign in with Google at <a href='{url}'>{url}</a> using this email address.</p>"
        "<p style='color:#475569'>— Mike</p>"
    )
    text = (
        "You're in! Your Attune account is ready.\n\n"
        f"Sign in with Google at {url} using this email address.\n\n— Mike"
    )
    send_email(user_email, "You're in — your Attune account is ready", html, text)


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


def decode_session_token(token: str | None) -> dict | None:
    """Public alias for `verify_session_token`. Named for the sync
    endpoint where "decode" reads more naturally than "verify" — both
    refer to the same HMAC-check-then-deserialize operation."""
    if not token:
        return None
    return verify_session_token(token)


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
