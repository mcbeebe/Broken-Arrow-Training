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
  ACCESS_REQUEST_SALT: salt for the hashed client IP that keys the
    request-access throttle (google.py). Unset = throttle off.
  API_URL: public origin of this API, for the review links in the admin's
    access-request email. Default: https://$VERCEL_PROJECT_PRODUCTION_URL.
"""

import hashlib
import hmac
import json
import os
import re
import secrets
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


def _kv_get_strict(key: str) -> str | None:
    """Like _kv_get, but a failure raises instead of reading as "absent".

    Use it before any read-modify-write: a swallowed error looks exactly like
    an empty value, and writing back on top of it wipes what was there."""
    url = _kv_base()
    token = os.environ.get("KV_REST_API_TOKEN", "")
    if not url or not token:
        raise RuntimeError("KV not configured")
    req = urllib.request.Request(
        f"{url}/get/{urllib.parse.quote(key, safe='')}",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode()).get("result")


def _kv_multi_exec(commands: list[list[str]], timeout: float = 10) -> list:
    """Run commands as one Upstash transaction (/multi-exec — /pipeline is
    not atomic). Returns each command's result; raises if KV is unconfigured,
    unreachable, or any command errored."""
    url = _kv_base()
    token = os.environ.get("KV_REST_API_TOKEN", "")
    if not url or not token:
        raise RuntimeError("KV not configured")
    req = urllib.request.Request(
        f"{url}/multi-exec",
        data=json.dumps(commands).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        replies = json.loads(resp.read().decode())
    if not isinstance(replies, list) or len(replies) != len(commands):
        raise RuntimeError(f"unexpected multi-exec reply: {replies!r}"[:200])
    for r in replies:
        if not isinstance(r, dict) or "error" in r:
            raise RuntimeError(f"multi-exec command failed: {r!r}"[:200])
    return [r.get("result") for r in replies]


def kv_bump_counter(key: str, ttl_seconds: int, timeout: float = 3) -> int:
    """Increment a counter that always has an expiry, and return the new value.

    SET key 0 EX ttl NX, then INCR, in one transaction: the TTL is set before
    the first increment, so no lost call can leave a counter that never
    expires (which would lock an IP out for good). The short timeout keeps a
    hung KV from eating the auth functions' 15 s before the real work."""
    results = _kv_multi_exec([
        ["SET", key, "0", "EX", str(ttl_seconds), "NX"],
        ["INCR", key],
    ], timeout=timeout)
    return int(results[1])


def kv_unbump_counter(key: str, timeout: float = 3) -> int:
    """Give back one count taken by kv_bump_counter, and return the new value.

    For a counted attempt that turned out not to be one (the plan import
    refunds an upload the model never read). The key keeps its expiry."""
    return int(_kv_multi_exec([["DECR", key]], timeout=timeout)[0])


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


def get_kv_email_map_strict() -> dict[str, str]:
    """Like get_kv_email_map, but raises if the allowlist can't be read.

    Use it before writing the map back: the lenient read turns a KV hiccup
    into {}, and writing on top of that drops every admin-added athlete."""
    raw = _kv_get_strict(KV_ATHLETE_EMAILS_KEY)
    if raw is None:
        return {}
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("athlete allowlist is not an object")
    return _normalize_map(data)


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
    """Pending access requests, oldest first. [] if none or KV unconfigured.

    Lenient: a failed read also returns []. Fine for display, never for a
    read-modify-write — use get_access_requests_strict() there."""
    raw = _kv_get(KV_ACCESS_REQUESTS_KEY)
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except Exception:
        return []
    return data if isinstance(data, list) else []


def get_access_requests_strict() -> list[dict]:
    """Pending access requests; raises if the queue can't be read.

    An unreachable KV, an unconfigured KV and a stored value that isn't a JSON
    list all raise, so a caller can never mistake them for an empty queue."""
    raw = _kv_get_strict(KV_ACCESS_REQUESTS_KEY)
    if raw is None:
        return []
    data = json.loads(raw)
    if not isinstance(data, list):
        raise ValueError("access request queue is not a list")
    return data


