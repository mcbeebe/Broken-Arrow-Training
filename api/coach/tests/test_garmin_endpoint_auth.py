"""Every Garmin endpoint requires a verified session.

`?athlete=mike` used to be the whole of the identity on these four routes,
and it is a plain slug anyone can type. With no credential at all you could
GET /api/garmin/health?athlete=mike and read an athlete's HRV, resting heart
rate, sleep and Body Battery; GET /api/garmin/activities and see where they
had been running; and DELETE /api/garmin/auth to wipe their saved Garmin
session out from under them.

The rules locked here:
  1. NO BEARER, NO SERVICE — every handler answers 401 before touching KV
     or Garmin.
  2. THE TOKEN IS THE IDENTITY — `?athlete=` naming someone else is ignored
     for an ordinary athlete, honoured only for the admin account.
  3. FAIL CLOSED — with OAUTH_JWT_SECRET unset the answer is 503.
  4. THE BROWSER CAN SEND IT — a bearer makes even a GET non-simple, so the
     CORS preflight has to name Authorization or the routes are unreachable
     from any other origin (the iOS wrapper included).
"""

import importlib
import pathlib
import re
import sys
import types

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import pytest

from api.auth import _helpers as H

GARMIN_DIR = _REPO_ROOT / "api" / "garmin"
ENDPOINTS = ["auth", "health", "activities", "activity_detail"]


class FakeRequest:
    """Stands in for the BaseHTTPRequestHandler bits _session reads."""

    def __init__(self, headers=None, path="/api/garmin/health"):
        self.headers = dict(headers or {})
        self.path = path


@pytest.fixture()
def secret(monkeypatch):
    monkeypatch.setenv("OAUTH_JWT_SECRET", "test-secret-for-garmin-auth")
    return "test-secret-for-garmin-auth"


def _load_session_module():
    """Import api.garmin._session with `garminconnect` stubbed out.

    That library is a deploy-time dependency and is not installed for the
    unit suite, but it is imported at module scope. Skipping on ImportError
    would quietly void every behavioural test in this file — precisely the
    ones that prove the endpoints are no longer open — so stand in a stub
    instead. Nothing here touches Garmin; only the identity resolution.
    """
    if "garminconnect" not in sys.modules:
        stub = types.ModuleType("garminconnect")
        stub.Garmin = type("Garmin", (), {})
        sys.modules["garminconnect"] = stub
    return importlib.import_module("api.garmin._session")


@pytest.fixture()
def athlete_for_request():
    return _load_session_module().athlete_for_request


def _token(athlete="mike", email="mike@example.com"):
    return H.create_session_token(athlete, email, "google")


def _bearer(athlete="mike"):
    return {"Authorization": f"Bearer {_token(athlete)}"}


# ── 1. the resolver ─────────────────────────────────────────────────────

def test_valid_bearer_yields_the_token_subject(secret, athlete_for_request):
    ok, status, err, athlete = athlete_for_request(
        FakeRequest(_bearer("mike"), "/api/garmin/health?days=7"))
    assert (ok, status, err) == (True, 200, "")
    assert athlete == "mike"


@pytest.mark.parametrize("headers", [
    {},                                     # nothing at all — the old world
    {"Authorization": ""},                  # empty
    {"Authorization": "mike"},              # no scheme
    {"Authorization": "Basic bWlrZQ=="},    # wrong scheme
    {"Authorization": "Bearer "},           # scheme, no token
    {"Authorization": "Bearer not.a.jwt"},  # unparsable
])
def test_no_usable_credential_is_401(secret, athlete_for_request, headers):
    ok, status, _err, athlete = athlete_for_request(
        FakeRequest(headers, "/api/garmin/health?athlete=mike"))
    assert ok is False
    assert status == 401
    assert athlete == ""


def test_a_token_signed_with_another_secret_is_refused(monkeypatch, athlete_for_request):
    monkeypatch.setenv("OAUTH_JWT_SECRET", "attacker-secret")
    forged = _token("mike")
    monkeypatch.setenv("OAUTH_JWT_SECRET", "the-real-secret")
    ok, status, _err, _athlete = athlete_for_request(
        FakeRequest({"Authorization": f"Bearer {forged}"}))
    assert (ok, status) == (False, 401)


def test_fails_closed_when_the_signing_secret_is_unset(monkeypatch, athlete_for_request):
    monkeypatch.setenv("OAUTH_JWT_SECRET", "temporarily-set")
    token = _token("mike")
    monkeypatch.delenv("OAUTH_JWT_SECRET", raising=False)
    ok, status, _err, athlete = athlete_for_request(
        FakeRequest({"Authorization": f"Bearer {token}"}))
    assert ok is False
    assert status == 503, "an unset secret must not read as 'anyone may pass'"
    assert athlete == ""


# ── 2. the query parameter is a request, not a claim ────────────────────

