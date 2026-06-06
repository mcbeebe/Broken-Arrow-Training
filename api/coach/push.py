"""Coach push-notification subscription registry + test sender.

POST /api/coach/push   body { action, athleteId, ... }
  action=subscribe   { subscription:{endpoint,keys}, timezone, periods }
  action=unsubscribe { endpoint? }   (omit endpoint to clear all devices)
  action=test        — send a test push to all of the athlete's devices
GET  /api/coach/push?athleteId=mike → { subscribed, count, timezone, vapidConfigured }

Subscriptions are stored per-athlete (a list of device records) with the
device timezone + desired periods, which the cron in scheduled_push.py
reads to fan out 6 AM / 1 PM / 8 PM nudges in each athlete's local time.
Follows the
existing coach-API convention of trusting athleteId in the body (no JWT)
— consistent with memory.py / insight.py.
"""

from __future__ import annotations

import hashlib
import os
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover - zoneinfo is stdlib on 3.9+
    ZoneInfo = None  # type: ignore

from ._core import (
    kv_get_json,
    kv_set_json,
    read_json_body,
    send_json,
    send_cors_preflight,
)
from ._push import send_web_push, vapid_configured

MAX_DEVICES = 10
DEFAULT_PERIODS = [6, 13, 20]
INDEX_KEY = "coach_push_index"


def _subs_key(athlete_id: str) -> str:
    return f"coach_push_subs:{athlete_id}"


def _load_subs(athlete_id: str) -> list[dict]:
    raw = kv_get_json(_subs_key(athlete_id))
    if isinstance(raw, dict) and isinstance(raw.get("devices"), list):
        return raw["devices"]
    if isinstance(raw, list):
        return raw
    return []


def _update_index(athlete_id: str, present: bool) -> None:
    idx = kv_get_json(INDEX_KEY)
    ids = idx if isinstance(idx, list) else []
    if present and athlete_id not in ids:
        ids.append(athlete_id)
    elif not present and athlete_id in ids:
        ids = [a for a in ids if a != athlete_id]
    else:
        return
    try:
        kv_set_json(INDEX_KEY, ids)
    except Exception:
        pass


def _save_subs(athlete_id: str, devices: list[dict]) -> None:
    kv_set_json(_subs_key(athlete_id), {"devices": devices})
    _update_index(athlete_id, bool(devices))


# ── Scheduled-push fan-out ──────────────────────────────────────
# Folded in from the former /api/coach/scheduled_push endpoint to stay under
# the Vercel Hobby 12-serverless-function cap. /api/coach/scheduled_push is
# rewritten (vercel.json) to /api/coach/push?__cron=1 and routed in do_GET
# below. Triggered hourly by .github/workflows/coach-scheduled-push.yml.
#
# Cron protection: when CRON_SECRET is set we require `Authorization: Bearer
# <CRON_SECRET>`. With no secret configured the endpoint is open (dev).

# Dedup TTL: comfortably longer than a day so a period fires at most once per
# local calendar day, but short enough that keys don't accumulate.
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


def _cron_authorized(headers) -> bool:
    secret = os.environ.get("CRON_SECRET", "").strip()
    if not secret:
        # No secret configured → allow (dev / self-hosted).
        return True
    auth = headers.get("Authorization", "") if headers else ""
    return auth == f"Bearer {secret}"


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        # Cron route (rewritten from /api/coach/scheduled_push). Auth + fan-out,
        # no athleteId.
        if q.get("__cron"):
            if not _cron_authorized(self.headers):
                send_json(self, 401, {"error": "unauthorized"})
                return
            try:
                send_json(self, 200, run_scheduled_push())
            except Exception as e:
                send_json(self, 500, {"error": str(e)})
            return
        athlete_id = (q.get("athleteId", [""])[0] or "").strip()
        if not athlete_id:
            send_json(self, 400, {"error": "athleteId required"})
            return
        devices = _load_subs(athlete_id)
        send_json(self, 200, {
            "subscribed": len(devices) > 0,
            "count": len(devices),
            "timezone": devices[0].get("timezone") if devices else None,
            "vapidConfigured": vapid_configured(),
        })

    def do_POST(self):
        body = read_json_body(self)
        action = str(body.get("action", "")).strip()
        athlete_id = str(body.get("athleteId", "")).strip()
        if not athlete_id:
            send_json(self, 400, {"error": "athleteId required"})
            return

        if action == "subscribe":
            sub = body.get("subscription") or {}
            endpoint = sub.get("endpoint")
            keys = sub.get("keys") or {}
            if not endpoint or not keys.get("p256dh") or not keys.get("auth"):
                send_json(self, 400, {"error": "invalid subscription"})
                return
            timezone = str(body.get("timezone", "UTC")).strip() or "UTC"
            periods = body.get("periods")
            if not (isinstance(periods, list) and all(isinstance(p, int) for p in periods)):
                periods = DEFAULT_PERIODS
            devices = [d for d in _load_subs(athlete_id) if d.get("endpoint") != endpoint]
            devices.append({
                "endpoint": endpoint,
                "keys": {"p256dh": keys["p256dh"], "auth": keys["auth"]},
                "timezone": timezone,
                "periods": periods,
                "updatedAt": int(time.time() * 1000),
            })
            devices = devices[-MAX_DEVICES:]
            _save_subs(athlete_id, devices)
            send_json(self, 200, {"ok": True, "count": len(devices)})
            return

        if action == "unsubscribe":
            endpoint = str(body.get("endpoint", "")).strip()
            devices = _load_subs(athlete_id)
            devices = [d for d in devices if d.get("endpoint") != endpoint] if endpoint else []
            _save_subs(athlete_id, devices)
            send_json(self, 200, {"ok": True, "count": len(devices)})
            return

        if action == "test":
            if not vapid_configured():
                send_json(self, 503, {"error": "push not configured (VAPID_PRIVATE_KEY unset)"})
                return
            devices = _load_subs(athlete_id)
            if not devices:
                send_json(self, 404, {"error": "no subscriptions for athlete"})
                return
            payload = {
                "title": "Coach",
                "body": "Test notification — push is wired up. Your 6 AM / 1 PM / 8 PM briefings will land here.",
                "url": "/?view=coach",
                "tag": "coach-test",
            }
            sent, pruned, errors, kept = 0, 0, [], []
            for d in devices:
                try:
                    ok, status, prune = send_web_push(d, payload)
                except Exception as e:
                    errors.append(str(e))
                    kept.append(d)
                    continue
                if ok:
                    sent += 1
                    kept.append(d)
                elif prune:
                    pruned += 1
                else:
                    errors.append(f"status {status}")
                    kept.append(d)
            if pruned:
                _save_subs(athlete_id, kept)
            send_json(self, 200, {"ok": sent > 0, "sent": sent, "pruned": pruned, "errors": errors})
            return

        send_json(self, 400, {"error": f"unknown action: {action}"})