def set_access_requests(requests: list[dict]) -> None:
    _kv_set(KV_ACCESS_REQUESTS_KEY, json.dumps(requests, separators=(",", ":")))


def add_access_request(email: str, note: str, source: str | None = None) -> bool:
    """queue_access_request, returning only whether the email was new."""
    return queue_access_request(email, note, source)[0]


def queue_access_request(email: str, note: str, source: str | None = None) -> tuple[bool, str]:
    """Queue a request, de-duped by email (an existing one is refreshed) and
    capped at MAX_ACCESS_REQUESTS (oldest dropped first under a flood).

    Raises — and writes nothing — if the current queue can't be read, so a
    KV hiccup can never replace every pending request with this one.
    `source` (already validated by the caller) is stored only when given.
    Each request carries a random `rid`, kept across refreshes, that the
    admin's review links are bound to: once the request is approved,
    dismissed or dropped, its links stop working.
    Returns (the email wasn't already queued, rid)."""
    email = email.strip().lower()
    note = note.strip()[:MAX_REQUEST_NOTE_LEN]
    current = get_access_requests_strict()
    previous = next((r for r in current
                     if str(r.get("email", "")).strip().lower() == email), None)
    requests = [r for r in current if r is not previous]
    rid = str((previous or {}).get("rid") or "") or secrets.token_urlsafe(12)
    entry = {"email": email, "note": note, "ts": int(time.time()), "rid": rid}
    if source:
        entry["source"] = source
    requests.append(entry)
    set_access_requests(requests[-MAX_ACCESS_REQUESTS:])
    return previous is None, rid


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


# Athlete data (synced state, tier, push and check-in records) is keyed by
# athlete ID and outlives the allowlist entry, so an ID removed in Settings
# is retired here, never handed to someone new. Re-approving the same email
# gets its old ID back.
KV_RETIRED_ATHLETE_IDS_KEY = "auth:retired_athlete_ids"


def get_retired_athlete_ids_strict() -> dict[str, str]:
    """athleteId → the email it belonged to, for IDs removed from the
    allowlist. Raises if it can't be read."""
    raw = _kv_get_strict(KV_RETIRED_ATHLETE_IDS_KEY)
    if raw is None:
        return {}
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("retired athlete IDs is not an object")
    return _normalize_map(data)


def retire_athlete_id(athlete_id: str, email: str) -> None:
    """Record that `athlete_id` (last used by `email`) left the allowlist.
    Raises if it can't be recorded; the caller then keeps the entry."""
    retired = get_retired_athlete_ids_strict()
    retired[athlete_id.strip().lower()] = email.strip().lower()
    _kv_set(KV_RETIRED_ATHLETE_IDS_KEY, json.dumps(retired, separators=(",", ":")))


_ATHLETE_ID_CHARS = re.compile(r"[^a-z0-9-]")
MAX_ATHLETE_ID_LEN = 40


def unique_athlete_id(seed: str, taken: set[str]) -> str:
    """An athlete ID for a new athlete that no one else already has.

    `seed` is an email (its local part is used, as the admin panel's
    deriveAthleteId does) or a preferred ID. A clash gets -2, -3, ...:
    approving mike@elsewhere.com must never sign a stranger in as `mike`."""
    local = seed.split("@", 1)[0] if "@" in seed else seed
    base = _ATHLETE_ID_CHARS.sub("", local.lower()).lstrip("-")[:MAX_ATHLETE_ID_LEN]
    base = base or "athlete"
    if base not in taken:
        return base
    n = 2
    while True:
        suffix = f"-{n}"
        candidate = base[:MAX_ATHLETE_ID_LEN - len(suffix)] + suffix
        if candidate not in taken:
            return candidate
        n += 1


