"""Single-shot cached insight generator.

POST /api/coach/insight
{ athleteId, surface, contextHash, snapshot }

Returns { text, tone?, tip?, generatedAt, cached: bool }
"""

import time
from http.server import BaseHTTPRequestHandler

from ._core import (
    HAIKU_MODEL,
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
        "Write a short (2-3 sentence) daily coach read for the athlete: what "
        "today's signal says, one actionable cue. Ground every sentence in "
        "specific numbers from the snapshot. No fluff, no motivational "
        "generalities. Plain text only."
    ),
    "day_card": (
        "Write a one-sentence, high-specificity note for this day's card on "
        "the training plan. Include the single most important cue for this "
        "workout today given readiness and recent load. Plain text only. If "
        "there is nothing worth saying on this day, output the literal text "
        "SILENT."
    ),
    "workout_take": (
        "Write a 2-3 sentence 'Coach's take' framing this specific workout "
        "now — how to execute given today's readiness and the athlete's "
        "recent load. End with one short optional tip on a new line prefixed "
        "with 'Tip: '. Plain text only."
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

        if not athlete_id or not surface or not context_hash:
            send_json(self, 400, {"error": "athleteId, surface, contextHash required"})
            return

        cache_key = insight_key(athlete_id, surface, context_hash)
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
        )
        context_block = build_context_block(snapshot, depth="7d")

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

        try:
            result = call_anthropic(
                model=HAIKU_MODEL,
                system=system,
                messages=[{"role": "user", "content": user_msg}],
                max_tokens=300,
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
