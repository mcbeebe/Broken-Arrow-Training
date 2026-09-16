#!/usr/bin/env python3
"""Proves the credential the POST-MERGE publish will use still works, at a
point where failing still blocks the merge.

attune.coach served an Aug 30 build until Sep 16. ATTUNE_DEPLOY_TOKEN had
expired, so every post-merge push run failed at the publish step with
"Invalid username or token", and 37 merges shipped nothing. The failure was
never hidden — it was just never in front of anyone. The publish step only
runs on `push` to a publishing branch, so PR checks were green the whole
time while the thing they gate had been dead for two weeks. Meanwhile the
API kept deploying on its own pipeline, and on Sep 3 it began requiring an
Authorization header the Aug 30 bundle never sent: every Coach and Garmin
call failed from then until the token was replaced.

So this runs inside `test` — the required check — rather than in the deploy
job or a job of its own. An expired token now turns a PR red BEFORE the
merge whose publish it would have silently eaten. A separate job would need
branch protection updated to match it, and a required check nobody
remembered to add is a guard that is not there.

It deliberately does NOT push anything. A write probe was the first design:
create a scratch ref, push, delete. Two findings killed it. GitHub rejects
pushes outside refs/heads/ and refs/tags/ with a 403, so the tidy
refs/deploy-probe/ namespace would have failed every PR; and moving it to a
real branch means every PR creates and deletes a branch in the published
repo, which litters it the moment a cleanup push fails. An authenticated
API read distinguishes the same failures and cannot leave a mess behind.

Exit 0 clean, 1 on a credential that will not publish.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

from _token_expiry import days_until

TOKEN = os.environ.get("ATTUNE_DEPLOY_TOKEN", "")
TARGET = os.environ.get("DEPLOY_TARGET_REPO", "mcbeebe/attune-coach")
BRANCH = os.environ.get("DEPLOY_TARGET_BRANCH", "gh-pages")
WARN_DAYS = int(os.environ.get("DEPLOY_TOKEN_WARN_DAYS", "14"))
# Injectable so the failure paths that matter most — expired token, wrong
# repository scope — can be exercised by tests against a local server.
# Nothing in CI sets it.
API_BASE = os.environ.get("GITHUB_API_BASE", "https://api.github.com").rstrip("/")
FIX = (
    f"Regenerate a fine-grained PAT (Resource owner: the repo's owner; Repository "
    f"access: only {TARGET}; Permissions -> Repository -> Contents: Read and write) "
    f"and update the ATTUNE_DEPLOY_TOKEN secret under Settings -> Secrets and "
    f"variables -> Actions."
)


def fail(message: str) -> None:
    print(f"::error::{message}")
    sys.exit(1)


if not TOKEN:
    # Secrets are not exposed to pull requests from forks. That is a fact
    # about the event, not a broken credential, so it must not fail the run.
    if os.environ.get("IS_FORK_PR", "false") == "true":
        print("::notice::ATTUNE_DEPLOY_TOKEN is not exposed to fork pull requests — skipping the publish-credential check.")
        sys.exit(0)
    fail(
        f"ATTUNE_DEPLOY_TOKEN is empty. The post-merge publish to {TARGET} WILL fail "
        f"and attune.coach will silently stop updating. {FIX}"
    )

request = urllib.request.Request(
    f"{API_BASE}/repos/{TARGET}",
    headers={
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "attune-deploy-credential-check",
    },
)

print(f"Checking the publish credential against {TARGET} ({BRANCH})...")

try:
    with urllib.request.urlopen(request, timeout=20) as response:
        repo = json.loads(response.read().decode())
        headers = {k.lower(): v for k, v in response.headers.items()}
except urllib.error.HTTPError as exc:
    if exc.code == 401:
        fail(
            f"ATTUNE_DEPLOY_TOKEN is expired or revoked — GitHub rejected it outright. "
            f"This is exactly what froze attune.coach on an Aug 30 build for two weeks. {FIX}"
        )
    if exc.code == 404:
        fail(
            f"ATTUNE_DEPLOY_TOKEN is valid but cannot see {TARGET}. A fine-grained token "
            f"only reaches the repositories it was granted, and this one was not granted "
            f"that repository (or the repository was renamed). {FIX}"
        )
    fail(f"GitHub returned HTTP {exc.code} for {TARGET}: {exc.reason}. {FIX}")
except urllib.error.URLError as exc:
    fail(f"Could not reach the GitHub API to check the publish credential: {exc.reason}")

print("  auth   ok — the token is live and can see the repository")

# `permissions` reflects what this credential may do with this repository.
# Treated as advisory: GitHub does not always narrow it to a fine-grained
# token's own grants, so a read-only token can still report push: true. It
# is a cheap catch when it is right, and verify-published.sh is what makes
# a wrong answer loud rather than silent.
permissions = repo.get("permissions") or {}
if permissions.get("push") is False:
    fail(
        f"ATTUNE_DEPLOY_TOKEN can read {TARGET} but has no write access. The publish "
        f"step needs Contents: Read and write; a read-only token fails only AFTER the "
        f"merge, when nobody is looking. {FIX}"
    )
print(f"  access ok — reports push: {permissions.get('push', 'unknown')}")

if repo.get("default_branch") and BRANCH not in (repo["default_branch"], "gh-pages"):
    print(f"::warning::Publishing to {BRANCH}, which is not {TARGET}'s default branch.")

# ── Rotate before it lapses, not after ─────────────────────────────────
# GitHub reports the token's expiry on any authenticated response. Classic
# tokens set to never expire omit the header entirely.
raw_expiry = headers.get("github-authentication-token-expiration", "").strip()
if not raw_expiry:
    print("  expiry: none reported (a token with no expiry date)")
    sys.exit(0)

days_left = days_until(raw_expiry)
if days_left is None:
    print(f"::warning::Could not parse the token expiry GitHub reported ({raw_expiry}); skipping the expiry check.")
    sys.exit(0)

if days_left <= WARN_DAYS:
    print(
        f"::warning::ATTUNE_DEPLOY_TOKEN expires in {days_left} day(s), on {raw_expiry}. "
        f"Rotate it before then or attune.coach stops updating. The scheduled deploy-drift "
        f"check fails once it is this close, so this also arrives by email."
    )
else:
    print(f"  expiry: {days_left} days remaining ({raw_expiry})")