def approve_access_request(email: str, preferred_id: str | None = None) -> tuple[str, bool]:
    """Let `email` sign in, and clear its queued request.

    An email that can already sign in keeps its athlete ID. A new one gets
    its retired ID if it had one, else `preferred_id` (or one derived from
    the email), made unique against every ID in use or retired and the
    admin's. Returns (athlete_id, newly_allowed). Raises, writing
    nothing, if the allowlist can't be read; raises if it can't be written."""
    email = email.strip().lower()
    env_map = get_env_email_map()
    kv_map = get_kv_email_map_strict()
    existing = env_map.get(email) or kv_map.get(email)
    if existing:
        _clear_request_after_approve(email)
        return existing, False
    athlete_id = next_athlete_id(email, preferred_id, env_map, kv_map)
    kv_map[email] = athlete_id
    set_kv_email_map(kv_map)
    _clear_request_after_approve(email)
    return athlete_id, True


def next_athlete_id(email: str, preferred_id: str | None,
                    env_map: dict[str, str] | None = None,
                    kv_map: dict[str, str] | None = None) -> str:
    """The ID approve_access_request would give `email` now. Raises if the
    allowlist or the retired IDs can't be read."""
    email = email.strip().lower()
    env_map = get_env_email_map() if env_map is None else env_map
    kv_map = get_kv_email_map_strict() if kv_map is None else kv_map
    retired = get_retired_athlete_ids_strict()
    returning = sorted(aid for aid, owner in retired.items() if owner == email)
    if returning:
        return returning[0]
    taken = set(env_map.values()) | set(kv_map.values()) | set(retired) | {ADMIN_ATHLETE_ID}
    return unique_athlete_id(preferred_id or email, taken)


def _clear_request_after_approve(email: str) -> None:
    """The allowlist write is the commit point: a queue entry left behind
    must not turn a done approval into an error."""
    try:
        remove_access_request(email)
    except Exception as e:
        print(f"[access-request] approved, but the queue entry stayed ({type(e).__name__})")


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
#   APP_URL        — sign-in link used in emails (default https://attune.coach/app)


def _esc(s: str) -> str:
    """Minimal HTML escape for user-supplied text dropped into email bodies."""
    return (
        s.replace("&", "&amp;").replace("<", "&lt;")
        .replace(">", "&gt;").replace('"', "&quot;").replace("'", "&#39;")
    )


def app_url() -> str:
    """The app's sign-in URL for emails. The app lives under /app/ (initiative
    003); `/` is the landing page."""
    return os.environ.get("APP_URL", "https://attune.coach/app").rstrip("/")


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
    if not api_key:
        print("[email] RESEND_API_KEY unset; not sent", flush=True)
        return False
    if not to:
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
            if 200 <= resp.status < 300:
                return True
            print(f"[email] Resend answered {resp.status}; not sent", flush=True)
            return False
    except Exception as e:
        # An HTTPError's code says why (403: unverified sender domain).
        code = getattr(e, "code", None)
        detail = f"{type(e).__name__} {code}" if code else type(e).__name__
        print(f"[email] send failed ({detail})", flush=True)
        return False


# ─── One-click review links ──────────────────────────────────────
# The admin's access-request email carries Approve and Dismiss links. Each is
# signed (HMAC of action, email and expiry, keyed off OAUTH_JWT_SECRET), so it
# can't be forged or pointed at another email. Opening one only shows a
# confirm page; the change happens on its button's POST, so a mail scanner
# that fetches every link in a message can't approve anyone.
REVIEW_ACTIONS = ("approve", "dismiss")
REVIEW_LINK_TTL_SECONDS = 7 * 86400


def api_url() -> str | None:
    """This API's public origin: API_URL if set, else Vercel's production
    domain. None when neither is known (the email then omits the links)."""
    override = os.environ.get("API_URL", "").strip().rstrip("/")
    if override:
        return override
    host = os.environ.get("VERCEL_PROJECT_PRODUCTION_URL", "").strip().strip("/")
    return f"https://{host}" if host else None


