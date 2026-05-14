"""Proactive coach ping generator.

POST /api/coach/ping
{ athleteId, trigger: { type, payload }, snapshot }

Respects per-trigger-type cooldowns. On success, appends an unread
coach turn to memory and returns the updated memory.
"""

import time
from http.server import BaseHTTPRequestHandler

from ._core import (
    HAIKU_MODEL,
    SONNET_MODEL,
    build_context_block,
    build_system_prompt,
    call_anthropic,
    kv_get,
    kv_set,
    load_memory,
    new_turn_id,
    ping_cooldown_key,
    read_json_body,
    save_memory,
    send_cors_preflight,
    send_json,
)


COOLDOWN_SECONDS = {
    "new_workout": 3600,          # 1h
    "readiness_shift": 24 * 3600,
    "skipped_workout": 24 * 3600,
    "weekly_recap": 6 * 24 * 3600,  # roughly once/week
    "weekly_arc": 6 * 24 * 3600,    # fires Monday morning, ~weekly
    # Sprint 2 — adverse-signal triggers that propose a plan edit.
    "hrv_drop": 12 * 3600,
    "acwr_spike": 24 * 3600,
    "compliance_drift": 48 * 3600,
    # Sprint 4 — anniversary moments. Long cooldown — milestones are
    # multi-week apart and the client already dedups per-milestone in
    # localStorage; server cooldown is a belt-and-braces guard against
    # double-fires if the client retries on a network blip.
    "anniversary": 14 * 24 * 3600,
}


# Sprint 2 — adverse-signal triggers don't just inform; they negotiate.
# We tell the model to emit a `proposal` block when the data warrants
# one, using the same schema as in-chat proposals. The frontend's
# existing proposal parser + ProposalCard render the apply/modify/reject
# affordance. Athletica's "passive black box" complaint hinges on plans
# being auto-modified without explanation; we invert this — the coach
# initiates a conversation, the athlete approves.
_PROPOSAL_DIRECTIVE = (
    " If the data clearly warrants a workout change (RED readiness, "
    "load spike, repeated misses), end your message with a `proposal` "
    "block per the format in your system prompt — the athlete will see "
    "an Apply / Modify / Keep original card. If you propose a change, "
    "open the message with the specific signal that triggered it "
    "(e.g. \"HRV down 22% vs baseline\") so the athlete sees the "
    "evidence before the prescription."
)


