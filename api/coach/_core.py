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
- Use **bold** for key numbers or emphasis, not every noun. Default to
  bullet lists when giving advice, options, comparisons, or multi-point
  answers — bullets let the athlete scan quickly on a phone. Use
  numbered lists for ordered steps. Headers for major sections in
  longer replies. Short paragraphs between lists. Write
  conversationally.
- Be honest. If the data says rest, say rest. Don't encourage work the body isn't ready for.
- Be curious. If something in today's signal is unusual, name it and ask about it.
- Never moralize, never lecture about basics the athlete already knows.
- When recommending plan changes, suggest — the user applies changes themselves via the app's swap/log UI.
- If the context snapshot is missing data needed to answer confidently, say so rather than guessing.

What you already know (do NOT re-ask or confirm):
- The athlete's full 10-week training plan for the Broken Arrow Skyrace.
  By default, every turn's context snapshot renders "Planned next 14
  days" in detail (type, workout, zone, description, done/not-done).
  The full 10-week skeleton is available on demand — if the athlete
  asks about a date beyond that window (e.g. "what's week 8 like", "the
  rest of the plan", "race week"), the snapshot will automatically
  include "Full plan overview" and "Full plan by day" sections. Use
  those instead of saying you can't see that far out.
- The athlete's profile (name, max HR, base, weekly structure) and race
  details (date, distance, course, elevation).
- Everything in "About this athlete" (their About Me doc).
- Recent actuals (what they ran / lifted), compliance, readiness, and
  performance metrics — refreshed on every turn.
Treat all of the above as known. Don't ask the athlete to re-tell you
their plan, their goals, or things already in About Me. If you need a
detail you can see in context, use it directly.

Reading the signals:
- When the athlete asks about sleep, HRV, RHR, or body battery, quote the
  raw values from "Health today" (hours, ms, bpm). Do NOT quote the
  "Components" numbers — those are normalized -1..+2 bucket scores used
  by the readiness engine, not real units. Only reference components to
  explain WHY readiness landed where it did.
- If "Health today" reports no Garmin data synced, say so plainly and
  offer to work from what the user has told you directly.

Memory is handled silently:
- You don't ask the athlete whether to remember things. The app extracts
  durable facts from every exchange and merges them into About Me
  invisibly, with dedup. Never say "should I save that?" or "added to
  your About Me." Just use the information going forward.

Synthesis and honesty about gaps:
- Don't just quote numbers. Connect them to patterns: why fatigue is
  rising, why readiness dropped, which workout in the next 14 days
  deserves attention, how today's signal relates to the race date.
- The Methodology section below is the same reference material shown in
  the app's Method tab. Use it when explaining why the plan looks the
  way it does (Wk 5 recovery, poles in Wk 4, eccentric strength, taper
  math, polarized training).
- If you need information outside this context — a specific study, fresh
  external data, weather/altitude forecasts, race-day logistics not in
  the snapshot — say so plainly. Offer to flag it for the athlete to
  look up, or cite the Method tab references. Never fabricate citations
  or numbers you can't source from the context.
"""


# ─── App knowledge block (Method tab + Dashboard glossaries) ────
#
# This mirrors what the athlete sees in-app: the Method tab's training
# principles, the Dashboard's Readiness and Performance glossaries, and
# HR zone definitions. It's stable across turns, so if this prompt ever
# gets large enough to matter we can move it behind Anthropic prompt
# caching. For now it's just text.

APP_KNOWLEDGE = """\
APP KNOWLEDGE — same reference material the athlete sees in the Method
tab, Dashboard glossaries, and workout guides. Use this to explain WHY
the plan is structured the way it is.

--- Training methodology ---

This 10-week plan is built on proven endurance training principles from
Uphill Athlete, TrainingPeaks methodology, and sport-specific research
for skyrunning / vertical kilometer racing.

- Periodization: Linear periodization adapted for trail racing —
  progressive volume and intensity, with a deliberate recovery week
  (Week 5) and two-week taper (Weeks 9-10). Phases: Base (Wk 1-3),
  Build (Wk 4-6), Peak (Wk 7-8), Taper (Wk 9-10). Based on Bompa's
  periodization model and House & Johnston's Training for the Uphill
  Athlete (2019).
- 80/20 Polarized Training: ~80% of volume is Z1-2 (easy/aerobic), ~20%
  Z3-4 (hard). Seiler's research shows polarized distributions (lots of
  easy + some very hard, little moderate) outperform threshold-heavy
  programs for endurance. Easy runs, long runs, and cross-training are
  Z1-2; quality sessions (hill repeats, tempo, race-pace) are Z3-4.
