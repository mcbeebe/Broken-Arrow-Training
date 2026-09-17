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
import threading
import time
import urllib.request
import uuid
from dataclasses import dataclass

from garminconnect import Garmin
from garminconnect.exceptions import (
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
    GarminConnectTooManyRequestsError,
)

# Module-level cache: { athlete_id: Garmin client }
_client_cache: dict[str, Garmin] = {}


def _cache_key(athlete: str | None) -> str:
    return athlete or "__default__"


class GarminSessionExpired(RuntimeError):
    """No valid Garmin session could be restored for an athlete.

    This is an authentication problem, not a server fault: the saved
    session token is missing or has been expired/invalidated by Garmin, so
    the user needs to reconnect. Endpoints map it to HTTP 401 (not 500) so
    the frontend can tell "please reconnect" apart from a real outage.

    Subclasses RuntimeError so existing ``except RuntimeError`` handlers
    (e.g. auth.py's saved-session probe) keep working unchanged.
    """


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

    raise GarminSessionExpired(
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


# ── The MFA handshake ─────────────────────────────────────────────────
#
# Garmin's MFA is a two-request handshake bound to ONE in-memory client.
# `Garmin(..., return_on_mfa=True).login()` runs the sign-in, and when Garmin
# demands a code it parks the live HTTP session, the CSRF token and the
# login parameters ON THE CLIENT OBJECT and returns ("needs_mfa", None).
# `client.resume_login(_, code)` then submits the code using exactly that
# parked state — its first argument is ignored; everything is read off self.
#
# The previous implementation built a BRAND-NEW client for the code step and
# called login() on it. That re-ran the sign-in, which made Garmin issue a
# second challenge (a new code), and then submitted the code the athlete had
# typed — the first one — against it. Garmin rejected it every time, by
# construction, as "Widget MFA failed: <page title>". The athlete was
# permanently one code behind and no sequence of retries could succeed.
#
# So the pending client is kept here, in module memory, keyed by athlete,
# and the code step resumes THAT object. Serverless memory is not durable:
# a cold start or a different instance between the two requests loses it.
# When that happens the only correct move is to start a fresh challenge and
# SAY SO — `code_resent` — so the athlete knows to enter the newest code.
# Because the instance that just issued the new challenge is now the warm
# one, the very next submission almost always lands on it.

# Garmin codes are short-lived; past this, always start over.
PENDING_MFA_TTL_S = 300
# Wrong-code retries against ONE parked session. The widget flow re-sends the
# CSRF token scraped from the original page, which Garmin may not honour
# twice, so keep this low and let the resend path self-heal.
PENDING_MFA_MAX_ATTEMPTS = 2

MFA_CHALLENGE_MESSAGE = (
    "Garmin sent a verification code — by text, email or the Garmin "
    "authenticator app, depending on your Garmin security settings. "
    "Enter it below."
)
MFA_RESENT_MESSAGE = (
    "That code is no longer valid, so Garmin has sent a new one. Enter the "
    "newest code you received."
)


@dataclass
class _PendingMfa:
    client: Garmin
    email: str
    started: float
    attempts: int = 0


_pending_mfa: dict[str, _PendingMfa] = {}
# One lock for the registry AND the Garmin calls behind it: a double-tapped
# Connect must not race itself into two challenges. It is global rather
# than per-athlete on purpose — the app has one athlete in practice, a
# handful at most, and a second athlete's sign-in waiting out a first one's
# 10–25 s Garmin round-trip is bounded by maxDuration and preferable to a
# second lock to reason about. Revisit if that ever shows up in logs.
_pending_lock = threading.Lock()
# Per-process. In the logs, two step-2 lines with different ids for one
# athlete's single sign-in ARE the affinity miss — this is the number that
# decides whether the in-memory handshake is enough for this deployment.
_INSTANCE_ID = uuid.uuid4().hex[:8]


def _log_outcome(step: str, athlete: str | None, outcome: "AuthOutcome") -> None:
    print(
        f"[garmin-mfa] instance={_INSTANCE_ID} step={step} athlete={athlete or '-'} "
        f"reason={outcome.reason or '-'} status={outcome.status} "
        f"authenticated={outcome.authenticated} mfa_required={outcome.mfa_required}"
    )


@dataclass
class AuthOutcome:
    """What auth.py sends back, kept dumb so the logic is unit-testable."""
    status: int = 200
    authenticated: bool = False
    display_name: str | None = None
    mfa_required: bool = False
    code_resent: bool = False
    # challenge_sent | reused | resent | rejected | no_challenge | expired |
    # email_mismatch | too_many_attempts — the diagnostic, not the copy.
    reason: str | None = None
    error: str | None = None
    message: str | None = None

    def to_json(self, athlete: str | None) -> dict:
        body: dict = {"authenticated": self.authenticated, "athlete": athlete}
        if self.authenticated:
            body["displayName"] = self.display_name or "Garmin User"
            body["session_saved"] = True
        if self.mfa_required:
            body["mfa_required"] = True
        if self.code_resent:
            body["code_resent"] = True
        if self.reason:
            body["reason"] = self.reason
        if self.message:
            body["message"] = self.message
        if self.error:
            body["error"] = self.error
        return body


def _pending_state(key: str, email: str) -> tuple[_PendingMfa | None, str]:
    """The parked client for this athlete, or why there is not one."""
    rec = _pending_mfa.get(key)
    if rec is None:
        return None, "no_challenge"
    if time.monotonic() - rec.started > PENDING_MFA_TTL_S:
        _pending_mfa.pop(key, None)
        return None, "expired"
    if rec.email.strip().lower() != (email or "").strip().lower():
        _pending_mfa.pop(key, None)
        return None, "email_mismatch"
    return rec, "hit"


TOKEN_UNUSABLE_ERROR = (
    "Garmin signed you in but did not issue a session token this app can keep. "
    "This is a Garmin-side hiccup — try connecting again in a minute."
)


def _finish_sign_in(client: Garmin, athlete: str | None) -> AuthOutcome:
    """After Garmin says yes: keep the session, then load the profile.

    Two library facts shape the order here, both read from its source:

    1. `dumps()` serialises only the DI tokens. When Garmin's DI exchange
       fails the library falls back to a JWT_WEB cookie and is "signed in",
       but `dumps()` is then three nulls that `loads()` can never restore —
       every later request would fail with "reconnect". So a session without
       a DI token is refused up front rather than stored as junk.
    2. `login(return_on_mfa=True)` returns BEFORE the profile/settings load
       (`get_full_name()` is just `return self.full_name`), and
       `resume_login()` only soft-fetches it. Hydrating through the public
       `login(tokenstore=<json>)` path runs exactly that load. It is done
       AFTER saving: a profile hiccup must not burn a completed MFA.
       And it is only safe once (1) holds — a short tokenstore is treated
       as a file PATH, falls through to a credential login, and would fire
       a brand-new MFA challenge.
    """
    token_data = client.client.dumps()
    try:
        has_di = bool(json.loads(token_data).get("di_token"))
    except (ValueError, AttributeError):
        has_di = False
    if not has_di or len(token_data) <= 512:
        return AuthOutcome(status=502, reason="token_unusable", error=TOKEN_UNUSABLE_ERROR)

    save_session(client, athlete)
    try:
        client.login(tokenstore=token_data)
    except Exception as e:  # noqa: BLE001 — the session is saved; the name is cosmetic
        print(f"[garmin-mfa] instance={_INSTANCE_ID} profile hydration failed: {e}")
    return AuthOutcome(authenticated=True, display_name=client.get_full_name())


def _issue_challenge(key: str, athlete: str | None, email: str, password: str) -> AuthOutcome:
    """One fresh sign-in. Parks the client if Garmin wants a code."""
    _pending_mfa.pop(key, None)
    # Never silently restore a token that may belong to someone else.
    _kv_del(_session_key(athlete))
    _client_cache.pop(key, None)

    client = Garmin(email, password, return_on_mfa=True)
    try:
        mfa_status, _ = client.login()
    except GarminConnectAuthenticationError as e:
        return AuthOutcome(status=401, error=f"Garmin rejected the email or password: {e}")
    except GarminConnectTooManyRequestsError:
        return AuthOutcome(
            status=429,
            error="Garmin is rate-limiting sign-in attempts. Wait a few minutes and try again.",
        )
    except GarminConnectConnectionError as e:
        return AuthOutcome(status=502, error=f"Couldn't reach Garmin: {e}")

    if mfa_status == "needs_mfa":
        # Nothing on the completion path reads the password — resume_login
        # uses the parked session, hydration uses the token. Scrubbing it
        # turns any accidental credential re-login on this object into
        # "Username and password are required" instead of a new code.
        client.password = None
        _pending_mfa[key] = _PendingMfa(client=client, email=email, started=time.monotonic())
        return AuthOutcome(mfa_required=True, reason="challenge_sent", message=MFA_CHALLENGE_MESSAGE)

    return _finish_sign_in(client, athlete)


def start_garmin_login(
    athlete: str | None, email: str, password: str, *, force_new_code: bool = False,
) -> AuthOutcome:
    """Step 1. Sign in; if Garmin wants a code, park the client and say so.

    A repeat call within the TTL for the same account does NOT issue another
    challenge — a second Connect tap while the first code is in transit would
    otherwise invalidate the code the athlete is about to type. `force_new_code`
    is the explicit "send me a new one".
    """
    key = _cache_key(athlete)
    with _pending_lock:
        if not force_new_code:
            rec, state = _pending_state(key, email)
            if rec is not None:
                outcome = AuthOutcome(mfa_required=True, reason="reused", message=MFA_CHALLENGE_MESSAGE)
                _log_outcome("start", athlete, outcome)
                return outcome
        outcome = _issue_challenge(key, athlete, email, password)
        if force_new_code and outcome.mfa_required:
            outcome.code_resent = True
            outcome.reason = "resent"
            outcome.message = MFA_RESENT_MESSAGE
        _log_outcome("start", athlete, outcome)
        return outcome


def complete_garmin_mfa(
    athlete: str | None, email: str, password: str, code: str,
) -> AuthOutcome:
    outcome = _complete_garmin_mfa(athlete, email, password, code)
    _log_outcome("verify", athlete, outcome)
    return outcome


def _complete_garmin_mfa(
    athlete: str | None, email: str, password: str, code: str,
) -> AuthOutcome:
    """Step 2. Resume the PARKED client with the code — never a new login.

    If the parked client is gone (cold start, another instance, TTL, a
    different account), the code the athlete holds cannot be honoured by
    anything we have, so issue a fresh challenge and tell them a new code is
    on its way. That is the one honest answer; the old code returned a
    misleading Garmin error and left them one code behind forever.
    """
    key = _cache_key(athlete)
    with _pending_lock:
        rec, state = _pending_state(key, email)
        if rec is None:
            outcome = _issue_challenge(key, athlete, email, password)
            if outcome.mfa_required:
                outcome.code_resent = True
                outcome.reason = state
                outcome.message = MFA_RESENT_MESSAGE
            return outcome

        rec.attempts += 1
        try:
            rec.client.resume_login({}, code)
        except GarminConnectAuthenticationError as e:
            if rec.attempts >= PENDING_MFA_MAX_ATTEMPTS:
                outcome = _issue_challenge(key, athlete, email, password)
                if outcome.mfa_required:
                    outcome.code_resent = True
                    outcome.reason = "too_many_attempts"
                    outcome.message = MFA_RESENT_MESSAGE
                return outcome
            left = PENDING_MFA_MAX_ATTEMPTS - rec.attempts
            # The library's own wording ("Widget MFA failed: GARMIN
            # Authentication Application") is exactly the string that made
            # this bug unreadable for two weeks. It goes to the log, not
            # the athlete.
            print(f"[garmin-mfa] instance={_INSTANCE_ID} code rejected: {e}")
            return AuthOutcome(
                mfa_required=True,
                reason="rejected",
                error=(
                    "Garmin did not accept that code. Check it and try again — "
                    f"{left} attempt{'s' if left != 1 else ''} left before a new code is sent."
                ),
            )
        except GarminConnectTooManyRequestsError:
            return AuthOutcome(
                status=429,
                mfa_required=True,
                error="Garmin is rate-limiting verification attempts. Wait a few minutes and try again.",
            )
        except Exception as e:  # noqa: BLE001 — the parked session is unusable
            # A 401 here would leave the athlete on the code screen with no
            # live challenge behind it. The honest answer is a new one.
            print(f"[garmin-mfa] instance={_INSTANCE_ID} parked session unusable: {e}")
            outcome = _issue_challenge(key, athlete, email, password)
            if outcome.mfa_required:
                outcome.code_resent = True
                outcome.reason = "session_unusable"
                outcome.message = MFA_RESENT_MESSAGE
            return outcome

        _pending_mfa.pop(key, None)
        return _finish_sign_in(rec.client, athlete)


def pending_mfa_status(athlete: str | None) -> dict:
    """For the debug GET: is a challenge parked on THIS instance, and how old."""
    rec = _pending_mfa.get(_cache_key(athlete))
    if rec is None:
        return {"mfa_pending_here": False}
    return {
        "mfa_pending_here": True,
        "mfa_pending_age_s": round(time.monotonic() - rec.started),
        "mfa_attempts": rec.attempts,
    }


def get_athlete_from_query(path: str) -> str | None:
    """Extract the 'athlete' query parameter from a request path.

    This is what the caller *asked for*, not who they are. Endpoints must
    pass it through ``athlete_for_request`` rather than trusting it — see
    that function for why.
    """
    from urllib.parse import urlparse, parse_qs
    query = parse_qs(urlparse(path).query)
    values = query.get("athlete", [None])
    return values[0] if values and values[0] else None


def athlete_for_request(handler_self) -> tuple[bool, int, str, str]:
    """Authoritative Garmin athlete slug for a request.

    Returns ``(ok, status, error_message, athlete)``.

    ``?athlete=`` used to be the whole of the identity here, and it is a
    plain slug anyone can type. That made every Garmin route open: GET
    ``/api/garmin/health?athlete=mike`` returned Mike's HRV, resting heart
    rate and sleep to any stranger, ``/api/garmin/activities`` returned
    where he had been running, and DELETE ``/api/garmin/auth`` wiped his
    saved Garmin session. No token was involved at any point.

    The slug is not a separate namespace from the session token: the
    athlete id minted into the JWT's ``sub`` by api/auth/google.py is the
    same lowercase slug the client puts in ``?athlete=``. So the token can
    simply supply it, and the query parameter becomes a request rather than
    an assertion — honoured only for the admin account (which is how Coach
    Diagnostics reads another athlete), and otherwise ignored in favour of
    the caller's own id. Ignoring rather than rejecting a mismatch keeps a
    client that still sends a stale slug working instead of failing hard.

    Lower-cased on the way out because the KV session keys
    (``garmin_session_{athlete}``) were all written from the client's
    already-lowercased value; a differently-cased subject would look up an
    empty slot and silently present as "never connected".

    Fails closed: no token, a forged one, or an unset OAUTH_JWT_SECRET all
    return ``ok=False`` with nothing for the endpoint to act on.
    """
    from ..auth._helpers import resolve_athlete

    ok, status, err, athlete = resolve_athlete(
        handler_self.headers, get_athlete_from_query(handler_self.path)
    )
    return (ok, status, err, athlete.strip().lower())