def test_one_athlete_cannot_name_another(secret, monkeypatch, athlete_for_request):
    """The whole vulnerability in one assertion: jim asks for mike's data
    and gets his own back, not mike's."""
    monkeypatch.setenv("ADMIN_ATHLETE_ID", "admin")
    ok, _status, _err, athlete = athlete_for_request(
        FakeRequest(_bearer("jim"), "/api/garmin/health?athlete=mike"))
    assert ok is True
    assert athlete == "jim"


def test_the_admin_may_name_another_athlete(secret, monkeypatch, athlete_for_request):
    """Coach Diagnostics reads another athlete's data by naming them; that
    one legitimate cross-athlete path has to survive."""
    monkeypatch.setenv("ADMIN_ATHLETE_ID", "mike")
    ok, _status, _err, athlete = athlete_for_request(
        FakeRequest(_bearer("mike"), "/api/garmin/health?athlete=jim"))
    assert ok is True
    assert athlete == "jim"


def test_the_subject_is_lower_cased(secret, athlete_for_request):
    """KV session keys were all written from the client's lowercased value —
    a differently-cased subject would miss the slot and present as
    'never connected' rather than erroring."""
    ok, _status, _err, athlete = athlete_for_request(
        FakeRequest(_bearer("Mike")))
    assert ok is True
    assert athlete == "mike"


# ── 3. source-level guards ──────────────────────────────────────────────

@pytest.mark.parametrize("name", ENDPOINTS)
def test_endpoint_uses_the_shared_resolver(name):
    src = (GARMIN_DIR / f"{name}.py").read_text()
    assert "athlete_for_request" in src, f"{name}: never resolves an athlete"


@pytest.mark.parametrize("name", ENDPOINTS)
def test_no_handler_takes_its_identity_from_the_query(name):
    """`get_athlete_from_query` still exists — it reads what was *asked
    for* — but no endpoint may use it as the identity again."""
    src = (GARMIN_DIR / f"{name}.py").read_text()
    assert "get_athlete_from_query" not in src, (
        f"{name}: identity read straight from the query string")


@pytest.mark.parametrize("name", ENDPOINTS)
def test_every_request_handler_verifies_before_it_works(name):
    """Each do_GET/do_POST/do_DELETE body contains the auth call; do_OPTIONS
    is the CORS preflight and is exempt."""
    src = (GARMIN_DIR / f"{name}.py").read_text()
    bodies = re.split(r"\n    def (do_\w+)\(self\):", src)
    verbs = list(zip(bodies[1::2], bodies[2::2]))
    assert verbs, f"{name}: no handlers found — did the file shape change?"
    for verb, body in verbs:
        if verb == "do_OPTIONS":
            continue
        assert "athlete_for_request(self)" in body, \
            f"{name}.{verb} does work without verifying the caller"


@pytest.mark.parametrize("name", ENDPOINTS)
def test_the_guard_precedes_the_garmin_call(name):
    """Verifying *after* reaching Garmin would still leak the work (and the
    rate limit) to an unauthenticated caller."""
    src = (GARMIN_DIR / f"{name}.py").read_text()
    bodies = re.split(r"\n    def (do_\w+)\(self\):", src)
    for verb, body in zip(bodies[1::2], bodies[2::2]):
        if verb == "do_OPTIONS" or "get_client(" not in body:
            continue
        assert body.index("athlete_for_request(self)") < body.index("get_client("), \
            f"{name}.{verb} reaches Garmin before verifying the caller"


@pytest.mark.parametrize("name", ENDPOINTS)
def test_cors_preflight_allows_the_authorization_header(name):
    """Requiring a bearer is only half the change: a request carrying it is
    never CORS-simple, so a cross-origin caller preflights first and will
    not send the real request unless the preflight names the header."""
    src = (GARMIN_DIR / f"{name}.py").read_text()
    allow = re.search(r'"Access-Control-Allow-Headers",\s*"([^"]+)"', src)
    assert allow, f"{name}: sends no Allow-Headers at all"
    assert "Authorization" in allow.group(1), (
        f"{name}: preflight omits Authorization — the browser will block "
        f"every cross-origin call (got {allow.group(1)!r})")


def test_the_client_sends_the_token_on_every_garmin_call():
    """A server that demands a token and a client that never sends one is
    an outage, not a fix. Every fetch in src/utils/garmin.ts must carry the
    header."""
    src = (_REPO_ROOT / "src" / "utils" / "garmin.ts").read_text()
    calls = [m for m in re.finditer(r"fetch\(", src)]
    assert len(calls) >= 7, f"expected the 7 known call sites, found {len(calls)}"
    for m in calls:
        window = src[m.start():m.start() + 400]
        assert "garminAuthHeaders()" in window, (
            "a fetch in garmin.ts sends no session token:\n"
            + window.splitlines()[0])