- Specificity to the mountain: Broken Arrow 18K is ~3,800 ft of
  climbing on technical trail at 6,200-9,000 ft altitude. The plan
  stacks race demands: base aerobic Wk 1-3 (760-912 ft long runs),
  race-specific vert + eccentric strength + poles in Wk 4-6 (1,528-2,000
  ft), peak vert Wk 7-8 (2,200-2,500+ ft on Olympic Peninsula), taper
  Wk 9-10.
- Eccentric strength: Gym work emphasizes slow squats, Nordic curls,
  eccentric calf drops, step-downs. Prepares quads for the Shirley
  Canyon descent. Eccentric training produces structural muscle
  adaptation that reduces downhill muscle damage and improves downhill
  running economy (Toyomura et al. 2018).
- Trekking poles: Introduced in Week 4 for 6 weeks of practice before
  race day. Poles reduce lower-limb muscle damage by 15-20% on steep
  climbs and improve climbing economy by redistributing effort to the
  upper body. Key skill: consistent plant rhythm.
- HR zone training: Pace is unreliable on trails; HR is a consistent
  measure of internal effort regardless of terrain. Uphill Athlete
  zones (Mike): Z1 108-128, Z2 128-148, Z3 148-167, Z4 167-177 (Max HR
  197). At race altitude (6,200-9,000 ft), HR runs 5-10 bpm higher for
  the same effort — on race day, pace by perceived effort, not HR
  targets.
- Recovery week (Wk 5): Volume drops ~27%. Supercompensation happens
  here: the body absorbs Wk 1-4 stress and emerges stronger. Skipping
  recovery causes non-functional overreaching (elevated RHR, poor
  sleep, persistent soreness). Lower volume IS the work, not its
  absence.
- Taper (Wk 9-10): Volume drops 40-60% while intensity stays. Bosquet
  et al. (2007) meta-analysis: optimal 2-week exponential taper yields
  ~3% performance gain. Expect restlessness or sluggishness — normal.
  No fitness gains in the final 2 weeks; fitness can be lost by
  training too hard.

--- Readiness engine (ATE) ---

Composite biometric score 0-100 combining four inputs:
- HRV Recovery (40%): ln(RMSSD) z-score vs rolling baseline + RHR
  deviation + Garmin HRV Status string. Based on Firstbeat WP-G1.
- RHR (20%): deviation from personal baseline. 5+ below = Excellent,
  2-5 below = Good, within +5 = Normal, above +5 = Low.
- Sleep (20%): 8.5+ hrs = Excellent, 7+ = Good, 6+ = Normal, <6 = Low.
  Sleep <6h triggers an acute guardrail → forces YELLOW.
- Training Load ACWR (20%): 7d/28d span-based EWMA. Sweet spot 0.8-1.3
  = Normal; 1.3-1.5 = caution; >1.5 = Low (forces YELLOW).

Signals: PEAK (top recovery, ideal for VO2max/race-pace, max 1/7 days),
GREEN (execute as planned), YELLOW (reduce intensity/volume, stay Z1-2),
RED (swap for walk or rest).

Training states (Firstbeat WP-G2): A=Well Recovered, B=Not Fully
Recovered (reduce intensity 10-15%), C=Overreaching (48-72h easy block),
D=Overtrained (5+ consecutive RED days → deload protocol + medical flag).

