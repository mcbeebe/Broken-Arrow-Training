"""Coach operational telemetry sink + rollup.

POST /api/coach/telemetry
{ events: [{type: 'interaction', kind, meta?}, ...] }

GET /api/coach/telemetry?days=30
  Returns aggregated rollup plus sample review list.

AUTH: requires `Authorization: Bearer <session>`. The athlete is the token
subject, except that the ADMIN account may pass ?athleteId=X to read another
athlete — Coach Diagnostics compares athletes side by side.
"""

import datetime
import time
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from ._core import (
    COST_TABLE,
    kv_get_json,
    log_interaction,
    read_json_body,
    reset_budget,
    samples_key,
    send_cors_preflight,
    send_json,
    telemetry_key,
)
from ..auth._helpers import athlete_from_bearer, resolve_athlete


def _load_events(athlete_id: str, days: int) -> list[dict]:
    today = datetime.datetime.utcnow().date()
    events: list[dict] = []
    for i in range(days):
        d = today - datetime.timedelta(days=i)
        arr = kv_get_json(telemetry_key(athlete_id, d.isoformat())) or []
        if isinstance(arr, list):
            for e in arr:
                e["_day"] = d.isoformat()
            events.extend(arr)
    return events


def _estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    prices = COST_TABLE.get(model)
    if not prices:
        # Fallback matches Haiku to avoid blowing up estimates on unknown models
        prices = (1.00, 5.00)
    cost_in = (input_tokens / 1_000_000) * prices[0]
    cost_out = (output_tokens / 1_000_000) * prices[1]
    return round(cost_in + cost_out, 6)


def _rollup(events: list[dict]) -> dict:
    calls = [e for e in events if e.get("type") == "llm_call"]
    interactions = [e for e in events if e.get("type") == "interaction"]

    # Aggregate LLM usage
    total_calls = len(calls)
    total_in = sum(int(c.get("inputTokens") or 0) for c in calls)
    total_out = sum(int(c.get("outputTokens") or 0) for c in calls)
    total_cost = round(
        sum(_estimate_cost(c.get("model", ""), int(c.get("inputTokens") or 0), int(c.get("outputTokens") or 0)) for c in calls),
        4,
    )
    by_surface: dict[str, dict] = {}
    for c in calls:
        s = c.get("surface", "unknown")
        b = by_surface.setdefault(s, {"calls": 0, "input": 0, "output": 0, "cost": 0.0, "failures": 0})
        b["calls"] += 1
        b["input"] += int(c.get("inputTokens") or 0)
        b["output"] += int(c.get("outputTokens") or 0)
        b["cost"] = round(b["cost"] + _estimate_cost(c.get("model", ""), int(c.get("inputTokens") or 0), int(c.get("outputTokens") or 0)), 4)
        if not c.get("success"):
            b["failures"] += 1

    by_day: dict[str, dict] = {}
    for c in calls:
        d = c.get("_day", "")
        b = by_day.setdefault(d, {"calls": 0, "input": 0, "output": 0, "cost": 0.0})
        b["calls"] += 1
        b["input"] += int(c.get("inputTokens") or 0)
        b["output"] += int(c.get("outputTokens") or 0)
        b["cost"] = round(b["cost"] + _estimate_cost(c.get("model", ""), int(c.get("inputTokens") or 0), int(c.get("outputTokens") or 0)), 4)

    # Interaction counts
    interaction_counts: dict[str, int] = {}
    for i in interactions:
        k = i.get("kind", "unknown")
        interaction_counts[k] = interaction_counts.get(k, 0) + 1

    return {
        "llm": {
            "totalCalls": total_calls,
            "totalInput": total_in,
            "totalOutput": total_out,
            "totalCost": total_cost,
            "bySurface": by_surface,
            "byDay": by_day,
        },
        "interactions": interaction_counts,
    }


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        # Admin-aware: Coach Diagnostics compares athletes side by side, so
        # the admin account may name one. Everyone else reads their own.
        ok, _auth_status, _auth_err, athlete_id = resolve_athlete(
            self.headers, (q.get("athleteId", [""])[0] or "").strip())
        if not ok:
            send_json(self, _auth_status, {"error": _auth_err})
            return
        days = max(1, min(90, int(q.get("days", ["30"])[0] or "30")))
        events = _load_events(athlete_id, days)
        rollup = _rollup(events)
        samples = kv_get_json(samples_key(athlete_id)) or []
        if not isinstance(samples, list):
            samples = []
        # Return samples newest-first
        samples = list(reversed(samples))
        send_json(self, 200, {"rollup": rollup, "samples": samples, "days": days})

    def do_POST(self):
        ok, _auth_status, _auth_err, athlete_id = athlete_from_bearer(self.headers)
        if not ok:
            send_json(self, _auth_status, {"error": _auth_err})
            return
        body = read_json_body(self)
        events = body.get("events") or []
        if not isinstance(events, list):
            send_json(self, 400, {"error": "events required"})
            return
        for e in events:
            if not isinstance(e, dict):
                continue
            if e.get("type") == "interaction":
                log_interaction(
                    athlete_id=athlete_id,
                    kind=str(e.get("kind", "unknown")),
                    meta=e.get("meta") if isinstance(e.get("meta"), dict) else None,
                )
        send_json(self, 200, {"ok": True, "received": len(events)})

    def do_DELETE(self):
        """DELETE /api/coach/telemetry?athleteId=X&action=reset_budget"""
        q = parse_qs(urlparse(self.path).query)
        ok, _auth_status, _auth_err, athlete_id = resolve_athlete(
            self.headers, (q.get("athleteId", [""])[0] or "").strip())
        if not ok:
            send_json(self, _auth_status, {"error": _auth_err})
            return
        action = (q.get("action", [""])[0] or "").strip()
        if action == "reset_budget":
            ok = reset_budget(athlete_id)
            send_json(self, 200 if ok else 500, {"ok": ok, "action": "reset_budget", "athleteId": athlete_id})
        else:
            send_json(self, 400, {"error": "unknown action"})
