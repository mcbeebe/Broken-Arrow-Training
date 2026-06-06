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
    detect_workout_inferences,
    insight_key,
    kv_get_json,
    kv_set_json,
    load_learning_ack,
    load_memory,
    new_fact_id,
    read_json_body,
    save_learning_ack,
    save_memory,
    send_cors_preflight,
    send_json,
    sync_about_me_string,
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
        "FIRST LINE FORMAT (required): begin your reply with a single line "
        "'Triggered by: <dominant signal>' followed by a blank line, then "
        "your coach read. The signal names the ONE concrete thing in the "
        "snapshot that most shaped your message: e.g. "
        "'Triggered by: HRV -22% vs 7d baseline + sleep 5h12m', "
        "'Triggered by: completed long run 7.2 mi / 1,520 ft', "
        "'Triggered by: ACWR 1.42 (caution band)', "
        "'Triggered by: Week 5 recovery phase'. If nothing notable, use "
        "'Triggered by: scheduled check-in'. Keep it terse (under 60 chars). "
        "The line gets surfaced as a chip in the UI — never paraphrase, "
        "never wrap in markdown, never omit.\n"
        "IMPORTANT: your Persona block at the top of the system prompt is "
        "the voice for this read. If you're Funny → humor woven in. If "
        "you're Motivational → fire them up with the data, don't suppress "
        "it. If Data Nerd → cite the numbers with precision. Do NOT default "
        "to a flat, neutral tone — that contradicts the persona the "
        "athlete configured. Markdown bold/emojis fine. Default to short "
        "paragraphs UNLESS a FORMAT line below tells you the athlete picked "
        "a Bullets persona — in that case use a scannable bullet list."
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
    "workout_debrief": (
        "Debrief the workout in the 'JUST COMPLETED — debrief target' block "
        "of the context — the one the athlete just finished and is looking "
        "at right now. This is a post-workout reflection on a PAST effort, "
        "NOT a read on today's readiness. Write 3-5 sentences:\n"
        "1. Acknowledge the specific effort by name and the headline numbers "
        "(distance, time, climb, HR).\n"
        "2. Read planned-vs-actual using the letter grade as objective "
        "evidence, then EXPLICITLY reconcile it against the athlete's "
        "subjective inputs — their RPE and their own note. When the athlete "
        "left a note, QUOTE or closely paraphrase a few of their own words "
        "back to them (e.g. \"you said your legs felt strong on the climbs\") "
        "so it is unmistakable you read it. When their note and the grade "
        "diverge (a solid grade but RPE 8, or a note about pain / heavy legs "
        "/ hard breathing), trust the subjective signal and say so out loud "
        "— that is the most valuable part of the debrief.\n"
        "3. One line on how this session fits the current training block / "
        "phase (use the 'Training block' context if present).\n"
        "4. One concrete forward-looking cue (recovery, fuel, what the next "
        "session should respect).\n"
        "Ground every claim in the numbers and the note from the context — "
        "never invent details. Do NOT propose a plan change here; this is a "
        "reflection. This is structure, NOT voice: deliver the whole thing "
        "in your configured persona (Funny → rib them; Motivational → fire "
        "them up; Data Nerd → cite the numbers; demanding → be blunt). Do "
        "NOT default to a flat, neutral coaching tone — that contradicts the "
        "persona the athlete configured. Markdown bold/emojis fine for "
        "playful personas. No greeting line, no 'Triggered by:' chip. If a "
        "FORMAT line below says the athlete picked a Bullets persona, deliver "
        "the debrief as a scannable bullet list instead of paragraphs."
    ),
    "why": (
        "Explain WHY this prescription makes sense for this athlete right "
        "now. Output EXACTLY this 3-line structure, no preamble, no "
        "persona-flavored intro, no markdown headers:\n"
        "Line 1 — Mechanism (1 sentence): the training principle this "
        "workout targets (e.g. eccentric strength for descent quad "
        "durability, polarized Z1-2 for aerobic base, taper supercompensation). "
        "Use the friendly metric names from the system prompt.\n"
        "Line 2 — Why YOU (1 sentence): the personal signal that makes "
        "this prescription specific to THIS athlete today. Reference at "
        "least one of: their About Me, a recent actual workout with "
        "numbers, readiness status, their race date proximity. "
        "Never generic.\n"
        "Line 3 — Source: ONE citation. Either a baked-in reference "
        "verbatim from your APP_KNOWLEDGE block (e.g. 'Source: Bosquet et "
        "al. 2007 taper meta-analysis') or a real result from `web_search` "
        "with the URL. If neither applies and the principle is core "
        "Uphill Athlete / TrainingPeaks doctrine, you may write 'Source: "
        "core endurance methodology (Uphill Athlete, TrainingPeaks)'. "
        "NEVER invent authors, years, or journals.\n"
        "Hard rule: no opening greeting, no persona voice, no 'Hey' / 'Look' "
        "/ 'Listen' — just the 3 lines. Total length under 90 words."
    ),
}


