"""Hourly briefing fan-out — the Vercel cron entry point.

GET /api/coach/scheduled_push → run_scheduled_push() over every subscribed
athlete, sending the 6 AM / 1 PM / 8 PM nudge to each device in that device's
LOCAL time. Idempotent per device/local-day/period via the coach_push_sent:*
dedup keys, so an extra invocation is harmless.

WHY THIS FILE EXISTS AGAIN
--------------------------
The fan-out was folded into push.py behind `?__cron=1` (with a vercel.json
rewrite pointing here) to stay under the Vercel HOBBY plan's 12-serverless-
function cap. The project is on PRO now, so the cap no longer applies and the
cron gets a real route back.

That matters for more than tidiness: Vercel's docs specify a cron `path` and
consistently show it pointing at an actual function route, but say nothing
about whether the cron invoker resolves REWRITES. Rather than bet a
user-facing notification schedule on undocumented behaviour, the cron now
targets a path backed by a real file. The rewrite stays for existing callers.

AUTH: this endpoint fans out to EVERY athlete and carries no session, so it
keeps its own shared-secret check — `Authorization: Bearer <CRON_SECRET>`,
which is exactly what Vercel Cron sends when CRON_SECRET is set. With no
secret configured it is open (dev / self-hosted), matching push.py.
"""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler

from ._core import send_json, send_cors_preflight
from .push import run_scheduled_push, _cron_authorized


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_GET(self):
        # The secret check comes first and there is no session path at all —
        # nothing here may fall through to athlete-scoped logic.
        if not _cron_authorized(self.headers):
            send_json(self, 401, {"error": "unauthorized"})
            return
        try:
            send_json(self, 200, run_scheduled_push())
        except Exception as e:
            send_json(self, 500, {"error": str(e)})
