"""The Garmin MFA code step must resume the sign-in that asked for it.

Garmin's MFA is a two-request handshake bound to ONE in-memory client:
login() parks the live session and CSRF token on the object and returns
"needs_mfa"; resume_login() submits the code from that same object. Every
new login() is a NEW challenge, and Garmin invalidates the previous code.

The old code step built a brand-new client and called login() on it. That
made Garmin send a second code, then submitted the first — rejected every
time as "Widget MFA failed: GARMIN Authentication Application". The athlete
was permanently one code behind; no sequence of retries could succeed.

Everything here runs against a fake Garmin that models exactly those
semantics (the first test proves the fake is faithful), so the rules are:
  1. ONE CHALLENGE, ONE CODE — a correct code on the parked client signs in
     with exactly one code ever sent.
  2. NEVER A FRESH LOGIN WITH AN OLD CODE — the code step constructs no
     client and passes no prompt_mfa; it resumes.
  3. A LOST CHALLENGE SAYS SO — serverless memory is not durable; when the
     parked client is gone the reply is a NEW code plus `code_resent`, and
     the newest code then works.
  4. THE OWNER CANNOT DOUBLE-TAP INTO A DEAD CODE — repeating step 1 reuses
     the pending challenge; only an explicit resend issues another.
"""

from __future__ import annotations

import importlib
import io
import json
import pathlib
import sys
import time

import pytest

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# conftest.py has already made `garminconnect` importable (real or stub).
import garminconnect.exceptions as gx  # noqa: E402

from api.auth import _helpers as H  # noqa: E402

S = importlib.import_module("api.garmin._session")
AUTH = importlib.import_module("api.garmin.auth")


# ── A Garmin that behaves like the real one ─────────────────────────────

class GarminWorld:
    """The account on Garmin's side: password, whether MFA is on, and every
    code it has ever sent. Only the LAST code is valid — a new challenge
    invalidates the previous one, exactly as the live service does."""

    def __init__(self, password="pw", mfa=True):
        self.password = password
        self.mfa = mfa
        self.codes: list[str] = []
        self.constructions: list[dict] = []
        # Garmin's DI token exchange can fail; the library then signs in on
        # a JWT_WEB cookie and dumps() serialises three nulls.
        self.di_exchange_fails = False
        # The profile endpoints are the flakiest part of a Garmin sign-in.
        self.profile_load_fails = False
        # A parked session can die for reasons that are not the code.
        self.resume_raises: Exception | None = None

    @property
    def codes_sent(self) -> int:
        return len(self.codes)

    @property
    def current_code(self) -> str:
        return self.codes[-1]

    def issue(self) -> str:
        code = f"{100000 + len(self.codes):06d}"
        self.codes.append(code)
        return code


class _InnerClient:
    """dumps() exactly as the library does: three DI fields, a real JWT-sized
    token on the happy path, three nulls after the JWT_WEB fallback."""

    def __init__(self, outer, world):
        self._outer = outer
        self._world = world
        self.di_token = None

    def dumps(self) -> str:
        assert self._outer._authed, "dumps() before authentication"
        if self._world.di_exchange_fails:
            return json.dumps({"di_token": None, "di_refresh_token": None, "di_client_id": None})
        self.di_token = "eyJ." + "x" * 700 + f".{self._outer.username}"
        return json.dumps({"di_token": self.di_token, "di_refresh_token": "r" * 40, "di_client_id": "cid"})