TRIGGER_PROMPTS = {
    "new_workout": (
        "The athlete just synced a new workout. Write a 1-2 sentence coach "
        "reaction: acknowledge what they did (specific numbers), one concrete "
        "observation or question grounded in the snapshot. No generic praise."
    ),
    "readiness_shift": (
        "The athlete's readiness band shifted. Write a 1-2 sentence coach "
        "heads-up grounded in the specific drivers (HRV, RHR, sleep, load). "
        "One concrete cue for today." + _PROPOSAL_DIRECTIVE
    ),
    "skipped_workout": (
        "The athlete skipped today's scheduled workout. Write a 1-2 sentence "
        "coach check-in (non-judgmental), reference what was scheduled, and "
        "ask one specific question to understand context."
    ),
    "weekly_recap": (
        "End-of-week recap. Write a 2-3 sentence summary grounded in this "
        "week's specific numbers (mileage, time-in-zones, compliance, load "
        "trend). Highlight one thing that went well and one thing to watch "
        "next week."
    ),
    "weekly_arc": (
        "It's the start of a new training week. Frame the week ahead in "
        "2-3 sentences. Name the phase (Base / Build / Peak / Taper / "
        "Recovery — pick from the plan context) and the ONE purpose of "
        "this week's stress. Tell them what to expect physically (heavy "
        "legs, hunger, sleep need). End with exactly ONE citation: either "
        "a baked-in reference (Bompa, Seiler, Bosquet, Plews, Toyomura, "
        "Vernillo, Pellegrini) or 'Source: core endurance methodology "
        "(Uphill Athlete, TrainingPeaks)'. Never invent citations. No "
        "proposal block — this is orientation, not adjustment."
    ),
    "hrv_drop": (
        "The athlete's HRV has dropped meaningfully vs their 7-day "
        "baseline. Open with the specific delta (\"HRV is down X% vs "
        "your 7-day baseline of Yms\"). In 1-2 sentences, explain what "
        "that signals (likely autonomic stress, illness incubating, "
        "incomplete recovery from recent load) and whether today's "
        "planned workout is still appropriate. Look at the planned "
        "workout in the snapshot — if it's hard (quality / long / "
        "race-sim) and HRV is down meaningfully, propose a swap to "
        "easy or rest. If it's already easy, you may just acknowledge "
        "and skip the proposal." + _PROPOSAL_DIRECTIVE
    ),
    "acwr_spike": (
        "The athlete's Load Ratio (acute:chronic) has crossed into the "
        "caution band (>1.3) or danger band (>1.5). Open with the "
        "specific number from the snapshot. In 1-2 sentences, explain "
        "what that means (acute load running too far ahead of chronic "
        "base — injury risk window). Look at the next 2-3 planned days "
        "in the snapshot — propose either a deload swap or moving "
        "intensity later in the week to let chronic load catch up."
        + _PROPOSAL_DIRECTIVE
    ),
    "compliance_drift": (
        "The athlete has missed 2+ scheduled workouts in the last 7 "
        "days. Open with the specific count and which workouts (from "
        "the snapshot). Write 1-2 sentences — non-judgmental, curious. "
        "Ask ONE specific question about what's getting in the way "
        "(scheduling, motivation, life events, soreness). Don't "
        "propose a plan change yet — get the context first. Compliance "
        "drift is a relationship signal, not a load signal."
    ),
    "anniversary": (
        "The athlete just crossed a training-relationship milestone "
        "(see Trigger payload for the day count: 30 / 60 / 90 / 180 / "
        "365). Write a 3-4 sentence anniversary note that:\n"
        "1. Names the milestone explicitly ('30 days in', 'half a year "
        "of training together', etc.).\n"
        "2. Cites 1-2 CONCRETE changes since they started — pull from "
        "the snapshot: Fitness delta, long-run distance/vert, "
        "compliance %, or a specific About Me fact that's evolved. "
        "Never generic ('you've made progress'). Always specific "
        "numbers or a named fact.\n"
        "3. Ends with one short forward look — what's the next phase "
        "or focus.\n"
        "Voice: warmer than normal, match the persona. No proposal "
        "block — anniversaries are reflection, not adjustment. End "
        "without a question; let the moment land."
    ),
}


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_POST(self):
        body = read_json_body(self)
        athlete_id = str(body.get("athleteId", "")).strip()
        trigger = body.get("trigger") or {}
        trigger_type = str(trigger.get("type", "")).strip()
        payload = trigger.get("payload") or {}
        snapshot = body.get("snapshot") or {}

        if not athlete_id or not trigger_type:
            send_json(self, 400, {"error": "athleteId and trigger.type required"})
            return
        if trigger_type not in TRIGGER_PROMPTS:
            send_json(self, 400, {"error": f"unknown trigger type: {trigger_type}"})
            return

        # Cooldown check
        cd_key = ping_cooldown_key(athlete_id, trigger_type)
        if kv_get(cd_key):
            send_json(self, 200, {"skipped": True, "reason": "cooldown"})
            return

        memory = load_memory(athlete_id)
        system = build_system_prompt(
            about_me=memory.get("aboutMe", ""),
            pending_inferences=memory.get("pendingInferences", []),
            conversation_summary=memory.get("conversationSummary"),
            athlete_profile=snapshot.get("athleteProfile"),
            race=snapshot.get("race"),
            coach_persona=snapshot.get("coachPersona") or memory.get("coachPersona"),
            zones=snapshot.get("zones"),
        )
        ctx = build_context_block(snapshot, depth="7d")
        instruction = TRIGGER_PROMPTS[trigger_type]
        payload_block = ""
        if payload:
            payload_block = f"\n\nTrigger payload:\n{payload}"

        user_msg = (
            f"Context snapshot:\n{ctx}\n\n"
            f"Trigger: {trigger_type}{payload_block}\n\n"
            f"Task: {instruction}"
        )

        # Anniversary pings are infrequent and high-stakes — they're the
        # athlete's emotional "the coach knows me" moment. Escalate to
        # Sonnet for richer voice and better milestone narrative. Other
        # pings keep Haiku for speed and cost.
        ping_model = SONNET_MODEL if trigger_type == "anniversary" else HAIKU_MODEL
        ping_max_tokens = 350 if trigger_type == "anniversary" else 200

        try:
            result = call_anthropic(
                model=ping_model,
                system=system,
                messages=[{"role": "user", "content": user_msg}],
                max_tokens=ping_max_tokens,
                temperature=0.2,
                athlete_id=athlete_id,
                surface=f"ping:{trigger_type}",
                log_sample=True,
            )
            text = (result.get("text") or "").strip()
        except Exception as e:
            send_json(self, 502, {"error": f"llm_unavailable: {e}"})
            return

        if not text:
            send_json(self, 200, {"skipped": True, "reason": "empty"})
            return

        # Set cooldown
        try:
            kv_set(cd_key, str(int(time.time())), ex=COOLDOWN_SECONDS[trigger_type])
        except Exception:
            pass

        # Append coach turn
        memory["conversation"].append(
            {
                "id": new_turn_id(),
                "role": "coach",
                "content": text,
                "ts": int(time.time() * 1000),
                "unread": True,
                "trigger": trigger_type,
            }
        )
        save_memory(athlete_id, memory)
        send_json(self, 200, memory)
