"""Reproduce the real `daily` insight surface for behavioral evals.

The whole point of the harness is to exercise the SAME system prompt +
context block + model routing that `api/coach/insight.py` builds for the
`daily` surface, so a prompt regression shows up here. We import the real
builders rather than re-implementing them.

Two entry points:
- `build_daily_call(snapshot)`  → (system, context_block, user_msg)  [no API]
- `run_fixture(snapshot)`       → (reply_text, context_block, model)  [LIVE API]

`build_daily_call` is pure and is what the keyless fixture-honesty tests use
to assert each fixture actually produces its intended scenario (e.g. a
`PR_STATUS: NO` line) before we ever spend a token on the live model.
"""

from __future__ import annotations

from typing import Any

from api.coach._core import (
    HAIKU_MODEL,
    SONNET_MODEL,
    PLAYFUL_TRAITS_FOR_MODEL_BUMP,
    build_context_block,
    build_system_prompt,
    call_anthropic,
)
from api.coach.insight import SURFACE_INSTRUCTIONS, _format_directive


def build_daily_call(
    snapshot: dict[str, Any],
    extra_user_question: str | None = None,
) -> tuple[str, str, str]:
    """Assemble the `daily` surface exactly as insight.py does (sans KV memory).

    Mirrors insight.py: build_system_prompt(lite_knowledge=True) +
    build_context_block(depth="7d", max_activities=15) + the daily task +
    the persona FORMAT directive. `about_me`/inferences/summary are empty
    (tests don't touch KV).
    """
    system = build_system_prompt(
        about_me="",
        pending_inferences=[],
        conversation_summary=None,
        athlete_profile=snapshot.get("athleteProfile"),
        race=snapshot.get("race"),
        coach_persona=snapshot.get("coachPersona"),
        lite_knowledge=True,
        zones=snapshot.get("zones"),
    )
    context_block = build_context_block(snapshot, depth="7d", max_activities=15)
    instructions = SURFACE_INSTRUCTIONS["daily"]

    user_msg = f"Context snapshot:\n{context_block}\n\nTask:\n{instructions}"
    fmt = _format_directive(snapshot.get("coachPersona"))
    if fmt:
        user_msg += "\n\n" + fmt
    if extra_user_question:
        # The "can I add a hard session" scenario rides in as an explicit
        # athlete question appended to the daily task.
        user_msg += f"\n\nThe athlete asks: {extra_user_question}"
    return system, context_block, user_msg


def pick_model_for_daily(snapshot: dict[str, Any], context_block: str) -> str:
    """Mirror insight.py's daily model routing (persona bump + PR_STATUS bump).

    Kept in lock-step with insight.py so the eval tests whatever model
    production would actually use. NOTE: the PR_STATUS→Sonnet bump here is
    the one R3 removes; when R3 lands, drop the final branch to match.
    """
    persona = snapshot.get("coachPersona")
    model = HAIKU_MODEL
    if persona:
        has_name = bool((persona.get("name") or "").strip())
        traits = [str(t).lower() for t in (persona.get("traits") or [])]
        playful = sum(1 for t in traits if t in PLAYFUL_TRAITS_FOR_MODEL_BUMP)
        if (has_name and playful >= 1) or playful >= 2:
            model = SONNET_MODEL
    if "PR_STATUS:" in context_block:
        model = SONNET_MODEL
    return model


def run_fixture(
    snapshot: dict[str, Any],
    extra_user_question: str | None = None,
    *,
    temperature: float = 0.0,
) -> tuple[str, str, str]:
    """LIVE: build the daily call, hit the model once, return (reply, ctx, model).

    temperature pinned to 0.0 for repeatability (prod uses 0.2). athlete_id
    is None so no telemetry/KV writes happen.
    """
    system, ctx, user_msg = build_daily_call(snapshot, extra_user_question)
    model = pick_model_for_daily(snapshot, ctx)
    result = call_anthropic(
        model=model,
        system=system,
        messages=[{"role": "user", "content": user_msg}],
        max_tokens=400,
        temperature=temperature,
        athlete_id=None,
        surface="eval:daily",
    )
    return (result.get("text") or "").strip(), ctx, model