def make_fake_garmin(world: GarminWorld):
    class FakeGarmin:
        def __init__(self, email=None, password=None, is_cn=False, prompt_mfa=None, return_on_mfa=False):
            world.constructions.append({"email": email, "prompt_mfa": prompt_mfa, "return_on_mfa": return_on_mfa})
            self.username = email
            self.password = password
            self.prompt_mfa = prompt_mfa
            self.return_on_mfa = return_on_mfa
            self._challenge: str | None = None
            self._authed = False
            # Populated ONLY by the profile load, which login() skips when
            # return_on_mfa=True and resume_login() merely attempts.
            self.full_name = None
            self.client = _InnerClient(self, world)

        def login(self, tokenstore=None):
            if tokenstore:
                # The library treats a short tokenstore as a file PATH and
                # falls through to a credential login — a fresh challenge.
                if len(tokenstore) <= 512 or not json.loads(tokenstore).get("di_token"):
                    return self._credential_login()
                if world.profile_load_fails:
                    raise gx.GarminConnectConnectionError("socialProfile: 502 Bad Gateway")
                self._authed = True
                self.full_name = "Mike Beebe"
                return None, None
            return self._credential_login()

        def _credential_login(self):
            if not self.username or not self.password:
                raise gx.GarminConnectAuthenticationError("Username and password are required")
            if self.password != world.password:
                raise gx.GarminConnectAuthenticationError("Widget authentication failed: 'Invalid'")
            if not world.mfa:
                self._authed = True
                if not self.return_on_mfa:
                    self.full_name = "Mike Beebe"
                return None, None
            # A NEW challenge on every login — the old code is now dead.
            self._challenge = world.issue()
            if self.return_on_mfa:
                return "needs_mfa", None
            if self.prompt_mfa:
                self.resume_login({}, self.prompt_mfa())
                return None, None
            raise gx.GarminConnectAuthenticationError("MFA Required but no prompt_mfa mechanism supplied")

        def resume_login(self, _client_state, mfa_code):
            if world.resume_raises is not None:
                raise world.resume_raises
            if self._challenge is None:
                raise gx.GarminConnectAuthenticationError("Missing widget MFA context")
            if mfa_code != world.current_code or mfa_code != self._challenge:
                raise gx.GarminConnectAuthenticationError(
                    "Widget MFA failed: GARMIN Authentication Application")
            self._authed = True
            # The real resume_login soft-fetches the profile and continues
            # on failure; model the failure so hydration has to be explicit.
            return None, None

        def get_full_name(self):
            return self.full_name

    return FakeGarmin


# ── Harness ─────────────────────────────────────────────────────────────

@pytest.fixture()
def world(monkeypatch):
    monkeypatch.setenv("OAUTH_JWT_SECRET", "test-secret-for-mfa-resume")
    w = GarminWorld()
    monkeypatch.setattr(S, "Garmin", make_fake_garmin(w))
    kv: dict[str, str] = {}
    monkeypatch.setattr(S, "_kv_set", lambda k, v, ex=0: kv.__setitem__(k, v))
    monkeypatch.setattr(S, "_kv_get", lambda k: kv.get(k))
    monkeypatch.setattr(S, "_kv_del", lambda k: kv.pop(k, None))
    S._pending_mfa.clear()
    S._client_cache.clear()
    w.kv = kv
    yield w
    S._pending_mfa.clear()
    S._client_cache.clear()


def post(body: dict | None, athlete="mike", bearer=True):
    """Drive auth.py's do_POST without a socket; return (status, json)."""
    h = AUTH.handler.__new__(AUTH.handler)
    raw = json.dumps(body).encode() if body is not None else b""
    headers = {"Content-Length": str(len(raw))}
    if bearer:
        headers["Authorization"] = f"Bearer {H.create_session_token(athlete, 'mike@example.com', 'google')}"
    h.headers = headers
    h.path = "/api/garmin/auth"
    h.rfile = io.BytesIO(raw)
    sent: list[tuple[int, dict]] = []
    h._send_json = lambda status, data: sent.append((status, data))
    h.do_POST()
    assert len(sent) == 1, "handler must answer exactly once"
    return sent[0]


CREDS = {"email": "mike@example.com", "password": "pw"}


# ── 0. the fake is faithful ─────────────────────────────────────────────

def test_the_fake_models_the_real_handshake(world):
    """Documents the bug: a second login() is a new challenge that kills the
    first code. Resuming the ORIGINAL object with the ORIGINAL code works."""
    first = S.Garmin("mike@example.com", "pw", return_on_mfa=True)
    assert first.login() == ("needs_mfa", None)
    code_a = world.current_code

    # What the old code step did: a brand-new client, login again, old code.
    second = S.Garmin("mike@example.com", "pw", prompt_mfa=lambda: code_a)
    with pytest.raises(gx.GarminConnectAuthenticationError, match="Widget MFA failed"):
        second.login()
    assert world.codes_sent == 2, "the fresh login issued a second code"

    # The parked object with its own code (now stale too — Garmin moved on).
    with pytest.raises(gx.GarminConnectAuthenticationError):
        first.resume_login({}, code_a)

    # And the correct handshake: park, then resume with the code it got.
    world.codes.clear()
    third = S.Garmin("mike@example.com", "pw", return_on_mfa=True)
    third.login()
    third.resume_login({}, world.current_code)
    assert third.get_full_name() is None, (
        "the library's resume_login only soft-fetches the profile; the name "
        "arrives through login(tokenstore=…) — which is why _finish_sign_in exists")
    third.login(tokenstore=third.client.dumps())
    assert third.get_full_name() == "Mike Beebe"


