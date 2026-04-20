"""Single-shot cached insight generator.

POST /api/coach/insight
{ athleteId, surface, contextHash, snapshot }

Returns { text, tone?, tip?, generatedAt, cached: bool }
"""

import time
from http.server import BaseHTTPRequestHandler

from ._core import (
    HAIKU_MODEL,
    SONNET_MODEL,
    PLAYFUL_TRAITS_FOR_MODEL_BUMP,
    build_context_block,
    build_system_prompt,
    call_anthropic,
    insight_key,
    kv_get_json,
    kv_set_json,
    load_memory,
    read_json_body,
    send_cors_preflight,
    send_json,
)


SURFACE_INSTRUCTIONS = {
    "daily": (
        "Write a short (3-5 sentence) coach read for the athlete. The "
        "context snapshot tells you the current time of day (morning, "
        "afternoon, or evening) — open with 'Good morning', 'Good "
        "afternoon', or 'Good evening' (or a persona-flavored equivalent) "
        "and frame your read accordingly:\n"
        "- Morning: what today's signal says + how to approach the day's workout.\n"
        "- Afternoon: check-in on execution — did they log a workout? If so, "
        "reflect on it. If not, what's still on the plate.\n"
        "- Evening: wrap-up — how the day went, what matters for tomorrow, "
        "recovery cues (sleep, hydration).\n"
        "Ground it in specific numbers from the snapshot (HRV ms, sleep h, "
        "Fitness, Fatigue, Recovery Balance, etc.). Use the friendly metric "
        "names (Fitness not CTL, Fatigue not ATL, Recovery Balance not TSB, "
        "Load Ratio not ACWR) — never use the acronyms.\n"
        "IMPORTANT: your Persona block at the top of the system prompt is "
        "the voice for this read. If you're Funny → humor woven in. If "
        "you're Motivational → fire them up with the data, don't suppress "
        "it. If Data Nerd → cite the numbers with precision. Do NOT default "
        "to a flat, neutral tone — that contradicts the persona the "
        "athlete configured. Markdown bold/emojis fine. Short paragraphs."
    ),
    "day_card": (
        "Write a one-sentence, high-specificity note for this day's card on "
        "the training plan. Include the single most important cue for this "
        "workout today given readiness and recent load. Match your configured "
        "persona in voice. If there is nothing worth saying on this day, "
        "output the literal text SILENT."
    ),
    "workout_take": (
        "Write a 2-3 sentence 'Coach's take' framing this specific workout "
        "now — how to execute given today's readiness and the athlete's "
        "recent load. Match your configured persona in voice (Funny → "
        "humor; Motivational → fire them up; Data Nerd → cite numbers). "
        "End with one short optional tip on a new line prefixed with "
        "'Tip: '."
    ),
}


def _surface_key(surface: str) -> str:
    # surface can be "daily" or "day_card:<label>" or "workout_take:<label>"
    return surface.split(":", 1)[0]


