"""Covers the failure paths of scripts/deploy/check-credentials.py.

These are the branches that only ever run on a bad day — an expired token, a
token scoped to the wrong repository — and the whole point of the script is
that it behaves correctly on exactly that day. They are unreachable against
the real API without deliberately breaking the secret, so the test stands up
a local server that answers the way GitHub would and points the script at it
through GITHUB_API_BASE.
"""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "check-credentials.py"


def make_server(status: int, payload: dict | None, extra_headers: dict | None = None):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            body = json.dumps(payload or {}).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            for key, value in (extra_headers or {}).items():
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):  # keep pytest output clean
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def run(server, **env):
    base = f"http://127.0.0.1:{server.server_address[1]}"
    environment = {
        "PATH": "/usr/bin:/bin",
        "GITHUB_API_BASE": base,
        "ATTUNE_DEPLOY_TOKEN": "token",
        "IS_FORK_PR": "false",
        # The sandbox proxy would otherwise intercept and rewrite the request.
        "no_proxy": "127.0.0.1,localhost",
        "NO_PROXY": "127.0.0.1,localhost",
    }
    environment.update(env)
    return subprocess.run(
        [sys.executable, str(SCRIPT)], env=environment, capture_output=True, text=True
    )


OK = {"permissions": {"push": True}, "default_branch": "gh-pages"}


def test_an_expired_token_fails_the_check():
    """The Aug 31 failure. GitHub answers 401 once a token lapses."""
    result = run(make_server(401, {"message": "Bad credentials"}))
    assert result.returncode == 1
    assert "expired or revoked" in result.stdout
    assert "::error::" in result.stdout


def test_a_token_scoped_to_the_wrong_repository_fails_the_check():
    """A fine-grained token sees only what it was granted; everything else is a 404."""
    result = run(make_server(404, {"message": "Not Found"}))
    assert result.returncode == 1
    assert "cannot see" in result.stdout


def test_a_read_only_token_fails_the_check():
    result = run(make_server(200, {"permissions": {"push": False}}))
    assert result.returncode == 1
    assert "no write access" in result.stdout


def test_a_missing_secret_fails_outside_fork_pull_requests():
    result = run(make_server(200, OK), ATTUNE_DEPLOY_TOKEN="")
    assert result.returncode == 1
    assert "is empty" in result.stdout


def test_a_missing_secret_is_tolerated_on_a_fork_pull_request():
    """Secrets are withheld from fork PRs. That is the event's doing, not a
    broken credential, and failing there would block contributions."""
    result = run(make_server(200, OK), ATTUNE_DEPLOY_TOKEN="", IS_FORK_PR="true")
    assert result.returncode == 0
    assert "::notice::" in result.stdout


def test_a_healthy_token_passes():
    result = run(make_server(200, OK))
    assert result.returncode == 0
    assert "::error::" not in result.stdout


@pytest.mark.parametrize(
    "expiry",
    ["2030-01-01 00:00:00 UTC", "2030-01-01T00:00:00Z", "2030-01-01 00:00:00 +0000"],
)
def test_a_distant_expiry_passes_in_every_format_github_uses(expiry):
    server = make_server(
        200, OK, {"github-authentication-token-expiration": expiry}
    )
    result = run(server)
    assert result.returncode == 0, result.stdout
    assert "days remaining" in result.stdout


def test_an_imminent_expiry_warns_without_blocking_the_merge():
    """Warn, do not fail. A token with nine days left still publishes, and
    failing every PR over it would be its own outage. The scheduled drift
    check is what turns this into mail."""
    from datetime import datetime, timedelta, timezone

    soon = (datetime.now(timezone.utc) + timedelta(days=9)).strftime("%Y-%m-%d %H:%M:%S UTC")
    result = run(make_server(200, OK, {"github-authentication-token-expiration": soon}))
    assert result.returncode == 0
    assert "::warning::" in result.stdout
    assert "expires in" in result.stdout


def test_an_unparsable_expiry_warns_rather_than_failing_the_build():
    result = run(
        make_server(200, OK, {"github-authentication-token-expiration": "sometime"})
    )
    assert result.returncode == 0
    assert "Could not parse" in result.stdout