def _surface_key(surface: str) -> str:
    # surface can be "daily" or "day_card:<label>" or "workout_take:<label>"
    return surface.split(":", 1)[0]


def _format_directive(persona: dict | None) -> str:
    """Derive an explicit FORMAT instruction from the athlete's persona.

    The narrative-leaning surfaces (daily read, workout debrief) describe
    their shape as sentences/paragraphs in their task block, which is the
    freshest thing the model reads and can override the Bullets/Concise
    formatting baked into the system prompt's Persona block. So when the
    athlete picked Bullets/Concise/Narrative, restate it here as the last
    word on format. Returns "" when the persona has no format preference.
    """
    if not persona:
        return ""
    traits = {str(t).lower() for t in (persona.get("traits") or [])}
    parts: list[str] = []
    # bullets vs narrative are mutually exclusive in the UI; bullets wins
    # if both somehow appear.
    if "bullets" in traits:
        parts.append(
            "the athlete picked a BULLETS persona — deliver this as a short, "
            "scannable bullet list (a one-line lead is fine, then bullets), "
            "NOT flowing paragraphs. This overrides any 'short paragraphs' "
            "default in the task above."
        )
    elif "narrative" in traits:
        parts.append(
            "the athlete picked a NARRATIVE persona — short connected "
            "paragraphs, no bullet lists."
        )
    if "concise" in traits:
        parts.append(
            "keep it tight — lead with the takeaway and cut the preamble."
        )
    if not parts:
        return ""
    return "FORMAT — " + " ".join(parts)


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

        # Daily-narrative-only: surface About Me facts the coach hasn't
        # acknowledged yet, so they get noticed in the narrative exactly
        # once instead of as a separate "the coach just learned X" UI
        # affordance. Other surfaces (workout_take, day_card, why) are
        # functional and skip this — they shouldn't drift into narrative.
        new_learnings: list[dict] = []
        ack_record: dict = {"ackedIds": [], "initialized": True}
        if surface_root == "daily":
            ack_record = load_learning_ack(athlete_id)
            facts = memory.get("aboutMeFacts") or []
            if not ack_record["initialized"]:
                # First-ever read for this athlete — seed the set with
                # every existing fact id so we don't suddenly narrate
                # weeks of accumulated memory in the next insight. New
                # facts added after this point will flow naturally.
                seed_ids = [str(f.get("id")) for f in facts if f.get("id")]
                save_learning_ack(athlete_id, seed_ids)
                ack_record = {"ackedIds": seed_ids, "initialized": True}
            else:
                acked = set(ack_record["ackedIds"])
                # Newest-first; the coach should notice the most recent
                # learning first. Cap at 5 — more than that and the
                # directive starts feeling like a checklist regardless
                # of the "skip if forced" hedge in the prompt.
                ordered = sorted(
                    facts,
                    key=lambda f: f.get("learnedAt") or 0,
                    reverse=True,
                )
                for f in ordered:
                    fid = str(f.get("id") or "")
                    txt = str(f.get("text") or "").strip()
                    if fid and txt and fid not in acked:
                        new_learnings.append({"id": fid, "text": txt})
                    if len(new_learnings) >= 5:
                        break

        learnings_block = ""
        if new_learnings:
            bullets = "\n".join(f"- {nl['text']}" for nl in new_learnings)
            learnings_block = (
                "\nRECENT LEARNINGS the athlete shared since your last "
                "daily check-in — you have NOT acknowledged these yet:\n"
                f"{bullets}\n\n"
                "If — and only if — one of these is genuinely relevant to "
                "today's read, weave in ONE brief natural acknowledgment "
                "in your own voice (e.g. \"Noted the Sunday long-run "
                "preference — that lines up with…\"). Hard rules: at "
                "most one acknowledgment, never list them, never re-"
                "summarize all of them, and skip entirely if it would "
                "feel forced. The athlete should feel noticed, not "
                "lectured.\n"
            )

        # Restate the athlete's format preference (Bullets/Concise/Narrative)
        # as the last word on shape for the narrative-leaning surfaces — their
        # task block describes sentences/paragraphs and would otherwise drown
        # out the Persona block's formatting in the system prompt.
        format_block = ""
        if surface_root in ("daily", "workout_debrief"):
            directive = _format_directive(
                snapshot.get("coachPersona") or memory.get("coachPersona")
            )
            if directive:
                format_block = "\n\n" + directive

        user_msg = (
            f"Context snapshot:\n{context_block}\n\n"
            + (f"Target day: {day_label}\n\n" if day_label else "")
            + learnings_block
            + "Task:\n"
            + instructions
            + format_block
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

        # R3 — the unconditional Haiku→Sonnet bump on PR days is retired. The
        # post-generation validator in call_anthropic (validate_context below)
        # now scrubs any PR / pace / delta hallucination regardless of model,
        # so PR-day routing stays persona-driven and cheap.

        # The workout debrief reconciles the objective grade against the
        # athlete's subjective RPE/note and is a primary persona-visible
        # surface — Haiku's flat voice and weaker reconciliation hurt it.
        # Always Sonnet, with a little more room than the daily read.
        if surface_root == "workout_debrief":
            model_to_use = SONNET_MODEL

        try:
            result = call_anthropic(
                model=model_to_use,
                system=system,
                messages=[{"role": "user", "content": user_msg}],
                max_tokens=500 if surface_root == "workout_debrief" else 400,
                # Low temperature on the daily summary: it states facts
                # about PR status, dates, pace, and readiness. We need
                # the model to follow the PR_STATUS line in the context
                # literally, not paraphrase into hallucinated deltas.
                temperature=0.2,
                athlete_id=athlete_id,
                surface=f"insight:{surface_root}",
                log_sample=True,
                # R3 — gate PR/pace/delta claims against the PR_STATUS line.
                validate_context=context_block,
            )
            text = (result.get("text") or "").strip()
        except Exception as e:
            send_json(self, 502, {"error": f"llm_unavailable: {e}"})
            return

        if not text:
            send_json(self, 204, {"error": "empty response"})
            return

        # Mark surfaced learnings as acknowledged so the coach doesn't
        # mention the same fact twice on subsequent daily insights. We
        # add ALL surfaced ids — the LLM may have woven in only one,
        # but the rest were available context and shouldn't queue back
        # up day after day. New facts added after this call will flow
        # through naturally on the next cache-miss generation.
        if new_learnings and surface_root == "daily":
            updated_ids = list(ack_record["ackedIds"]) + [nl["id"] for nl in new_learnings]
            save_learning_ack(athlete_id, updated_ids)

        # Learning loop — the workout debrief is the one surface fed a full
        # planned-vs-actual + RPE/notes payload, so it's where the coach
        # learns durable training patterns ("what helps / what hurts this
        # athlete"). Extract them from the completed workout + the debrief we
        # just wrote, dedup against existing About Me, and fold the novel ones
        # in. They surface naturally in a later daily insight via the
        # learning-ack block above. Cache-miss only (cached replays returned
        # earlier), so we don't re-learn on every render.
        if surface_root == "workout_debrief":
            lcw = snapshot.get("lastCompletedWorkout")
            if lcw:
                try:
                    facts = detect_workout_inferences(
                        athlete_id,
                        lcw,
                        text,
                        existing_about_me=memory.get("aboutMe", "") or "",
                        athlete_profile=snapshot.get("athleteProfile"),
                        race=snapshot.get("race"),
                    )
                except Exception:
                    facts = []
                if facts:
                    facts_list = memory.setdefault("aboutMeFacts", [])
                    now_ms = int(time.time() * 1000)
                    src = f"workout:{lcw.get('key') or lcw.get('date') or ''}"
                    for f in facts:
                        facts_list.append({
                            "id": new_fact_id(),
                            "text": f,
                            "learnedAt": now_ms,
                            "sourceTurnId": src,
                        })
                    sync_about_me_string(memory)
                    save_memory(athlete_id, memory)

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