# ── 1. one challenge, one code ──────────────────────────────────────────

def test_step_one_parks_the_challenge_and_asks_for_a_code(world):
    status, body = post(CREDS)
    assert status == 200
    assert body["mfa_required"] is True
    assert body["authenticated"] is False
    assert body["reason"] == "challenge_sent"
    assert "phone" not in body["message"].lower(), "we do not know how Garmin delivers it"
    assert world.codes_sent == 1
    assert "mike" in S._pending_mfa


def test_the_parked_client_is_resumed_and_the_session_saved(world):
    """THE FIX. Exactly one code is ever sent, and it works."""
    post(CREDS)
    status, body = post({**CREDS, "mfa_code": world.current_code})
    assert status == 200
    assert body["authenticated"] is True
    assert body["displayName"] == "Mike Beebe"
    assert body["session_saved"] is True
    assert world.codes_sent == 1, "a second code means a second login was started"
    saved = json.loads(world.kv["garmin_session_mike"])
    assert saved["di_token"].endswith("mike@example.com")
    assert "mike" not in S._pending_mfa, "a completed challenge is not left parked"


def test_the_code_step_constructs_no_client_and_passes_no_prompt(world):
    """Pins the bug class itself, not just its symptom."""
    post(CREDS)
    post({**CREDS, "mfa_code": world.current_code})
    assert len(world.constructions) == 1, world.constructions
    assert world.constructions[0]["return_on_mfa"] is True
    assert all(c["prompt_mfa"] is None for c in world.constructions)


# ── 2. the owner cannot double-tap into a dead code ─────────────────────

def test_a_second_connect_tap_reuses_the_pending_challenge(world):
    post(CREDS)
    status, body = post(CREDS)
    assert (status, body["mfa_required"], body["reason"]) == (200, True, "reused")
    assert world.codes_sent == 1, "a second tap must not invalidate the code in transit"
    _, done = post({**CREDS, "mfa_code": world.current_code})
    assert done["authenticated"] is True


def test_an_explicit_resend_issues_a_new_code_and_says_so(world):
    post(CREDS)
    status, body = post({**CREDS, "resend": True})
    assert status == 200
    assert body["mfa_required"] is True
    assert body["code_resent"] is True
    assert body["reason"] == "resent"
    assert world.codes_sent == 2
    _, done = post({**CREDS, "mfa_code": world.current_code})
    assert done["authenticated"] is True


# ── 3. a lost challenge says so, and the newest code then works ─────────

def test_a_lost_parked_client_sends_a_new_code_and_names_the_reason(world):
    post(CREDS)
    stale = world.current_code
    S._pending_mfa.clear()  # cold start / another instance between the taps

    status, body = post({**CREDS, "mfa_code": stale})
    assert status == 200
    assert body["authenticated"] is False
    assert body["mfa_required"] is True, "stay on the code screen"
    assert body["code_resent"] is True
    assert body["reason"] == "no_challenge"
    assert "new one" in body["message"]
    assert world.codes_sent == 2

    # The instance that just issued the new code is the warm one now.
    _, done = post({**CREDS, "mfa_code": world.current_code})
    assert done["authenticated"] is True
    assert world.codes_sent == 2


def test_an_expired_challenge_is_replaced_not_resumed(world, monkeypatch):
    post(CREDS)
    S._pending_mfa["mike"].started -= S.PENDING_MFA_TTL_S + 1
    _, body = post({**CREDS, "mfa_code": world.current_code})
    assert body["mfa_required"] is True
    assert body["code_resent"] is True
    assert body["reason"] == "expired"
    assert world.codes_sent == 2