def _parse_take(text: str) -> dict:
    """Parse out optional 'Tip: ...' line from workout_take output."""
    lines = [l for l in text.strip().splitlines() if l.strip()]
    tip = None
    body_lines = []
    for l in lines:
        if l.strip().lower().startswith("tip:"):
            tip = l.split(":", 1)[1].strip()
        else:
            body_lines.append(l)
    return {"text": "\n".join(body_lines).strip(), "tip": tip}


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_POST(self):
        body = read_json_body(self)
        athlete_id = str(body.get("athleteId", "")).strip()
        surface = str(body.get("surface", "")).strip()
        context_hash = str(body.get("contextHash", "")).strip()
        snapshot = body.get("snapshot") or {}
        # Force=true bypasses BOTH client and server cache. The Regenerate
        # button on CoachInsightCard sets this so re-generating with the
        # same context (same persona, same readiness) actually produces a
        # fresh LLM call instead of replaying the KV-cached version.
        force = bool(body.get("force"))

        if not athlete_id or not surface or not context_hash:
            send_json(self, 400, {"error": "athleteId, surface, contextHash required"})
            return

        cache_key = insight_key(athlete_id, surface, context_hash)
        if not force:
            cached = kv_get_json(cache_key)
            if cached and isinstance(cached, dict):
                cached["cached"] = True
                send_json(self, 200, cached)
                return

        # Build prompt
        surface_root = _surface_key(surface)
        instructions = SURFACE_INSTRUCTIONS.get(surface_root, SURFACE_INSTRUCTIONS["daily"])

        memory = load_memory(athlete_id)
        system = build_system_prompt(
            about_me=memory.get("aboutMe", ""),
            pending_inferences=memory.get("pendingInferences", []),
            conversation_summary=memory.get("conversationSummary"),
            athlete_profile=snapshot.get("athleteProfile"),
            race=snapshot.get("race"),
            coach_persona=snapshot.get("coachPersona") or memory.get("coachPersona"),
            lite_knowledge=True,
            zones=snapshot.get("zones"),
        )
        context_block = build_context_block(snapshot, depth="7d", max_activities=15)

        # For day_card / workout_take include the specific day label in the user msg
        day_label = ""
        if ":" in surface:
            day_label = surface.split(":", 1)[1]

        user_msg = (
            f"Context snapshot:\n{context_block}\n\n"
            + (f"Target day: {day_label}\n\n" if day_label else "")
            + "Task:\n"
            + instructions
        )

        # Route to Sonnet when the athlete has a playful/rich persona —
        # Haiku produces flat voice, and the daily insight is a primary
        # persona-visible surface. Same routing logic as chat.py's
        # pick_model so both channels feel like the same coach.
        persona_for_model = snapshot.get("coachPersona") or memory.get("coachPersona")
        model_to_use = HAIKU_MODEL
        if persona_for_model:
            has_name = bool((persona_for_model.get("name") or "").strip())
            traits = [str(t).lower() for t in (persona_for_model.get("traits") or [])]
            playful_count = sum(1 for t in traits if t in PLAYFUL_TRAITS_FOR_MODEL_BUMP)
            if (has_name and playful_count >= 1) or playful_count >= 2:
                model_to_use = SONNET_MODEL

        # Race-result days are high-stakes for accuracy. Haiku tends to
        # hallucinate PR deltas regardless of the PR_STATUS directive; the
        # athlete calls these mistakes out in every testing session.
        # Upgrade to Sonnet whenever the context includes a PR_STATUS line
        # (i.e. today has a completed activity with a distance baseline).
        if "PR_STATUS:" in context_block:
            model_to_use = SONNET_MODEL

        try:
            result = call_anthropic(
                model=model_to_use,
                system=system,
                messages=[{"role": "user", "content": user_msg}],
                max_tokens=400,
                # Low temperature on the daily summary: it states facts
                # about PR status, dates, pace, and readiness. We need
                # the model to follow the PR_STATUS line in the context
                # literally, not paraphrase into hallucinated deltas.
                temperature=0.2,
                athlete_id=athlete_id,
                surface=f"insight:{surface_root}",
                log_sample=True,
            )
            text = (result.get("text") or "").strip()
        except Exception as e:
            send_json(self, 502, {"error": f"llm_unavailable: {e}"})
            return

        if not text:
            send_json(self, 204, {"error": "empty response"})
            return

        # SILENT = explicit suppression for day_card
        if text.strip().upper() == "SILENT":
            payload = {"text": "", "silent": True, "generatedAt": int(time.time() * 1000)}
            kv_set_json(cache_key, payload, ex=48 * 3600)
            send_json(self, 200, {**payload, "cached": False})
            return

        payload: dict = {"generatedAt": int(time.time() * 1000)}
        if surface_root == "workout_take":
            parsed = _parse_take(text)
            payload["text"] = parsed["text"]
            if parsed["tip"]:
                payload["tip"] = parsed["tip"]
        else:
            payload["text"] = text

        kv_set_json(cache_key, payload, ex=48 * 3600)
        send_json(self, 200, {**payload, "cached": False})
