"""Shared core module for Coach endpoints.

Provides:
- Upstash KV REST helpers (get/set/del, with JSON + TTL variants)
- Anthropic SDK wrapper with telemetry logging
- Prompt builders (system prompt, context block)
- Model router (Haiku default, Sonnet on escalation triggers)
- Conversation summarization helper
- Light helpers for conversation turn IDs + hashing
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
import urllib.parse
import urllib.request
from typing import Any, Iterable


# ─── Models ──────────────────────────────────────────────────────

HAIKU_MODEL = os.environ.get("ANTHROPIC_HAIKU_MODEL", "claude-haiku-4-5")
SONNET_MODEL = os.environ.get("ANTHROPIC_SONNET_MODEL", "claude-sonnet-4-5")

# Approximate $/1M tokens (input, output). Used for cost estimate in Diagnostics.
COST_TABLE: dict[str, tuple[float, float]] = {
    HAIKU_MODEL: (1.00, 5.00),
    SONNET_MODEL: (3.00, 15.00),
}


# ─── Upstash KV REST ─────────────────────────────────────────────

def _kv_headers() -> dict[str, str]:
    token = os.environ.get("KV_REST_API_TOKEN", "")
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _kv_base() -> str | None:
    url = os.environ.get("KV_REST_API_URL", "")
    return url or None


def kv_get(key: str) -> str | None:
    url = _kv_base()
    if not url:
        return None
    req = urllib.request.Request(
        f"{url}/get/{urllib.parse.quote(key, safe='')}",
        headers=_kv_headers(),
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            return data.get("result")
    except Exception:
        return None


def kv_get_json(key: str, default: Any = None) -> Any:
    raw = kv_get(key)
    if raw is None:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


def kv_set(key: str, value: str, ex: int | None = None) -> None:
    url = _kv_base()
    token = os.environ.get("KV_REST_API_TOKEN", "")
    if not url or not token:
        raise RuntimeError("KV not configured")
    encoded = urllib.parse.quote(value, safe="")
    k = urllib.parse.quote(key, safe="")
    set_url = f"{url}/set/{k}/{encoded}"
    if ex is not None:
        set_url += f"/EX/{ex}"
    req = urllib.request.Request(
        set_url,
        headers={"Authorization": f"Bearer {token}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        resp.read()


def kv_set_json(key: str, value: Any, ex: int | None = None) -> None:
    kv_set(key, json.dumps(value, separators=(",", ":")), ex=ex)


def kv_del(key: str) -> None:
    url = _kv_base()
    token = os.environ.get("KV_REST_API_TOKEN", "")
    if not url or not token:
        return
    req = urllib.request.Request(
        f"{url}/del/{urllib.parse.quote(key, safe='')}",
        headers={"Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=10).read()
    except Exception:
        pass


# ─── Memory shape helpers ────────────────────────────────────────

def memory_key(athlete_id: str) -> str:
    return f"coach_memory:{athlete_id}"


def insight_key(athlete_id: str, surface: str, context_hash: str) -> str:
    return f"coach_insight:{athlete_id}:{surface}:{context_hash}"


def ping_cooldown_key(athlete_id: str, trigger_type: str) -> str:
    return f"coach_ping_cooldown:{athlete_id}:{trigger_type}"


def telemetry_key(athlete_id: str, date_str: str) -> str:
    return f"coach_telemetry:{athlete_id}:{date_str}"


def samples_key(athlete_id: str) -> str:
    return f"coach_samples:{athlete_id}"


def load_memory(athlete_id: str) -> dict[str, Any]:
    mem = kv_get_json(memory_key(athlete_id))
    if not isinstance(mem, dict):
        mem = {}
    mem.setdefault("aboutMe", "")
    mem.setdefault("conversation", [])
    mem.setdefault("conversationSummary", None)
    mem.setdefault("pendingInferences", [])
    return mem


def save_memory(athlete_id: str, memory: dict[str, Any]) -> None:
    kv_set_json(memory_key(athlete_id), memory)


def new_turn_id() -> str:
    return f"t_{int(time.time() * 1000)}_{os.urandom(3).hex()}"


def new_inference_id() -> str:
    return f"i_{int(time.time() * 1000)}_{os.urandom(3).hex()}"


# ─── Hashing ─────────────────────────────────────────────────────

def stable_hash(obj: Any) -> str:
    """SHA-1 over canonical JSON (sorted keys). Used for insight caching."""
    canonical = json.dumps(obj, sort_keys=True, separators=(",", ":"))
    return hashlib.sha1(canonical.encode()).hexdigest()[:16]


# ─── Prompt builders ─────────────────────────────────────────────

COACH_ROLE = """You are "Coach" — an ambient AI training coach embedded in the user's Broken Arrow training app. You speak with the user (an athlete training for a Broken Arrow Sky Race) in a direct, warm, specific voice. You are not a chatbot; you are a coach who knows the athlete's plan, actuals, readiness, and history.

