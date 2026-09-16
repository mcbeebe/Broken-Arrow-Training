"""Covers scripts/deploy/check-drift.py — the monitor that watches for the
state the app was actually in for two weeks.

Every case here is a bad day: the site frozen behind the default branch, the
frontend and API built from different commits, the credential about to
lapse. None of them can be reproduced against the live site, so the test
stands up local servers for GitHub, attune.coach and the API, and points the
script at all three.

The grace-window cases matter as much as the drift ones. A monitor that
fires while a deploy is still running gets muted, and a muted monitor is
exactly the hole this is filling.
"""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import threading
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "check-drift.py"

HEAD = "2657433" + "0" * 33
OLD = "d2a4156" + "0" * 33


def iso(minutes_ago: int) -> str:
    stamp = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
    return stamp.strftime("%Y-%m-%dT%H:%M:%SZ")


def serve(routes: dict, headers: dict | None = None):
    """routes maps a path prefix to (status, payload)."""

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            path = self.path.split("?")[0]
            match = next(
                (routes[k] for k in sorted(routes, key=len, reverse=True) if path.startswith(k)),
                None,
            )
            if match is None:
                self.send_error(404)
                return
            status, payload = match
            body = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            for key, value in (headers or {}).items():
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{server.server_address[1]}"


def run(*, head_sha=HEAD, head_age_minutes=600, site_sha=HEAD, api_sha=HEAD,
        expiry=None, token="token"):
    gh = serve({
        "/repos/owner/repo/commits/": (200, {
            "sha": head_sha,
            "commit": {"committer": {"date": iso(head_age_minutes)}},
        }),
        "/repos/owner/repo": (200, {"default_branch": "trunk"}),
        "/rate_limit": (200, {}),
    }, {"github-authentication-token-expiration": expiry} if expiry else None)
    site = serve({"/": (200, {"commit": site_sha})})
    api = serve({"/": (200, {"commit": api_sha[:7], "commitFull": api_sha})})

    env = {
        "PATH": "/usr/bin:/bin",
        "GITHUB_API_BASE": gh,
        "GITHUB_REPOSITORY": "owner/repo",
        "DRIFT_SITE_URL": f"{site}/version.json",
        "DRIFT_API_URL": f"{api}/api/version",
        "GITHUB_TOKEN": "gh",
        "ATTUNE_DEPLOY_TOKEN": token,
        "no_proxy": "127.0.0.1,localhost",
        "NO_PROXY": "127.0.0.1,localhost",
    }
    return subprocess.run(
        [sys.executable, str(SCRIPT)], env=env, capture_output=True, text=True
    )


def test_everything_in_step_passes():
    result = run()
    assert result.returncode == 0, result.stdout
    assert "agree" in result.stdout


def test_a_site_frozen_behind_the_default_branch_fails():
    """The Aug 31 -> Sep 16 state: publishing stopped, nothing said so."""
    result = run(site_sha=OLD, api_sha=OLD)
    assert result.returncode == 1
    assert "stopped deploying" in result.stdout
    assert "ATTUNE_DEPLOY_TOKEN" in result.stdout


def test_a_frontend_and_api_built_from_different_commits_fails():
    """The Sep 3 state, and the one that actually broke Garmin: the API moved
    on, the browser bundle did not, and every call 401'd."""
    result = run(site_sha=OLD, api_sha=HEAD, head_sha=HEAD)
    assert result.returncode == 1
    assert "different commits" in result.stdout


def test_a_deploy_still_in_flight_is_not_reported_as_drift():
    """A merge and its deploy are minutes apart. Failing inside that window
    would make this check cry wolf, and a muted monitor is the hole it fills."""
    result = run(site_sha=OLD, api_sha=OLD, head_age_minutes=5)
    assert result.returncode == 0, result.stdout
    assert "grace window" in result.stdout


def test_the_grace_window_expires():
    result = run(site_sha=OLD, api_sha=OLD, head_age_minutes=120)
    assert result.returncode == 1


def test_an_unreachable_site_fails():
    gh = serve({
        "/repos/owner/repo/commits/": (200, {
            "sha": HEAD, "commit": {"committer": {"date": iso(600)}},
        }),
        "/repos/owner/repo": (200, {"default_branch": "trunk"}),
    })
    env = {
        "PATH": "/usr/bin:/bin",
        "GITHUB_API_BASE": gh,
        "GITHUB_REPOSITORY": "owner/repo",
        # Nothing listening here.
        "DRIFT_SITE_URL": "http://127.0.0.1:9/version.json",
        "DRIFT_API_URL": "http://127.0.0.1:9/api/version",
        "GITHUB_TOKEN": "gh",
        "no_proxy": "127.0.0.1,localhost",
        "NO_PROXY": "127.0.0.1,localhost",
    }
    result = subprocess.run(
        [sys.executable, str(SCRIPT)], env=env, capture_output=True, text=True
    )
    assert result.returncode == 1
    assert "unreachable" in result.stdout


def test_an_imminent_token_expiry_fails_so_it_reaches_a_mailbox():
    """Unlike the PR check, this one FAILS on a near expiry. A failing
    scheduled run emails the owner, which is the only part of this that
    reaches someone who is not already looking at CI."""
    soon = (datetime.now(timezone.utc) + timedelta(days=5)).strftime("%Y-%m-%d %H:%M:%S UTC")
    result = run(expiry=soon)
    assert result.returncode == 1
    assert "expires in" in result.stdout


def test_a_distant_token_expiry_passes():
    far = (datetime.now(timezone.utc) + timedelta(days=200)).strftime("%Y-%m-%d %H:%M:%S UTC")
    result = run(expiry=far)
    assert result.returncode == 0, result.stdout
    assert "more days" in result.stdout
