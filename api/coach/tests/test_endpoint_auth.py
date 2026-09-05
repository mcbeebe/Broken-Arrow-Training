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
  4. THE CRON STILL RUNS — the scheduled fan-out keeps its own CRON_SECRET
     check and must not be broken by session auth, and must never acquire a
     session path: it touches EVERY athlete and has no caller identity.
"""

import os
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
    """The legacy in-push cron branch has no session — it must still be gated
    by CRON_SECRET, and session auth must not have displaced that."""
    src = (COACH_DIR / "push.py").read_text()
    cron_branch = src[src.index('if q.get("__cron")'):]
    assert "_cron_authorized(self.headers)" in cron_branch[:400]
    # …and the cron check comes BEFORE the session check in do_GET.
    do_get = src[src.index("    def do_GET(self):"):]
    assert do_get.index("__cron") < do_get.index("athlete_from_bearer")


def test_scheduled_push_rejects_a_caller_without_the_cron_secret():
    """/api/coach/scheduled_push fans out to EVERY athlete and carries no
    session, so the shared secret is the only thing standing in front of it.

    This route got its own file back when the project moved to Vercel Pro
    (the Hobby function cap had forced it to hide behind push.py?__cron=1).
    A new file is exactly where an auth check gets forgotten."""
    from api.coach import push as P

    os.environ["CRON_SECRET"] = "s3cret"
    try:
        assert P._cron_authorized(FakeHeaders({"Authorization": "Bearer s3cret"})) is True
        # No header, wrong secret, and a *session* bearer are all refused —
        # an athlete token must not open the all-athlete fan-out.
        assert P._cron_authorized(FakeHeaders()) is False
        assert P._cron_authorized(FakeHeaders({"Authorization": "Bearer wrong"})) is False
        assert P._cron_authorized(FakeHeaders({"Authorization": "Bearer eyJhbGciOi.abc"})) is False
    finally:
        os.environ.pop("CRON_SECRET", None)


def test_scheduled_push_checks_the_secret_before_doing_any_work():
    """Order matters: the fan-out must not start and then get refused."""
    src = (COACH_DIR / "scheduled_push.py").read_text()
    do_get = src[src.index("    def do_GET(self):"):]
    assert do_get.index("_cron_authorized") < do_get.index("run_scheduled_push"), \
        "scheduled_push runs the fan-out before checking CRON_SECRET"


def test_scheduled_push_has_no_session_path_at_all():
    """It has no caller identity to honour. If a future edit teaches this file
    about athleteId or session bearers, that is a privilege boundary moving."""
    src = (COACH_DIR / "scheduled_push.py").read_text()
    for forbidden in ("athlete_from_bearer", "resolve_athlete", "athleteId"):
        assert forbidden not in src, \
            f"scheduled_push.py references {forbidden} — it must stay session-free"


def test_the_cron_targets_a_real_file_not_a_rewrite():
    """Vercel's docs specify a cron `path` and always show it pointing at a
    real function route; they do not say the cron invoker resolves REWRITES.
    The schedule for a user-facing notification must not rest on that."""
    import json

    cfg = json.loads((_REPO_ROOT / "vercel.json").read_text())
    crons = cfg.get("crons") or []
    assert crons, "vercel.json defines no cron — the briefing fan-out has no schedule"
    paths = [c["path"] for c in crons]
    assert "/api/coach/scheduled_push" in paths, paths

    for c in crons:
        # every cron path must be backed by a file on disk…
        rel = c["path"].lstrip("/").split("?")[0]
        assert (_REPO_ROOT / f"{rel}.py").is_file(), \
            f"cron path {c['path']} is not backed by a real function file"
        # …and must not be shadowed by a rewrite.
        for rw in cfg.get("rewrites", []):
            assert rw["source"] != c["path"], \
                f"cron path {c['path']} is also a rewrite source — ambiguous routing"


def test_the_backstop_workflow_does_not_race_the_vercel_cron():
    """The coach_push_sent:* dedup is check-then-set, not atomic. Two
    schedulers firing at the same instant can both read the key as absent and
    both send, so an athlete gets the same briefing twice. The GitHub Actions
    backstop is therefore deliberately offset from the Vercel cron."""
    import json
    import re as _re

    wf = (_REPO_ROOT / ".github/workflows/coach-scheduled-push.yml").read_text()
    m = _re.search(r"- cron: '(\S+) (\S+) \S+ \S+ \S+'", wf)
    assert m, "could not read the backstop workflow's cron schedule"
    backstop_minute = m.group(1)

    cfg = json.loads((_REPO_ROOT / "vercel.json").read_text())
    for c in cfg.get("crons", []):
        if c["path"] != "/api/coach/scheduled_push":
            continue
        vercel_minute = c["schedule"].split()[0]
        assert backstop_minute != vercel_minute, (
            "the backstop workflow and the Vercel cron fire on the same minute; "
            "the non-atomic dedup means athletes can be notified twice"
        )


# ── 5. the browser is allowed to send the token ─────────────────────────

def test_cors_preflight_allows_the_authorization_header():
    """Requiring a bearer token is only half the change.

    A request carrying `Authorization` is never a CORS-simple request, so a
    caller on another origin — the iOS wrapper, or any deployment whose API
    base is off the app's own domain — preflights first and will not send
    the real request unless the preflight names the header. Omitting it
    turns "the coach needs a token" into "the coach is unreachable".
    """
    src = (COACH_DIR / "_core.py").read_text()
    preflight = src[src.index("def send_cors_preflight("):]
    allow = re.search(r'"Access-Control-Allow-Headers",\s*"([^"]+)"', preflight)
    assert allow, "send_cors_preflight sends no Allow-Headers at all"
    assert "Authorization" in allow.group(1), (
        "preflight omits Authorization — cross-origin coach calls will be "
        f"blocked by the browser (got {allow.group(1)!r})"
    )


def test_json_responses_also_advertise_the_authorization_header():
    """`send_json` carries the same CORS headers as the preflight; letting
    the two drift is how a preflight passes and the real call still fails."""
    src = (COACH_DIR / "_core.py").read_text()
    body = src[src.index("def send_json("):src.index("def send_cors_preflight(")]
    allow = re.search(r'"Access-Control-Allow-Headers",\s*"([^"]+)"', body)
    assert allow and "Authorization" in allow.group(1)
