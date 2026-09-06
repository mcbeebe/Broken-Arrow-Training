"""The app-session 401 strings are a cross-boundary contract.

`src/utils/garmin.ts` (APP_SESSION_ERRORS) matches these three exact strings
to replace them with an athlete-facing "sign in to the app" message on the
Garmin connect form. Reword one here without updating the frontend copy and
production silently regresses to the raw 401 on the sign-in form — where it
reads like a Garmin credential failure — while both suites stay green,
because the frontend tests mock fetch with the frontend's own copies. This
test pins the backend side so drift is a loud, one-sided break.

If a string here must change, change the frontend list in the same PR.
"""

import pathlib
import sys

import pytest

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from api.auth import _helpers as H

# Keep in step with APP_SESSION_ERRORS in src/utils/garmin.ts.
MISSING_HEADER = "missing or invalid Authorization header"
BAD_TOKEN = "invalid or expired session token"
NO_SUBJECT = "session token missing subject"


@pytest.fixture()
def secret(monkeypatch):
    monkeypatch.setenv("OAUTH_JWT_SECRET", "test-secret-for-error-contract")


def test_no_bearer_header_emits_the_exact_frontend_matched_string(secret):
    ok, status, err, _ = H.athlete_from_bearer({})
    assert (ok, status) == (False, 401)
    assert err == MISSING_HEADER


def test_unverifiable_token_emits_the_exact_frontend_matched_string(secret):
    ok, status, err, _ = H.athlete_from_bearer({"Authorization": "Bearer not.a.jwt"})
    assert (ok, status) == (False, 401)
    assert err == BAD_TOKEN


def test_subjectless_token_emits_the_exact_frontend_matched_string(secret):
    token = H.create_session_token("", "mike@example.com", "google")
    ok, status, err, _ = H.athlete_from_bearer({"Authorization": f"Bearer {token}"})
    assert (ok, status) == (False, 401)
    assert err == NO_SUBJECT


def test_frontend_copy_matches_the_backend_strings():
    """Read the frontend's APP_SESSION_ERRORS block and require all three
    literals verbatim — the drift check in the other direction."""
    garmin_ts = (_REPO_ROOT / "src" / "utils" / "garmin.ts").read_text()
    for literal in (MISSING_HEADER, BAD_TOKEN, NO_SUBJECT):
        assert f"'{literal}'" in garmin_ts, (
            f"src/utils/garmin.ts no longer lists {literal!r} in "
            "APP_SESSION_ERRORS — the sign-in mapping is broken"
        )