Principles:
- Be specific. Reference exact numbers, workouts, dates, and what the athlete actually did.
- Be concise. Short sentences. No fluff. Never pad.
- Be honest. If the data says rest, say rest. Don't encourage work the body isn't ready for.
- Be curious. If something in today's signal is unusual, name it and ask about it.
- Never moralize, never lecture about basics the athlete already knows.
- When recommending plan changes, suggest — the user applies changes themselves via the app's swap/log UI.
- If the context snapshot is missing data needed to answer confidently, say so rather than guessing.
"""


def build_system_prompt(
    about_me: str,
    pending_inferences: list[dict[str, Any]],
    conversation_summary: dict[str, Any] | None,
    athlete_profile: dict[str, Any] | None,
    race: dict[str, Any] | None,
) -> str:
    parts: list[str] = [COACH_ROLE.strip()]

    if athlete_profile:
        parts.append(
            "Athlete:\n"
            f"- Name: {athlete_profile.get('name', 'Athlete')}\n"
            f"- Max HR: {athlete_profile.get('maxHR', 'unknown')}\n"
            f"- Structure: {athlete_profile.get('weeklyStructure', '')}"
        )

    if race:
        parts.append(
            "Race:\n"
            f"- {race.get('name', '')} · {race.get('date', '')}\n"
            f"- Distance: {race.get('distance', '')}\n"
            f"- Elevation: {race.get('elevation', '')}\n"
            f"- Course: {race.get('course', '')}"
        )

    if about_me and about_me.strip():
        parts.append(f"About this athlete (their own words):\n{about_me.strip()}")

    if pending_inferences:
        lines = [f"- {p.get('text', '')}" for p in pending_inferences if p.get("text")]
        if lines:
            parts.append(
                "Pending observations you've noted (not yet accepted by the athlete — "
                "treat as tentative, do not reference unless they come up naturally):\n"
                + "\n".join(lines)
            )

    if conversation_summary and conversation_summary.get("text"):
        parts.append(
            "Earlier conversation (summary of older turns):\n"
            + conversation_summary["text"]
        )

    parts.append(
        "If the user's question requires data older than what's in the context "
        "snapshot (e.g. >7 days), respond only with the literal token "
        "[NEED_MORE_HISTORY] — the app will retry with 30-day context."
    )

    return "\n\n".join(parts)


def _fmt_num(v: Any, digits: int = 1) -> str:
    if v is None:
        return "—"
    try:
        f = float(v)
        if digits == 0:
            return str(int(round(f)))
        return f"{f:.{digits}f}"
    except Exception:
        return str(v)


def _fmt_seconds_as_min(s: Any) -> str:
    if not s:
        return "0m"
    try:
        return f"{int(round(float(s) / 60))}m"
    except Exception:
        return "0m"


def build_context_block(snapshot: dict[str, Any], depth: str = "7d") -> str:
    """Compact, LLM-readable context block from the CoachSnapshot.

    Keep this compact — tokens matter. We trim activities to recent N days
    based on `depth`.
    """
    today = snapshot.get("today", {})
    readiness = snapshot.get("readiness")
    perf = snapshot.get("performance")
    planned_today = snapshot.get("plannedToday")
    planned_tomorrow = snapshot.get("plannedTomorrow")
    activities = snapshot.get("recentActivities") or []
    soreness = snapshot.get("recentSoreness") or []
    analytics = snapshot.get("analytics") or {}
    week_num = snapshot.get("currentWeekNum")

    # Trim activities window
    if depth == "30d":
        activities = activities[:30]
    else:
        activities = activities[:12]  # ~last 7-12 days

    out: list[str] = []
    out.append(f"Today: {today.get('date', '')} (week {week_num or '?'})")

    if readiness:
        comp = readiness.get("components", {}) or {}
        out.append(
            f"Readiness: {readiness.get('status')} "
            f"({readiness.get('displayScore')}/100, state {readiness.get('trainingState')}). "
            f"Components — hrv:{comp.get('hrv')} rhr:{comp.get('rhr')} "
            f"sleep:{comp.get('sleep')} load:{comp.get('trainingLoad')}. "
            f"{readiness.get('message', '')}"
        )
        if readiness.get("adjustment"):
            out.append(f"Adjustment: {readiness['adjustment']}")

    if perf:
        out.append(
            f"Load: CTL {_fmt_num(perf.get('ctl'))} · "
            f"ATL {_fmt_num(perf.get('atl'))} · "
            f"TSB {_fmt_num(perf.get('tsb'))} · "
            f"ACWR {_fmt_num(perf.get('acwr'), 2)}"
        )

    if planned_today:
        out.append(
            f"Today planned: {planned_today.get('day')} · "
            f"{planned_today.get('type')} · {planned_today.get('workout')} · "
            f"zone {planned_today.get('zone')} · {planned_today.get('detail', '')}"
        )
        if planned_today.get("actual"):
            a = planned_today["actual"]
            out.append(
                f"Today actual: {a.get('name', '')} · "
                f"{_fmt_num(a.get('distance'))}mi · "
                f"{_fmt_seconds_as_min(a.get('movingTime'))} · "
                f"avgHR {a.get('avgHR') or '—'} · "
                f"RPE {a.get('rpe') or '—'}"
            )
    if planned_tomorrow:
        out.append(
            f"Tomorrow planned: {planned_tomorrow.get('day')} · "
            f"{planned_tomorrow.get('type')} · {planned_tomorrow.get('workout')}"
        )

    if activities:
        out.append(f"Recent activities ({depth}, most recent first):")
        for a in activities:
            out.append(
                f"  - {a.get('startDate', '')[:10]} · {a.get('name', '')} · "
                f"{_fmt_num(a.get('distance'))}mi · "
                f"{_fmt_seconds_as_min(a.get('movingTime'))} · "
                f"avgHR {a.get('avgHR') or '—'} · "
                f"elev {a.get('elevationGain') or 0}ft · "
                f"RPE {a.get('rpe') or '—'}"
            )

    if soreness:
        out.append("Recent soreness:")
        for s in soreness[:5]:
            out.append(f"  - {s.get('date', '')}: {s.get('summary', '')}")

    if analytics:
        wtd = analytics.get("weekToDate") or {}
        zones = analytics.get("last7dPerZone") or {}
        comp = analytics.get("complianceSummary") or {}
        trend = analytics.get("loadTrend") or {}
        proj = analytics.get("raceProjection") or {}
        prog = analytics.get("planProgress") or {}
        out.append("Analytics:")
        if wtd:
            tiz = wtd.get("timeInZones") or {}
            out.append(
                f"  WTD: {_fmt_num(wtd.get('miles'))}mi · "
                f"{_fmt_seconds_as_min(wtd.get('durationSec'))} · "
                f"TRIMP {_fmt_num(wtd.get('trimp'), 0)} · "
                f"zones z1 {_fmt_seconds_as_min(tiz.get('z1'))}, "
                f"z2 {_fmt_seconds_as_min(tiz.get('z2'))}, "
                f"z3 {_fmt_seconds_as_min(tiz.get('z3'))}, "
                f"z4 {_fmt_seconds_as_min(tiz.get('z4'))}, "
                f"z5 {_fmt_seconds_as_min(tiz.get('z5'))}"
            )
        if zones:
            out.append(
                f"  Last7d zones: z1 {_fmt_seconds_as_min(zones.get('z1Sec'))}, "
                f"z2 {_fmt_seconds_as_min(zones.get('z2Sec'))}, "
                f"z3 {_fmt_seconds_as_min(zones.get('z3Sec'))}, "
                f"z4 {_fmt_seconds_as_min(zones.get('z4Sec'))}, "
                f"z5 {_fmt_seconds_as_min(zones.get('z5Sec'))}"
            )
        if comp:
            out.append(
                f"  Compliance: dist {_fmt_num((comp.get('distancePct') or 0) * 100, 0)}% · "
                f"dur {_fmt_num((comp.get('durationPct') or 0) * 100, 0)}% · "
                f"hr {_fmt_num((comp.get('hrPct') or 0) * 100, 0)}% · "
                f"flagged {comp.get('flagged', 0)}"
            )
        if trend:
            out.append(
                f"  Trend: CTL {_fmt_num(trend.get('ctl'))} "
                f"(Δ7d {_fmt_num(trend.get('ctlDelta7d'))}) · "
                f"TSB {_fmt_num(trend.get('tsb'))} · "
                f"ACWR {_fmt_num(trend.get('acwr'), 2)}"
            )
        if proj:
            secs = proj.get("estimatedSeconds")
            if secs:
                h = int(secs) // 3600
                m = (int(secs) % 3600) // 60
                out.append(
                    f"  Race projection: ~{h}h{m:02d} "
                    f"(confidence {proj.get('confidence')}, basis: {proj.get('basis')})"
                )
        if prog:
            out.append(
                f"  Plan: {prog.get('weeksElapsed')}/"
                f"{(prog.get('weeksElapsed') or 0) + (prog.get('weeksRemaining') or 0)} wks · "
                f"{'on-track' if prog.get('onTrack') else 'off-track'} — {prog.get('reason', '')}"
            )

    return "\n".join(out)


# ─── Model routing ──────────────────────────────────────────────

INJURY_RE = re.compile(r"\b(pain|hurt|sore|tight|ache|injur(?:ed|y))\b", re.IGNORECASE)
PLAN_CHANGE_RE = re.compile(r"\b(skip|swap|move|push|drop|cancel)\b", re.IGNORECASE)
EXPAND_RE = re.compile(
    r"\b(last month|past month|last 30|30 days|30-day|history|trend|over time|pattern|all season|this season|so far|cycle)\b",
    re.IGNORECASE,
)


def pick_model(messages: list[dict[str, Any]]) -> str:
    """Default to Haiku; escalate to Sonnet on specific signals."""
    if not messages:
        return HAIKU_MODEL
    last_user = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            content = m.get("content", "")
            last_user = content if isinstance(content, str) else json.dumps(content)
            break

    turn_count = sum(1 for m in messages if m.get("role") in ("user", "assistant"))

    if INJURY_RE.search(last_user):
        return SONNET_MODEL
    if len(last_user) > 400:
        return SONNET_MODEL
    if PLAN_CHANGE_RE.search(last_user):
        return SONNET_MODEL
    if turn_count > 8:
        return SONNET_MODEL
    return HAIKU_MODEL


def detect_expand_trigger(user_msg: str) -> bool:
    if not user_msg:
        return False
    return bool(EXPAND_RE.search(user_msg))


# ─── Anthropic wrapper ──────────────────────────────────────────

def _get_anthropic_client():
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    from anthropic import Anthropic
    return Anthropic(api_key=api_key)


def call_anthropic(
    *,
    model: str,
    system: str,
    messages: list[dict[str, Any]],
    max_tokens: int = 600,
    athlete_id: str | None = None,
    surface: str = "unknown",
    log_sample: bool = False,
) -> dict[str, Any]:
    """Non-streaming Anthropic call. Logs telemetry. Returns {text, usage}."""
    client = _get_anthropic_client()
    t0 = time.time()
    success = True
    text = ""
    usage_in = 0
    usage_out = 0
    try:
        resp = client.messages.create(
            model=model,
            system=system,
            messages=messages,
            max_tokens=max_tokens,
        )
        # Concat text blocks
        for block in resp.content:
            if getattr(block, "type", None) == "text":
                text += block.text
        usage_in = getattr(resp.usage, "input_tokens", 0) or 0
        usage_out = getattr(resp.usage, "output_tokens", 0) or 0
    except Exception as e:
        success = False
        text = ""
        raise
    finally:
        latency_ms = int((time.time() - t0) * 1000)
        if athlete_id:
            try:
                log_llm_call(
                    athlete_id=athlete_id,
                    model=model,
                    surface=surface,
                    input_tokens=usage_in,
                    output_tokens=usage_out,
                    latency_ms=latency_ms,
                    success=success,
                )
                if log_sample:
                    log_sample_event(
                        athlete_id=athlete_id,
                        model=model,
                        surface=surface,
                        system_prompt=system,
                        messages=messages,
                        response=text,
                    )
            except Exception:
                pass

    return {
        "text": text,
        "usage": {"input": usage_in, "output": usage_out},
        "latency_ms": latency_ms,
    }


def stream_anthropic(
    *,
    model: str,
    system: str,
    messages: list[dict[str, Any]],
    max_tokens: int = 600,
) -> Iterable[tuple[str, str]]:
    """Stream Anthropic response. Yields ('delta', text) tuples, then
    ('done', full_text), finally ('usage', json_str).

    Telemetry logging is done by the caller so the full text + tokens are
    available after the stream completes.
    """
    client = _get_anthropic_client()
    full = []
    with client.messages.stream(
        model=model,
        system=system,
        messages=messages,
        max_tokens=max_tokens,
    ) as stream:
        for event in stream:
            et = getattr(event, "type", "")
            if et == "content_block_delta":
                delta = getattr(event, "delta", None)
                if delta and getattr(delta, "type", None) == "text_delta":
                    chunk = delta.text
                    full.append(chunk)
                    yield ("delta", chunk)
        final = stream.get_final_message()
    full_text = "".join(full)
    yield ("done", full_text)
    usage = {
        "input": getattr(final.usage, "input_tokens", 0) or 0,
        "output": getattr(final.usage, "output_tokens", 0) or 0,
    }
    yield ("usage", json.dumps(usage))


# ─── Telemetry ──────────────────────────────────────────────────

def _today_str() -> str:
    import datetime
    return datetime.datetime.utcnow().strftime("%Y-%m-%d")


def _append_event(athlete_id: str, event: dict[str, Any]) -> None:
    key = telemetry_key(athlete_id, _today_str())
    arr = kv_get_json(key) or []
    if not isinstance(arr, list):
        arr = []
    arr.append(event)
    # 90-day TTL
    kv_set_json(key, arr, ex=86400 * 90)


def log_llm_call(
    *,
    athlete_id: str,
    model: str,
    surface: str,
    input_tokens: int,
    output_tokens: int,
    latency_ms: int,
    success: bool,
    fell_back_to_heuristic: bool = False,
) -> None:
    try:
        _append_event(
            athlete_id,
            {
                "type": "llm_call",
                "ts": int(time.time() * 1000),
                "model": model,
                "surface": surface,
                "inputTokens": input_tokens,
                "outputTokens": output_tokens,
                "latencyMs": latency_ms,
                "success": success,
                "fellBackToHeuristic": fell_back_to_heuristic,
            },
        )
    except Exception:
        pass


def log_interaction(
    *,
    athlete_id: str,
    kind: str,
    meta: dict[str, Any] | None = None,
) -> None:
    try:
        _append_event(
            athlete_id,
            {
                "type": "interaction",
                "ts": int(time.time() * 1000),
                "kind": kind,
                "meta": meta or {},
            },
        )
    except Exception:
        pass


MAX_SAMPLES = 50


def log_sample_event(
    *,
    athlete_id: str,
    model: str,
    surface: str,
    system_prompt: str,
    messages: list[dict[str, Any]],
    response: str,
) -> None:
    try:
        key = samples_key(athlete_id)
        arr = kv_get_json(key) or []
        if not isinstance(arr, list):
            arr = []
        arr.append(
            {
                "ts": int(time.time() * 1000),
                "model": model,
                "surface": surface,
                "systemPrompt": system_prompt,
                "messages": messages,
                "response": response,
            }
        )
        # Trim
        if len(arr) > MAX_SAMPLES:
            arr = arr[-MAX_SAMPLES:]
        kv_set_json(key, arr)
    except Exception:
        pass


# ─── Summarization ──────────────────────────────────────────────

SUMMARY_THRESHOLD = 20  # start rolling summary after this many turns


def summarize_conversation(
    athlete_id: str,
    turns: list[dict[str, Any]],
    existing_summary: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Produce/refresh a rolling summary over older turns. Returns the new
    summary object, or None if no summary needed.
    """
    if len(turns) < SUMMARY_THRESHOLD:
        return existing_summary

    # Summarize all but the last ~10 turns
    keep_recent = 10
    older = turns[:-keep_recent]
    if not older:
        return existing_summary

    # If existing summary already covers most older turns, skip
    last_summarized = (existing_summary or {}).get("throughTurnId")
    if last_summarized and older and older[-1].get("id") == last_summarized:
        return existing_summary

    transcript = "\n".join(
        f"{t.get('role', '').upper()}: {t.get('content', '')}" for t in older
    )

    try:
        result = call_anthropic(
            model=HAIKU_MODEL,
            system=(
                "You are summarizing a coach↔athlete conversation into a concise "
                "context digest for the next coaching turn. Capture durable facts, "
                "goals, concerns, injuries, plan changes discussed, and the thread of "
                "the conversation. 5-8 bullet points, 120 words max. No fluff."
            ),
            messages=[{"role": "user", "content": transcript}],
            max_tokens=300,
            athlete_id=athlete_id,
            surface="summarization",
        )
        text = (result.get("text") or "").strip()
        if not text:
            return existing_summary
        return {
            "text": text,
            "throughTurnId": older[-1].get("id"),
            "ts": int(time.time() * 1000),
        }
    except Exception:
        return existing_summary


