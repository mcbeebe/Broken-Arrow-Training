#!/usr/bin/env bash
#
# Closes the deploy loop: confirms the live site actually SERVES the commit
# we just pushed, rather than trusting that a successful push means a
# successful deploy.
#
# Pushing to gh-pages and serving from gh-pages are two different systems.
# The push can succeed while the site serves something else entirely —
# Pages pointed at the wrong branch or source, a failed Pages build, a
# custom domain whose CNAME got dropped. None of those touch this
# workflow's exit code, so without this step "deploy succeeded" means only
# "the git push succeeded".
#
# Usage: verify-published.sh <expected-full-sha> [url]
set -euo pipefail

EXPECTED="${1:?expected commit sha required}"
URL="${2:-https://attune.coach/version.json}"
TIMEOUT="${VERIFY_TIMEOUT_SECONDS:-300}"
INTERVAL="${VERIFY_INTERVAL_SECONDS:-10}"

deadline=$(( $(date +%s) + TIMEOUT ))
attempt=0
served=""

echo "Waiting for ${URL} to serve ${EXPECTED:0:7} (up to ${TIMEOUT}s)..."

while :; do
  attempt=$((attempt + 1))
  # Query string plus no-cache: version.json is small and frequently
  # replaced, and a CDN edge holding the previous one would make a good
  # deploy look like a failed one.
  body=$(curl -fsS --max-time 15 -H 'Cache-Control: no-cache' "${URL}?ci=${attempt}" 2>/dev/null || true)

  if [ -n "$body" ]; then
    served=$(printf '%s' "$body" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("commit",""))' 2>/dev/null || true)
    if [ "$served" = "$EXPECTED" ]; then
      echo "  attempt ${attempt}: serving ${served:0:7} — match."
      echo "attune.coach is live on $(git log -1 --format=%s "$EXPECTED" 2>/dev/null || echo "$EXPECTED")"
      exit 0
    fi
    echo "  attempt ${attempt}: serving ${served:0:7} (want ${EXPECTED:0:7}), waiting..."
  else
    echo "  attempt ${attempt}: no response yet, waiting..."
  fi

  if [ "$(date +%s)" -ge "$deadline" ]; then
    break
  fi
  sleep "$INTERVAL"
done

echo "::error::Published to gh-pages, but ${URL} is still serving '${served:-nothing}' after ${TIMEOUT}s instead of ${EXPECTED}. The git push succeeded, so the break is downstream: check that GitHub Pages for the target repo is set to 'Deploy from a branch' -> gh-pages / (root), that its Pages build did not fail, and that the CNAME still reads attune.coach."
exit 1