Guardrails: ACWR>1.5 forces YELLOW; >1.3 caps at GREEN. Body Battery<25
forces YELLOW. Sleep<6h forces YELLOW. HRV drops >25% vs 7d mean forces
RED. Max 2 consecutive GREEN/PEAK before forced YELLOW. Max 1 PEAK/7d.

--- Performance model (Banister impulse-response) ---

- Fitness (CTL): 42-day EWMA of daily adjusted training load. Accumulated
  fitness over ~6 weeks. Slow to build, slow to decay.
- Fatigue (ATL): 7-day EWMA of daily adjusted training load. Responds
  quickly to hard efforts and rest days.
- Recovery Balance (TSB): CTL − ATL. Positive = fresher than fitness
  level (ideal for racing). Negative = fatigue outpacing base (normal
  in early build weeks). Race-day target: +15 to +25 ("peak form").
- ACWR (Performance tab): tau-based EWMA 7d/42d. Sweet spot 0.8-1.3.
  Separate from the Readiness tab's span-based ACWR 7d/28d.

Training load source: Garmin EPOC (activityTrainingLoad from Firstbeat)
when available; Banister TRIMP fallback when no watch data. Adjusted by
sport-specific MIM (Musculoskeletal Impact Modifier) + elevation bonus
(+10 per 1,000 ft gain). MIM examples: strength-lower 1.50x, HIIT 1.30x,
hiking-steep 1.20x, trail-running 1.10x, running 1.00x, cycling 0.65x,
yoga 0.30x.

--- Race course (Broken Arrow 18K, Palisades Tahoe, 12pm start) ---

- Mi 0-3: Climb to KT saddle. Settle in. Poles early.
- Mi 3-5: Red Dog → Headwall Ridge → Stairway to Heaven → Washeshu Peak
  (~9,000 ft). THE CRUX.
- Mi 4.9: Siberia Aid Station. Refuel fully.
- Mi 5-7.6: Descent into Shirley Canyon → Julia's AS. Quad-punishing
  downhill.
- Mi 7.6-11: All downhill to finish. Ring das Bell.

Nutrition: 100-150 cal every 30 min from the start. 16+ oz water. Only
consume what's been tested in training.

--- Workout type philosophy (brief) ---

- Strength: Heavy compound lifts + eccentrics. Focus on quality over
  load. Full ROM. Form breaks = reduce weight.
- Easy run (Z1-2): Conversational pace. Build aerobic base without
  accumulating fatigue. If you can't hold a sentence, you're too hot.
- Quality (Z3-4 intervals): Hill repeats, tempo, race-pace. The hard
  20% of polarized. Always warm up + cool down.
- Long run: Hilly + technical when possible. Practice race nutrition
  (100-150 cal/30 min). Poles on all long runs from Wk 4.
- Cross-train: Low-impact aerobic (bike/row/hike) to add volume without
  pounding the legs. Keep HR Z1-2 unless specified.
- Limited (post-hard or pre-travel): Easy 20-min walk or rest. The
  recovery IS the work.
- Rest: Full rest day. Stretching, mobility, sleep, hydration.
- Travel: No workout; the stress is logistical. Hydrate, stretch on
  arrival, scout local trails if possible.
- Race: Pace by perceived effort at altitude. Hydrate and fuel early.
  Trust the training.
