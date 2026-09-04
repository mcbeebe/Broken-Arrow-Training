"""Every athlete-facing coach endpoint requires a verified session.

These endpoints used to take `athleteId` from the request body or query and
believe it. With a guessed id and no credential you could read another
athlete's coach memory (injuries, goals, health context), register push
devices as them, read their telemetry, or spend their model budget through a
60-second Sonnet call.

The rules locked here:
  1. NO BEARER, NO SERVICE — every handler answers 401 before doing work.
  2. THE TOKEN IS THE IDENTITY — a body/query athleteId naming someone else
     is ignored, not honoured.
  3. FAIL CLOSED — with OAUTH_JWT_SECRET unset the answer is 503, never a
     silent success.
  4. THE CRON STILL RUNS — /api/coach/push?__cron=1 keeps its own
     CRON_SECRET check and must not be broken by session auth.
"""

import pathlib
import re
import sys

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import pytest

from api.auth import _helpers as H

COACH_DIR = _REPO_ROOT / "api" / "coach"
ENDPOINTS = ["chat", "insight", "memory", "push", "telemetry"]


class FakeHeaders(dict):
    """Stands in for BaseHTTPRequestHandler.headers."""


@pytest.fixture()
def secret(monkeypatch):
    monkeypatch.setenv("OAUTH_JWT_SECRET", "test-secret-for-auth-suite")
    return "test-secret-for-auth-suite"


def _token(athlete="mike", email="mike@example.com"):
    return H.create_session_token(athlete, email, "google")


# ── 1. the helper itself ────────────────────────────────────────────────

def test_valid_bearer_yields_the_token_subject(secret):
    ok, status, err, athlete = H.athlete_from_bearer(
        FakeHeaders({"Authorization": f"Bearer {_token('mike')}"}))
    assert (ok, status, err) == (True, 200, "")
    assert athlete == "mike"


@pytest.mark.parametrize("headers", [
    {},                                    # nothing at all
    {"Authorization": ""},                 # empty
    {"Authorization": "mike"},             # not a Bearer
    {"Authorization": "Bearer "},          # Bearer, no token
    {"Authorization": "Bearer garbage"},   # unparseable
    {"Authorization": "Bearer a.b"},       # right shape, wrong signature
])
def test_every_malformed_credential_is_401(secret, headers):
    ok, status, _err, athlete = H.athlete_from_bearer(FakeHeaders(headers))
    assert ok is False
    assert status == 401
    assert athlete == ""


def test_a_forged_signature_is_rejected(secret):
    payload = _token("mike").split(".")[0]
    ok, status, _e, _a = H.athlete_from_bearer(
        FakeHeaders({"Authorization": f"Bearer {payload}.{'0' * 64}"}))
    assert (ok, status) == (False, 401)


def test_a_token_minted_with_another_secret_is_rejected(secret, monkeypatch):
    stolen = _token("mike")
    monkeypatch.setenv("OAUTH_JWT_SECRET", "a-different-secret")
    ok, status, _e, _a = H.athlete_from_bearer(
        FakeHeaders({"Authorization": f"Bearer {stolen}"}))
    assert (ok, status) == (False, 401)


def test_fails_closed_when_the_secret_is_unset(monkeypatch):
    # A function deployed without OAUTH_JWT_SECRET must refuse service, not
    # wave everyone through.
    token = H.create_session_token("mike", "m@e.com", "google") \
        if H.get_jwt_secret() else None
    monkeypatch.delenv("OAUTH_JWT_SECRET", raising=False)
    ok, status, _e, _a = H.athlete_from_bearer(
        FakeHeaders({"Authorization": f"Bearer {token or 'x.y'}"}))
    assert ok is False
    assert status == 503


# ── 2. identity cannot be overridden ────────────────────────────────────

def test_a_non_admin_cannot_read_another_athlete(secret):
    """The core exploit: ask for someone else and get yourself."""
    ok, _s, _e, athlete = H.resolve_athlete(
        FakeHeaders({"Authorization": f"Bearer {_token('lori')}"}),
        requested="mike")
    assert ok is True
    assert athlete == "lori"


def test_the_admin_may_name_another_athlete(secret, monkeypatch):
    monkeypatch.setattr(H, "ADMIN_ATHLETE_ID", "mike", raising=False)
    ok, _s, _e, athlete = H.resolve_athlete(
        FakeHeaders({"Authorization": f"Bearer {_token('mike')}"}),
        requested="lori")
    assert ok is True
    assert athlete == "lori"


def test_resolve_athlete_still_requires_a_credential(secret):
    ok, status, _e, _a = H.resolve_athlete(FakeHeaders({}), requested="mike")
    assert (ok, status) == (False, 401)


# ── 3. every handler is actually wired to it ────────────────────────────

@pytest.mark.parametrize("name", ENDPOINTS)
def test_endpoint_imports_and_calls_the_shared_verifier(name):
    """Source-level guard: the point of the fix is that no handler goes back
    to reading athleteId out of the request. A new do_* method that forgets
    the check would be invisible to a behavioural test that never calls it."""
    src = (COACH_DIR / f"{name}.py").read_text()
    assert "from ..auth._helpers import" in src, f"{name}: no shared import"
    assert ("athlete_from_bearer(self.headers)" in src
            or "resolve_athlete(" in src), f"{name}: never verifies"


@pytest.mark.parametrize("name", ENDPOINTS)
def test_no_handler_takes_its_identity_from_the_request(name):
    """No `athlete_id = <something from body/query>` survives."""
    src = (COACH_DIR / f"{name}.py").read_text()
    offenders = re.findall(r'athlete_id\s*=\s*(?!.*athlete_from_bearer)'
                           r'.*(?:body\.get\("athleteId"|q\.get\("athleteId")',
                           src)
    assert offenders == [], f"{name}: identity still read from request: {offenders}"


@pytest.mark.parametrize("name", ENDPOINTS)
def test_every_request_handler_verifies_before_it_works(name):
    """Each do_GET/do_POST/do_DELETE body contains the auth call (do_OPTIONS
    is the CORS preflight and is exempt)."""
    src = (COACH_DIR / f"{name}.py").read_text()
    bodies = re.split(r"\n    def (do_\w+)\(self\):", src)
    # bodies == [preamble, name1, body1, name2, body2, ...]
    for verb, body in zip(bodies[1::2], bodies[2::2]):
        if verb == "do_OPTIONS":
            continue
        assert ("athlete_from_bearer" in body or "resolve_athlete" in body), \
            f"{name}.{verb} does work without verifying the caller"


# ── 4. the cron route survives ──────────────────────────────────────────

def test_push_cron_route_keeps_its_own_secret_check():
    """The scheduled fan-out has no session — it must still be gated by
    CRON_SECRET, and session auth must not have displaced that."""
    src = (COACH_DIR / "push.py").read_text()
    cron_branch = src[src.index('if q.get("__cron")'):]
    assert "_cron_authorized(self.headers)" in cron_branch[:400]
    # …and the cron check comes BEFORE the session check in do_GET.
    do_get = src[src.index("    def do_GET(self):"):]
    assert do_get.index("__cron") < do_get.index("athlete_from_bearer")
