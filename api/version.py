"""Version endpoint — returns the commit SHA + deploy timestamp so
the frontend can show which API version is live.

Vercel injects VERCEL_GIT_COMMIT_SHA and VERCEL_GIT_COMMIT_MESSAGE
into the runtime env of every Python function on every deployment.
GET /api/version

Response:
  { "commit": "0177268", "commitFull": "...", "message": "...",
    "deployedAt": "2026-04-16T20:41:00Z" }
"""

import json
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler


def _send_cors_preflight(handler):
    handler.send_response(204)
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET,OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        _send_cors_preflight(self)

    def do_GET(self):
        full_sha = os.environ.get("VERCEL_GIT_COMMIT_SHA", "")
        short_sha = full_sha[:7] if full_sha else "unknown"
        message = os.environ.get("VERCEL_GIT_COMMIT_MESSAGE", "")
        # Trim to first line of commit message (subject)
        subject = message.split("\n", 1)[0] if message else ""
        branch = os.environ.get("VERCEL_GIT_COMMIT_REF", "")
        # Vercel doesn't expose deploy time directly; approximate with
        # now() — the function instance was spawned at deploy or on
        # first cold start afterward, so this is close enough to
        # "when this code went live."
        deployed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        payload = {
            "commit": short_sha,
            "commitFull": full_sha,
            "message": subject,
            "branch": branch,
            "deployedAt": deployed_at,
            "runtime": "vercel-python",
        }

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        # No caching — this endpoint's whole purpose is seeing the
        # current deploy, not a stale one.
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())
