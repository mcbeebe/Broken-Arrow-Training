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
}


TRIGGER_PROMPTS = {
    "new_workout": (
        "The athlete just synced a new workout. Write a 1-2 sentence coach "
        "reaction: acknowledge what they did (specific numbers), one concrete "
        "observation or question grounded in the snapshot. No generic praise."
    ),
    "readiness_shift": (
        "The athlete's readiness band shifted. Write a 1-2 sentence coach "
        "heads-up grounded in the specific drivers (HRV, RHR, sleep, load). "
        "One concrete cue for today."
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

        try:
            result = call_anthropic(
                model=HAIKU_MODEL,
                system=system,
                messages=[{"role": "user", "content": user_msg}],
                max_tokens=200,
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