def test_another_account_cannot_resume_this_athletes_challenge(world):
    post(CREDS)
    _, body = post({"email": "someone@else.com", "password": "pw", "mfa_code": world.current_code})
    assert body["authenticated"] is False
    assert body["reason"] == "email_mismatch"
    assert body["code_resent"] is True


# ── 4. wrong codes ──────────────────────────────────────────────────────

def test_a_wrong_code_is_rejected_once_then_a_new_code_is_sent(world):
    post(CREDS)
    status, body = post({**CREDS, "mfa_code": "000000"})
    assert status == 200
    assert body["mfa_required"] is True
    assert body["reason"] == "rejected"
    assert "1 attempt left" in body["error"]
    assert "Widget MFA failed" not in body["error"], "the library's wording stays in the log"
    assert "GARMIN Authentication Application" not in body["error"]
    assert not body.get("code_resent")
    assert world.codes_sent == 1, "one wrong code does not burn the challenge"

    _, body = post({**CREDS, "mfa_code": "000000"})
    assert body["mfa_required"] is True
    assert body["code_resent"] is True
    assert body["reason"] == "too_many_attempts"
    assert world.codes_sent == 2

    _, done = post({**CREDS, "mfa_code": world.current_code})
    assert done["authenticated"] is True


def test_a_correct_code_after_one_wrong_one_still_works(world):
    post(CREDS)
    post({**CREDS, "mfa_code": "000000"})
    _, done = post({**CREDS, "mfa_code": world.current_code})
    assert done["authenticated"] is True
    assert world.codes_sent == 1


# ── 5. the edges around the handshake ───────────────────────────────────

def test_a_wrong_password_is_a_401_and_no_challenge(world):
    status, body = post({"email": "mike@example.com", "password": "nope"})
    assert status == 401
    assert body["authenticated"] is False
    assert "rejected the email or password" in body["error"]
    assert world.codes_sent == 0
    assert "mike" not in S._pending_mfa


def test_an_account_without_mfa_signs_in_directly(world):
    world.mfa = False
    status, body = post(CREDS)
    assert status == 200
    assert body["authenticated"] is True
    assert world.kv.get("garmin_session_mike")


def test_the_code_step_without_credentials_is_refused(world):
    status, body = post({"mfa_code": "123456"})
    assert status == 401
    assert world.codes_sent == 0


def test_step_one_never_falls_back_to_the_owners_env_credentials(world, monkeypatch):
    """GARMIN_EMAIL/GARMIN_PASSWORD are the owner's account. Another athlete
    sending force_fresh with no credentials must get a 401, not a sign-in as
    the owner stored under their own slug."""
    monkeypatch.setenv("GARMIN_EMAIL", "mike@example.com")
    monkeypatch.setenv("GARMIN_PASSWORD", "pw")
    status, body = post({"force_fresh": True}, athlete="jim")
    assert status == 401
    assert world.codes_sent == 0
    assert len(world.constructions) == 0
    assert "garmin_session_jim" not in world.kv


def test_no_bearer_means_garmin_is_never_contacted(world):
    status, body = post(CREDS, bearer=False)
    assert status == 401
    assert world.codes_sent == 0
    assert len(world.constructions) == 0


def test_the_debug_get_reports_a_parked_challenge(world):
    post(CREDS)
    st = S.pending_mfa_status("mike")
    assert st["mfa_pending_here"] is True
    assert st["mfa_attempts"] == 0
    assert S.pending_mfa_status("nobody") == {"mfa_pending_here": False}


# ── 6. what the library does AFTER Garmin says yes ──────────────────────

def test_the_session_is_saved_before_the_profile_is_loaded_and_the_name_is_real(world):
    """login(return_on_mfa=True) returns before the profile load and
    resume_login only soft-fetches it; without explicit hydration the
    athlete is "Garmin User" and unit_system is unset on the cached client."""
    post(CREDS)
    _, body = post({**CREDS, "mfa_code": world.current_code})
    assert body["displayName"] == "Mike Beebe"
    assert world.kv.get("garmin_session_mike"), "saved regardless of hydration"