def _review_signature(action: str, email: str, rid: str, exp: int) -> str | None:
    secret = get_jwt_secret()
    if not secret:
        return None
    # A key of its own, so a review signature can never pass as a session
    # token's or the other way round.
    key = hmac.new(secret.encode(), b"attune:access-review:v1", hashlib.sha256).digest()
    msg = f"{action}\n{email.strip().lower()}\n{rid}\n{exp}".encode()
    return hmac.new(key, msg, hashlib.sha256).hexdigest()


def review_url(action: str, email: str, rid: str, now: float | None = None) -> str | None:
    """A signed link that opens the confirm page for one action on the
    queued request `rid`, valid REVIEW_LINK_TTL_SECONDS while that request
    is pending. None if it can't be signed."""
    base = api_url()
    exp = int(now if now is not None else time.time()) + REVIEW_LINK_TTL_SECONDS
    sig = _review_signature(action, email, rid, exp) if rid else None
    if not base or not sig or action not in REVIEW_ACTIONS:
        return None
    query = urllib.parse.urlencode({
        "review": action, "email": email.strip().lower(), "rid": rid,
        "exp": str(exp), "sig": sig,
    })
    return f"{base}/api/auth/google?{query}"


_EXP_RE = re.compile(r"[0-9]{1,12}")


def check_review(action: str, email: str, rid: str, exp: str, sig: str,
                 now: float | None = None) -> str:
    """'ok', 'expired' or 'invalid' for a review link's parameters. The
    caller still has to check that request `rid` is pending.

    'expired' only for a genuine signature, so the page never tells a
    forger anything about a guess."""
    if action not in REVIEW_ACTIONS or not _EXP_RE.fullmatch(exp) or not rid or not sig:
        return "invalid"
    expected = _review_signature(action, email, rid, int(exp))
    if not expected or not hmac.compare_digest(expected, sig):
        return "invalid"
    if int(exp) < int(now if now is not None else time.time()):
        return "expired"
    return "ok"


_BUTTON = (
    "display:inline-block;padding:10px 18px;border-radius:8px;"
    "font-weight:600;text-decoration:none;"
)


def notify_admin_of_request(requester_email: str, note: str, source: str | None = None,
                            rid: str | None = None) -> None:
    """Email the admin that someone asked for access, with signed Approve and
    Dismiss links when they can be built. Best-effort."""
    admin_email = get_admin_email()
    if not admin_email:
        print("[email] no admin email (NOTIFY_EMAIL unset, no admin on the allowlist)", flush=True)
        return
    note = note.strip()
    note_html = (
        f"<p style='margin:8px 0;color:#475569'>Note: {_esc(note)}</p>" if note else ""
    )
    source_html = (
        f"<p style='margin:8px 0;color:#475569'>Source: {_esc(source)}</p>" if source else ""
    )
    approve = review_url("approve", requester_email, rid) if rid else None
    dismiss = review_url("dismiss", requester_email, rid) if rid else None
    if approve and dismiss:
        buttons_html = (
            "<p style='margin:20px 0'>"
            f"<a href='{_esc(approve)}' style='{_BUTTON}background:#0f766e;color:#ffffff'>Approve</a>"
            "&nbsp;&nbsp;"
            f"<a href='{_esc(dismiss)}' style='{_BUTTON}background:#e2e8f0;color:#0f172a'>Dismiss</a>"
            "</p>"
            "<p style='color:#64748b;font-size:13px'>Each button opens a page to confirm. "
            "The links work once, for 7 days.</p>"
        )
        buttons_text = f"\n\nApprove: {approve}\nDismiss: {dismiss}\n(Each opens a page to confirm; the links work once, for 7 days.)"
    else:
        buttons_html = buttons_text = ""
    html = (
        f"<p>New Attune access request from <strong>{_esc(requester_email)}</strong>.</p>"
        f"{note_html}{source_html}{buttons_html}"
        f"<p>Or open <a href='{app_url()}'>Attune</a> → Settings → Athletes.</p>"
    )
    details = []
    if note:
        details.append(f"Note: {note}")
    if source:
        details.append(f"Source: {source}")
    text = (
        f"New Attune access request from {requester_email}."
        + ("\n\n" + "\n".join(details) if details else "")
        + buttons_text
        + f"\n\nOr approve in Attune → Settings → Athletes: {app_url()}"
    )
    send_email(admin_email, f"New Attune access request: {requester_email}", html, text)