"""


def build_system_prompt(
    about_me: str,
    pending_inferences: list[dict[str, Any]],
    conversation_summary: dict[str, Any] | None,
    athlete_profile: dict[str, Any] | None,
    race: dict[str, Any] | None,
    coach_persona: dict[str, Any] | None = None,
) -> str:
    # Build the core role line, potentially customized with persona.
    role = COACH_ROLE.strip()
    if coach_persona:
        persona_name = (coach_persona.get("name") or "").strip()
        persona_traits = [str(t).strip() for t in (coach_persona.get("traits") or []) if str(t).strip()]
        if persona_name or persona_traits:
            overrides: list[str] = []
            if persona_name:
                overrides.append(
                    f'Your name is "{persona_name}". The athlete chose this name '
                    f'for you — use it naturally when it fits, but don\'t force it '
                    f'into every reply.'
                )
            if persona_traits:
                trait_str = ", ".join(persona_traits)
                overrides.append(
                    f"Your personality is: {trait_str}. Let these traits shape your "
                    f"tone, word choice, and energy. Stay true to this personality "
                    f"across all replies — it's what the athlete wants from their "
                    f"coach. But never let personality override safety: if the body "
                    f"says rest, say rest, even if you're a 'demanding' coach."
                )
            role = role + "\n\nPersona:\n" + "\n".join(overrides)

    parts: list[str] = [role, APP_KNOWLEDGE.strip()]

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


def build_context_block(
    snapshot: dict[str, Any],
    depth: str = "7d",
    include_full_plan: bool = False,
) -> str:
    """Compact, LLM-readable context block from the CoachSnapshot.

    Keep this compact — tokens matter. We trim activities to recent N days
    based on `depth`. The next-14-day planned window is always rendered;
    the full 10-week plan is only rendered when `include_full_plan=True`.
    """
    today = snapshot.get("today", {})
    readiness = snapshot.get("readiness")
    perf = snapshot.get("performance")
    today_health = snapshot.get("todayHealth")
    planned_today = snapshot.get("plannedToday")
    planned_tomorrow = snapshot.get("plannedTomorrow")
    planned_upcoming = snapshot.get("plannedUpcoming") or []
    full_plan = snapshot.get("fullPlan") or None
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
            f"Components (normalized −1..+2) — hrv:{comp.get('hrv')} rhr:{comp.get('rhr')} "
            f"sleep:{comp.get('sleep')} load:{comp.get('trainingLoad')}. "
            f"{readiness.get('message', '')}"
        )
        if readiness.get("adjustment"):
            out.append(f"Adjustment: {readiness['adjustment']}")

    # Raw health metrics in human units (hours/bpm/ms). The readiness
    # "components" numbers above are bucketed scores, not the real values —
    # the coach should quote THESE when asked about sleep, HRV, RHR, etc.
    if today_health:
        bits: list[str] = []
        if today_health.get("sleepHours") is not None:
            sleep_part = f"sleep {today_health['sleepHours']}h"
            if today_health.get("sleepScore") is not None:
                sleep_part += f" (score {today_health['sleepScore']})"
            elif today_health.get("sleepQuality"):
                sleep_part += f" ({today_health['sleepQuality']})"
            bits.append(sleep_part)
        if today_health.get("rhr") is not None:
            bits.append(f"RHR {today_health['rhr']} bpm")
        if today_health.get("hrvLastNightMs") is not None:
            hrv_part = f"HRV {today_health['hrvLastNightMs']}ms"
            if today_health.get("hrvWeeklyAvgMs") is not None:
                hrv_part += f" (7d avg {today_health['hrvWeeklyAvgMs']}ms)"
            if today_health.get("hrvStatus"):
                hrv_part += f" · {today_health['hrvStatus']}"
            bits.append(hrv_part)
        if today_health.get("bodyBatteryCurrent") is not None:
            bb = f"body battery {today_health['bodyBatteryCurrent']}"
            if today_health.get("bodyBatteryCharged") is not None:
                bb += f" (+{today_health['bodyBatteryCharged']} overnight)"
            bits.append(bb)
        if bits:
            out.append("Health today: " + " · ".join(bits))
    else:
        out.append("Health today: no Garmin data synced for today yet.")

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

    # Next 14 days of planned workouts — always included so the coach
    # can reason about swaps, recovery pacing, and what's coming without
    # needing the athlete to describe it.
    if planned_upcoming:
        out.append("Planned next 14 days:")
        for p in planned_upcoming:
            zone = p.get("zone") or "—"
            detail = (p.get("detail") or "").replace("\n", " ")
            # Trim very long details to keep the window compact
            if len(detail) > 120:
                detail = detail[:117] + "…"
            actual = " [DONE]" if p.get("actual") else ""
            out.append(
                f"  - {p.get('day', '')} · {p.get('type', '')} · "
                f"{p.get('workout', '')} · zone {zone}{' · ' + detail if detail else ''}{actual}"
            )

    # Full 10-week plan skeleton — only when the user asked (detects
    # keywords like "full plan", "all weeks", "week 5", etc.)
    if include_full_plan and full_plan:
        wk_lines = full_plan.get("weeks") or []
        dy_lines = full_plan.get("days") or []
        if wk_lines:
            out.append("Full plan overview (all weeks):")
            for w in wk_lines:
                out.append(
                    f"  Wk {w.get('num')} ({w.get('dates')}, {w.get('miles')}mi): "
                    f"{w.get('focus')}"
                )
        if dy_lines:
            out.append("Full plan by day:")
            for d in dy_lines:
                out.append(
                    f"  {d.get('day', '')} · {d.get('type', '')} · "
                    f"{d.get('workout', '')} · zone {d.get('zone', '—')}"
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
# Triggers that request the FULL 10-week plan (not just the 14-day window)
FULL_PLAN_RE = re.compile(
    r"\b(full plan|entire plan|whole plan|all weeks|all 10 weeks|rest of (?:the |my )?plan|"
    r"remaining (?:weeks|plan)|every week|race week|peak week|taper week|week \d+|"
    r"overview of (?:the |my )?plan)\b",
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


def detect_full_plan_trigger(user_msg: str) -> bool:
    """Should we render the entire 10-week plan skeleton, not just the
    default 14-day window? Triggered by explicit requests to see more
    of the plan."""
    if not user_msg:
        return False
    return bool(FULL_PLAN_RE.search(user_msg))


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

def _normalize_fact(s: str) -> str:
    """Lowercase + collapse whitespace + strip trivial punctuation for
    deterministic dedup comparison. Not bulletproof but catches the
    common case of the same sentence arriving twice."""
    s = re.sub(r"[^\w\s]", " ", s.lower())
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _about_me_bullets(about_me: str) -> list[str]:
    """Split an About Me document into individual bullet / line facts."""
    if not about_me:
        return []
    out: list[str] = []
    for raw in about_me.splitlines():
        line = raw.strip()
        if not line:
            continue
        # Strip common bullet markers
        line = re.sub(r"^[-*•]\s*", "", line)
        if line:
            out.append(line)
    return out


def fact_already_known(
    fact: str,
    about_me: str,
    athlete_profile: dict[str, Any] | None,
    race: dict[str, Any] | None,
) -> bool:
    """Return True when the fact is already captured somewhere the
    coach can see — About Me bullets, the athlete profile, or the race
    info. Uses a soft token-overlap heuristic so paraphrases still
    collide (e.g. 'I run in Oakland' vs 'I'm based in Oakland')."""
    norm_fact = _normalize_fact(fact)
    if not norm_fact:
        return True  # empty fact, ignore

    # Collect reference text
    reference_blobs: list[str] = []
    for b in _about_me_bullets(about_me):
        reference_blobs.append(b)
    if athlete_profile:
        for k in ("name", "currentBase", "weeklyStructure"):
            v = athlete_profile.get(k)
            if v:
                reference_blobs.append(str(v))
    if race:
        for k in ("name", "distance", "date", "course", "elevation"):
            v = race.get(k)
            if v:
                reference_blobs.append(str(v))

    fact_tokens = set(norm_fact.split())
    # Drop stop-ish words to avoid false negatives from common fillers
    fact_tokens -= {
        "a", "an", "the", "and", "or", "but", "i", "im", "my", "me",
        "is", "are", "to", "of", "for", "on", "in", "at", "with",
        "you", "he", "she", "they", "it",
    }
    if not fact_tokens:
        return True

    for blob in reference_blobs:
        nb = _normalize_fact(blob)
        if not nb:
            continue
        # Exact substring match
        if norm_fact in nb or nb in norm_fact:
            return True
        # Token-overlap: if 70%+ of fact's meaningful tokens appear in
        # the blob, treat as already covered. Tuned low enough to catch
        # paraphrases, high enough to let genuinely new facts through.
        blob_tokens = set(nb.split())
        if not blob_tokens:
            continue
        overlap = len(fact_tokens & blob_tokens)
        if overlap / len(fact_tokens) >= 0.7:
            return True

    return False


def detect_inferences(
    athlete_id: str,
    user_msg: str,
    assistant_msg: str,
    existing_about_me: str = "",
    athlete_profile: dict[str, Any] | None = None,
    race: dict[str, Any] | None = None,
) -> list[str]:
    """Scan the latest exchange for durable athlete facts worth surfacing.
    Returns short first-person statements suitable for appending to
    About Me. Empty list means nothing durable was learned that isn't
    already known.

    The detector is given existing About Me + athlete profile + race so it
    can self-filter duplicates. A post-filter does a second pass with
    `fact_already_known` to catch paraphrases the model missed.
    """
    try:
        known_lines: list[str] = []
        if athlete_profile:
            name = athlete_profile.get("name") or "Athlete"
            max_hr = athlete_profile.get("maxHR")
            structure = athlete_profile.get("weeklyStructure") or ""
            base = athlete_profile.get("currentBase") or ""
            known_lines.append(
                f"- Athlete profile: {name}, max HR {max_hr or '?'}, "
                f"base {base}, structure {structure}"
            )
        if race:
            known_lines.append(
                f"- Race: {race.get('name', '')} on {race.get('date', '')}, "
                f"{race.get('distance', '')}, {race.get('elevation', '')}, "
                f"course: {race.get('course', '')}"
            )
        if existing_about_me and existing_about_me.strip():
            known_lines.append("- Existing About Me:")
            for b in _about_me_bullets(existing_about_me):
                known_lines.append(f"    • {b}")
        known_block = "\n".join(known_lines) if known_lines else "(none)"

        result = call_anthropic(
            model=HAIKU_MODEL,
            system=(
                "You extract durable facts the coach should remember about "
                "this athlete from a single chat exchange. You are NOT a "
                "conversational agent — respond only with the JSON array.\n\n"
                "DURABLE = true across many sessions: injuries, chronic "
                "limitations, body context, life/work/travel constraints, "
                "long-term goals beyond this race, equipment preferences, "
                "training philosophy, schedule patterns.\n\n"
                "NOT DURABLE (never output): today's readiness, this week's "
                "workout, transient feelings, one-off sleep, single session "
                "notes.\n\n"
                "ALREADY KNOWN — DO NOT OUTPUT: anything described in the "
                "athlete profile, race info, or existing About Me below. "
                "Anything that is part of the training plan (weekly "
                "structure, race logistics, workout types, elevation, HR "
                "zones) is considered known and must not be re-extracted. "
                "Paraphrases of known facts are still duplicates — skip "
                "them.\n\n"
                "Output: JSON array of short first-person statements, max 2 "
                "items. Empty array `[]` is the correct answer in most "
                "exchanges. Output ONLY the JSON."
            ),
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"KNOWN CONTEXT (do not re-extract any of this):\n"
                        f"{known_block}\n\n"
                        f"Athlete said:\n{user_msg}\n\n"
                        f"Coach replied:\n{assistant_msg}\n\n"
                        "New durable facts, if any:"
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
        candidates = [str(s).strip() for s in parsed if str(s).strip()]
        # Post-filter: drop anything the heuristic already considers known.
        # The LLM is inconsistent about respecting "already known" instructions,
        # so belt-and-suspenders dedup here.
        novel: list[str] = []
        for c in candidates:
            if not fact_already_known(c, existing_about_me, athlete_profile, race):
                # Also dedup against facts added earlier in this same batch
                if not any(
                    fact_already_known(c, "\n".join(novel), None, None)
                    for _ in [0]
                ):
                    novel.append(c)
        return novel[:2]
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