def test_a_no_mfa_account_gets_its_real_name_too(world):
    world.mfa = False
    _, body = post(CREDS)
    assert body["authenticated"] is True
    assert body["displayName"] == "Mike Beebe"


def test_a_profile_hiccup_after_a_correct_code_does_not_burn_the_sign_in(world):
    """Save first, hydrate second. The name is cosmetic; the completed MFA is
    not — a failed profile fetch after Garmin accepted the code must leave
    the athlete signed in with the session saved, not back at square one."""
    world.profile_load_fails = True
    post(CREDS)
    status, body = post({**CREDS, "mfa_code": world.current_code})
    assert status == 200
    assert body["authenticated"] is True
    assert body["displayName"] == "Garmin User"
    assert world.kv.get("garmin_session_mike"), "the session must be saved regardless"
    assert world.codes_sent == 1


def test_hydration_never_starts_a_new_sign_in(world):
    """A tokenstore the library would mistake for a PATH falls through to a
    credential login and a fresh challenge. The DI guard must stop that
    before login(tokenstore=…) is ever called."""
    post(CREDS)
    codes_before = world.codes_sent
    post({**CREDS, "mfa_code": world.current_code})
    assert world.codes_sent == codes_before


def test_a_session_without_a_di_token_is_refused_not_stored(world):
    """JWT_WEB fallback: signed in, but dumps() is three nulls that loads()
    can never restore. Storing it means every later request fails with
    'reconnect'. Refuse it up front, and do not fire another challenge."""
    world.di_exchange_fails = True
    post(CREDS)
    status, body = post({**CREDS, "mfa_code": world.current_code})
    assert status == 502
    assert body["authenticated"] is False
    assert body["reason"] == "token_unusable"
    assert "garmin_session_mike" not in world.kv
    assert world.codes_sent == 1


# ── 7. the deployment must give a resume time to finish ─────────────────

def test_garmin_functions_have_time_to_complete_a_resume():
    """The completion path carries several 30 s request timeouts (verify
    endpoints, DI exchange, JWT_WEB fallback). At maxDuration 30 a kill
    mid-resume consumes the code with nothing saved."""
    cfg = json.loads((_REPO_ROOT / "vercel.json").read_text())
    assert cfg["functions"]["api/garmin/*.py"]["maxDuration"] >= 60


# ── 8. the public handshake this relies on still exists upstream ────────

@pytest.mark.skipif(
    not hasattr(importlib.import_module("garminconnect").Garmin, "resume_login"),
    reason="stub library — contract check runs where the real garminconnect is installed",
)
def test_the_library_still_offers_the_public_handshake():
    """api/requirements.txt allows >=0.3.2,<0.4.0. A 0.3.x release that
    drops return_on_mfa or resume_login would break sign-in on the next
    unrelated deploy; fail here instead."""
    import inspect
    real = importlib.import_module("garminconnect").Garmin
    assert "return_on_mfa" in inspect.signature(real.__init__).parameters
    assert "tokenstore" in inspect.signature(real.login).parameters
    assert callable(getattr(real, "resume_login", None))
    assert callable(getattr(real, "get_full_name", None))


# ── 9. the parked client cannot re-login by accident, and a dead one resends ─

def test_the_parked_client_has_no_password(world):
    post(CREDS)
    parked = S._pending_mfa["mike"].client
    assert parked.password is None
    # Which is what makes an accidental credential re-login on it raise
    # instead of quietly firing another code.
    with pytest.raises(gx.GarminConnectAuthenticationError, match="required"):
        parked.login()
    assert world.codes_sent == 1


def test_a_parked_session_that_dies_for_another_reason_gets_a_fresh_challenge(world):
    """A 401 here would strand the athlete on the code screen with no live
    challenge behind it. The honest answer is a new code, and saying so."""
    post(CREDS)
    world.resume_raises = gx.GarminConnectConnectionError("SSO session evicted")
    status, body = post({**CREDS, "mfa_code": world.current_code})
    assert status == 200
    assert body["mfa_required"] is True
    assert body["code_resent"] is True
    assert body["reason"] == "session_unusable"
    assert world.codes_sent == 2
    world.resume_raises = None
    _, done = post({**CREDS, "mfa_code": world.current_code})
    assert done["authenticated"] is True
