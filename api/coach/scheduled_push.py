"""Cron-driven daily-briefing nudges.

GET /api/coach/scheduled_push   (invoked hourly by Vercel Cron)

Why a *nudge* and not a server-rendered briefing: the rich daily read is
generated client-side from a snapshot the app assembles on open (readiness,
HRV, sleep, planned workout). The server never persists that snapshot, and
overnight HRV/sleep only enter the system when the app pulls Garmin — so a
6 AM server-generated read would be built on stale, pre-sleep data. The
nudge is the missing piece that closes the "I never got my morning
briefing" gap: it pulls the athlete into the app at each briefing period,
where the real read generates against freshly-synced data (and is now
preserved in the thread by useDailyBriefingLog).

For each subscribed device we look at its *local* time (from the timezone
it registered) and, if the local hour matches one of its configured
periods (default 6 / 13 / 20) and we haven't already nudged that device for
that period today, we send a Web Push deep-linking to /?view=coach. Dead
subscriptions (404/410) are pruned, mirroring the test-send path in push.py.

Cron protection: when CRON_SECRET is set (Vercel sets it automatically for
production crons) we require `Authorization: Bearer <CRON_SECRET>`. With no
secret configured the endpoint is open (dev / self-host).
"""

from __future__ import annotations

import hashlib
import os
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover - zoneinfo is stdlib on 3.9+
    ZoneInfo = None  # type: ignore

from ._core import (
    kv_get_json,
    kv_set_json,
    send_json,
    send_cors_preflight,
)
from ._push import send_web_push, vapid_configured
from .push import _load_subs, _save_subs, INDEX_KEY, DEFAULT_PERIODS


# Dedup TTL: comfortably longer than a day so a period fires at most once
# per local calendar day, but short enough that keys don't accumulate.
SENT_TTL_SECONDS = 26 * 3600

# Per-period notification copy, keyed by the local hour the period opens.
PERIOD_COPY = {
    6: {
        "title": "☀️ Your morning briefing is ready",
        "body": "Tap for today's readiness read and how to approach your workout.",
    },
    13: {
        "title": "\U0001f324️ Midday check-in",
        "body": "How's the day going? Tap for your coach's afternoon read.",
    },
    20: {
        "title": "\U0001f319 Evening wrap-up",
        "body": "Tap for tonight's recovery cues and what matters for tomorrow.",
    },
}


def _copy_for_hour(hour: int) -> dict:
    if hour in PERIOD_COPY:
        return PERIOD_COPY[hour]
    # A custom period the athlete configured — generic but still useful.
    return {
        "title": "\U0001f9e2 Your coach briefing is ready",
        "body": "Tap to read today's update.",
    }


def _local_now(tz: str) -> datetime:
    if ZoneInfo is not None:
        try:
            return datetime.now(ZoneInfo(tz or "UTC"))
        except Exception:
            try:
                return datetime.now(ZoneInfo("UTC"))
            except Exception:
                pass
    return datetime.now(timezone.utc)


def _endpoint_tag(endpoint: str) -> str:
    return hashlib.sha256(endpoint.encode("utf-8")).hexdigest()[:12]


def _sent_key(athlete_id: str, endpoint: str, local_date: str, hour: int) -> str:
    return f"coach_push_sent:{athlete_id}:{_endpoint_tag(endpoint)}:{local_date}:{hour}"


def run_scheduled_push() -> dict:
    """Fan out any due briefing nudges. Returns a summary dict."""
    if not vapid_configured():
        return {"ok": False, "error": "push not configured", "checked": 0, "sent": 0, "pruned": 0}

    index = kv_get_json(INDEX_KEY)
    athlete_ids = index if isinstance(index, list) else []

    checked = 0
    sent = 0
    pruned = 0

    for athlete_id in athlete_ids:
        devices = _load_subs(athlete_id)
        if not devices:
            continue
        kept: list[dict] = []
        changed = False
        for d in devices:
            endpoint = d.get("endpoint")
            if not endpoint:
                changed = True  # drop malformed record
                continue
            tz = d.get("timezone") or "UTC"
            periods = d.get("periods") or DEFAULT_PERIODS
            now_local = _local_now(tz)
            hour = now_local.hour
            local_date = now_local.strftime("%Y-%m-%d")
            checked += 1

            if hour not in periods:
                kept.append(d)
                continue

            sent_key = _sent_key(athlete_id, endpoint, local_date, hour)
            if kv_get_json(sent_key):
                kept.append(d)  # already nudged this device for this period today
                continue

            copy = _copy_for_hour(hour)
            payload = {
                "title": copy["title"],
                "body": copy["body"],
                "url": "/?view=coach",
                "tag": f"coach-briefing-{hour}",
            }
            try:
                ok, _status, prune = send_web_push(d, payload)
            except Exception:
                kept.append(d)  # transient send error — keep the device, retry next hour
                continue

            if ok:
                sent += 1
                kept.append(d)
                try:
                    kv_set_json(sent_key, {"at": int(time.time() * 1000)}, ex=SENT_TTL_SECONDS)
                except Exception:
                    pass
            elif prune:
                pruned += 1
                changed = True  # 404/410 — drop the dead subscription
            else:
                kept.append(d)

        if changed:
            _save_subs(athlete_id, kept)

    return {"ok": True, "checked": checked, "sent": sent, "pruned": pruned}


def _authorized(headers) -> bool:
    secret = os.environ.get("CRON_SECRET", "").strip()
    if not secret:
        # No secret configured → allow (dev / self-hosted). Vercel injects
        # the bearer token automatically for production cron protection.
        return True
    auth = headers.get("Authorization", "") if headers else ""
    return auth == f"Bearer {secret}"


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_GET(self):
        if not _authorized(self.headers):
            send_json(self, 401, {"error": "unauthorized"})
            return
        try:
            result = run_scheduled_push()
        except Exception as e:
            send_json(self, 500, {"error": str(e)})
            return
        send_json(self, 200, result)

    def do_POST(self):
        # Manual trigger (same auth) — handy for ops verification.
        self.do_GET()
