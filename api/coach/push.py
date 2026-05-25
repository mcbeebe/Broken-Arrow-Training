"""Coach push-notification subscription registry + test sender.

POST /api/coach/push   body { action, athleteId, ... }
  action=subscribe   { subscription:{endpoint,keys}, timezone, periods }
  action=unsubscribe { endpoint? }   (omit endpoint to clear all devices)
  action=test        — send a test push to all of the athlete's devices
GET  /api/coach/push?athleteId=mike → { subscribed, count, timezone, vapidConfigured }

Subscriptions are stored per-athlete (a list of device records) with the
device timezone + desired periods, so the Phase-3 scheduler can fan out
6 AM / 1 PM / 8 PM pushes in each athlete's local time. Follows the
existing coach-API convention of trusting athleteId in the body (no JWT)
— consistent with memory.py / insight.py.
"""

from __future__ import annotations

import time
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

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


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
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
