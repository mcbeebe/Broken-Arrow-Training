#!/usr/bin/env python3
"""Watches for the state that broke the app for two weeks, from outside CI.

The invariant: the site attune.coach serves and the API behind it are built
from the same commit, and that commit is the tip of the default branch.

Between Aug 31 and Sep 16 that held in neither direction. The frontend was
frozen at an Aug 30 build because the publish credential had expired, while
the API kept deploying on its own pipeline. On Sep 3 the API started
requiring an Authorization header the Aug 30 bundle did not send, and from
that moment every Coach and Garmin call returned "missing or invalid
Authorization header". Nothing was down, no run was red at the time anyone
looked, and no check anywhere asserted the two halves agreed.

The CI-side guards (check-credentials.sh in the required `test` job,
verify-published.sh after the publish) both need a run to happen. This one
does not: it asks the live site what it is serving on a schedule, so a
deploy that silently stops happening surfaces on its own. A scheduled run
that fails emails the repository owner, which is the part that was missing.

Exit 0 clean, 1 on drift or an unreachable endpoint.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

from _token_expiry import days_until

SITE_URL = os.environ.get("DRIFT_SITE_URL", "https://attune.coach/version.json")
API_URL = os.environ.get(
    "DRIFT_API_URL", "https://broken-arrow-training.vercel.app/api/version"
)
REPO = os.environ.get("GITHUB_REPOSITORY", "mcbeebe/Broken-Arrow-Training")
# A merge and the deploy it triggers are minutes apart. Without a grace
# window this check would fail every time it happened to fire inside one,
# and a monitor that cries wolf gets muted — which is the failure mode it
# exists to prevent.
GRACE_MINUTES = int(os.environ.get("DRIFT_GRACE_MINUTES", "45"))
WARN_DAYS = int(os.environ.get("DEPLOY_TOKEN_WARN_DAYS", "14"))
# Injectable so the drift branches can be tested against a local server.
# Nothing in CI sets it.
API_BASE = os.environ.get("GITHUB_API_BASE", "https://api.github.com").rstrip("/")

problems: list[str] = []
notes: list[str] = []


def fetch(url: str, token: str | None = None, headers: dict | None = None):
    req = urllib.request.Request(url, headers=headers or {})
    req.add_header("Cache-Control", "no-cache")
    req.add_header("User-Agent", "attune-deploy-drift-check")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=20) as res:
        # Header names are case-insensitive on the wire but a dict lookup
        # is not, so normalise once here rather than at each call site.
        headers = {k.lower(): v for k, v in res.headers.items()}
        return json.loads(res.read().decode()), headers


def short(sha: str) -> str:
    return (sha or "")[:7]


# ── What the default branch says should be live ────────────────────────
gh_token = os.environ.get("GITHUB_TOKEN", "")
try:
    repo_meta, _ = fetch(f"{API_BASE}/repos/{REPO}", gh_token)
    default_branch = repo_meta["default_branch"]
    head, _ = fetch(
        f"{API_BASE}/repos/{REPO}/commits/{default_branch}", gh_token
    )
    head_sha = head["sha"]
    head_date = datetime.fromisoformat(
        head["commit"]["committer"]["date"].replace("Z", "+00:00")
    )
except (urllib.error.URLError, KeyError, ValueError) as exc:
    print(f"::error::Could not read {REPO}'s default branch head: {exc}")
    sys.exit(1)

age_minutes = (datetime.now(timezone.utc) - head_date).total_seconds() / 60
in_flight = age_minutes < GRACE_MINUTES
print(f"default branch {default_branch} head: {short(head_sha)} ({age_minutes:.0f} min old)")
if in_flight:
    print(
        f"  within the {GRACE_MINUTES}-minute grace window — a deploy may still "
        "be running, so lagging behind head is not treated as drift"
    )

# ── What the site is actually serving ──────────────────────────────────
site_sha = None
try:
    site, _ = fetch(SITE_URL)
    site_sha = site.get("commit", "")
    print(f"attune.coach serving:          {short(site_sha)}")
except (urllib.error.URLError, ValueError) as exc:
    problems.append(
        f"{SITE_URL} is unreachable or not serving JSON ({exc}). Either the site "
        "is down or GitHub Pages is no longer publishing it."
    )

api_sha = None
try:
    api, _ = fetch(API_URL)
    # The API reports `commit` already shortened; commitFull is the whole thing.
    api_sha = api.get("commitFull") or api.get("commit", "")
    print(f"API serving:                   {short(api_sha)}")
except (urllib.error.URLError, ValueError) as exc:
    problems.append(f"{API_URL} is unreachable or not serving JSON ({exc}).")

# ── The two comparisons that matter ────────────────────────────────────
if site_sha and short(site_sha) != short(head_sha) and not in_flight:
    problems.append(
        f"attune.coach is serving {short(site_sha)} but {default_branch} is at "
        f"{short(head_sha)}. The frontend has stopped deploying — check the last "
        f"'Deploy to GitHub Pages' push run, and ATTUNE_DEPLOY_TOKEN first."
    )

if site_sha and api_sha and short(site_sha) != short(api_sha) and not in_flight:
    problems.append(
        f"The frontend ({short(site_sha)}) and the API ({short(api_sha)}) are built "
        "from different commits. This is the exact state that made every Coach and "
        "Garmin call fail with 'missing or invalid Authorization header' for two "
        "weeks: the API moved on and the browser bundle did not."
    )

# ── Rotate the credential before it expires, not after ─────────────────
deploy_token = os.environ.get("ATTUNE_DEPLOY_TOKEN", "")
if deploy_token:
    try:
        _, headers = fetch(f"{API_BASE}/rate_limit", deploy_token)
        raw = headers.get("github-authentication-token-expiration", "")
        if raw:
            days = days_until(raw)
            if days is None:
                notes.append(f"could not parse the reported token expiry ({raw})")
            elif days <= WARN_DAYS:
                problems.append(
                    f"ATTUNE_DEPLOY_TOKEN expires in {days} day(s), on {raw}. Rotate it "
                    "now: when it lapses, publishing stops and only this check notices."
                )
            else:
                notes.append(f"deploy token valid for {days} more days")
        else:
            notes.append("deploy token reports no expiry date")
    except (urllib.error.URLError, ValueError) as exc:
        notes.append(f"could not read deploy token expiry ({exc})")
else:
    notes.append("ATTUNE_DEPLOY_TOKEN not available to this run; expiry not checked")

for note in notes:
    print(f"note: {note}")

if problems:
    print()
    for problem in problems:
        print(f"::error::{problem}")
    sys.exit(1)

print("\nFrontend, API and default branch agree.")