# ─── Inference detection (post-chat) ────────────────────────────

def detect_inferences(
    athlete_id: str,
    user_msg: str,
    assistant_msg: str,
) -> list[str]:
    """Scan the latest exchange for durable athlete facts worth surfacing as
    pending inferences. Returns a list of one-line statements suitable for
    the 'About Me' doc. Empty list means nothing durable was learned.
    """
    try:
        result = call_anthropic(
            model=HAIKU_MODEL,
            system=(
                "You extract durable facts the coach should remember about the "
                "athlete from a single chat exchange. Durable = true across many "
                "sessions (injuries, preferences, life context, goals, equipment, "
                "schedule constraints). NOT durable = today's readiness, this "
                "week's workout, transient feelings.\n\n"
                "Output format: JSON array of short statement strings "
                "(first-person, written as they would appear in the athlete's "
                "About Me). If nothing durable is worth saving, output `[]`. "
                "Output ONLY the JSON, nothing else."
            ),
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Athlete said:\n{user_msg}\n\n"
                        f"Coach replied:\n{assistant_msg}\n\n"
                        "Durable facts, if any:"
                    ),
                }
            ],
            max_tokens=200,
            athlete_id=athlete_id,
            surface="inference_detect",
        )
        text = (result.get("text") or "").strip()
        # Strip code fences if present
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
        parsed = json.loads(text) if text else []
        if not isinstance(parsed, list):
            return []
        return [str(s).strip() for s in parsed if str(s).strip()][:3]
    except Exception:
        return []


# ─── Request helpers ────────────────────────────────────────────

def read_json_body(handler) -> dict[str, Any]:
    length = int(handler.headers.get("Content-Length", "0") or "0")
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    try:
        return json.loads(raw.decode())
    except Exception:
        return {}


def send_json(handler, status: int, payload: Any) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()
    handler.wfile.write(json.dumps(payload).encode())


def send_cors_preflight(handler) -> None:
    handler.send_response(204)
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()