def notify_user_approved(user_email: str) -> bool:
    """Email a newly-approved athlete that they can sign in now. Best-effort;
    True if Resend accepted it."""
    url = app_url()
    html = (
        "<p>You're in! Your Attune account is ready.</p>"
        f"<p style='margin:20px 0'><a href='{url}' style='{_BUTTON}background:#0f766e;color:#ffffff'>"
        "Sign in to Attune</a></p>"
        f"<p>Sign in with Google at <a href='{url}'>{url}</a> using this email address.</p>"
        "<p style='color:#475569'>— Mike</p>"
    )
    text = (
        "You're in! Your Attune account is ready.\n\n"
        f"Sign in with Google at {url} using this email address.\n\n— Mike"
    )
    return send_email(user_email, "You're in — your Attune account is ready", html, text)


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


def athlete_from_bearer(headers) -> tuple[bool, int, str, str]:
    """Authoritative athlete id from `Authorization: Bearer <session-jwt>`.

    Returns (ok, status, error_message, athlete_id).

    The token's `sub` claim IS the identity. A client cannot name a different
    athlete in the body or the query string and be believed — which is the
    whole point: every coach and device endpoint used to take `athleteId`
    from the request and trust it, so anyone who could guess an id could read
    another athlete's coach memory or spend their model budget.

    Fails CLOSED when OAUTH_JWT_SECRET is unset: a function deployed without
    the secret answers 503 rather than silently serving athlete data to
    anyone who asks. `api/apple/_helpers.authenticate` established that
    convention; this is the shared implementation behind it.
    """
    if not get_jwt_secret():
        return (False, 503, "server misconfigured: OAUTH_JWT_SECRET not set", "")
    try:
        header = headers.get("Authorization", "") or ""
    except Exception:
        header = ""
    if not header.startswith("Bearer "):
        return (False, 401, "missing or invalid Authorization header", "")
    claims = verify_session_token(header[len("Bearer "):].strip())
    if not claims:
        return (False, 401, "invalid or expired session token", "")
    athlete_id = str(claims.get("sub") or "").strip()
    if not athlete_id:
        return (False, 401, "session token missing subject", "")
    return (True, 200, "", athlete_id)


def resolve_athlete(headers, requested: str | None = None) -> tuple[bool, int, str, str]:
    """`athlete_from_bearer`, plus the one legitimate cross-athlete case.

    The admin account may read another athlete's data by naming them
    explicitly (Coach Diagnostics compares athletes side by side). Everyone
    else gets their own id no matter what they asked for — a mismatched
    `requested` is ignored rather than rejected, so a client still sending a
    stale athleteId keeps working instead of hard-failing mid-rollout.
    """
    ok, status, err, athlete_id = athlete_from_bearer(headers)
    if not ok:
        return (ok, status, err, athlete_id)
    wanted = (requested or "").strip()
    if wanted and wanted != athlete_id:
        try:
            header = headers.get("Authorization", "") or ""
        except Exception:
            header = ""
        token = header[len("Bearer "):].strip() if header.startswith("Bearer ") else None
        if verify_admin(token):
            return (True, 200, "", wanted)
    return (True, 200, "", athlete_id)


def get_athlete_from_query(path: str) -> str | None:
    from urllib.parse import urlparse, parse_qs
    query = parse_qs(urlparse(path).query)
    values = query.get("athlete", [None])
    return values[0] if values and values[0] else None
