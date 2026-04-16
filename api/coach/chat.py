"""Streaming chat endpoint.

POST /api/coach/chat
{ athleteId, messages, snapshot }

Streams SSE:
  data: {"type":"delta","text":"..."}
  data: {"type":"done"}

After the stream completes, appends the assistant turn to memory and
runs two best-effort post-processing steps (inference detection,
conversation summary refresh).
"""

import json
import time
from http.server import BaseHTTPRequestHandler

from ._core import (
    HAIKU_MODEL,
    build_context_block,
    build_system_prompt,
    check_and_increment_budget,
    call_anthropic,
    detect_expand_trigger,
    detect_full_plan_trigger,
    detect_inferences,
    fact_already_known,
    load_memory,
    log_llm_call,
    log_sample_event,
    new_turn_id,
    pick_model,
    read_json_body,
    save_memory,
    send_cors_preflight,
    send_json,
    stream_anthropic,
    summarize_conversation,
)


def _write_sse(handler, obj: dict) -> None:
    data = json.dumps(obj)
    try:
        handler.wfile.write(f"data: {data}\n\n".encode())
        handler.wfile.flush()
    except Exception:
        pass


def _compose_messages(memory_turns, new_user_messages) -> list[dict]:
    """Turn stored memory turns + newly-sent messages into an Anthropic-shaped
    message list. `system-handoff` and `coach` roles are folded into user
    context (coach turns become assistant, system-handoff becomes user with a
    [HANDOFF] prefix).
    """
    out = []
    for t in memory_turns:
        role = t.get("role")
        content = t.get("content", "")
        if role == "user":
            out.append({"role": "user", "content": content})
        elif role in ("assistant", "coach"):
            out.append({"role": "assistant", "content": content})
        elif role == "system-handoff":
            out.append(
                {"role": "user", "content": f"[HANDOFF CONTEXT]\n{content}"}
            )
    for m in new_user_messages:
        role = m.get("role", "user")
        if role not in ("user", "assistant"):
            role = "user"
        out.append({"role": role, "content": str(m.get("content", ""))})
    return out


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_POST(self):
        body = read_json_body(self)
        athlete_id = str(body.get("athleteId", "")).strip()
        incoming = body.get("messages") or []
        snapshot = body.get("snapshot") or {}

        if not athlete_id:
            send_json(self, 400, {"error": "athleteId required"})
            return
        if not isinstance(incoming, list) or not incoming:
            send_json(self, 400, {"error": "messages required"})
            return

        # Per-athlete soft daily budget check. Runaway chat loops or
        # abuse shouldn't burn a weekend's worth of tokens. Over the
        # cap → 429 with a clear message; the client can retry tomorrow.
        within_budget, used, budget = check_and_increment_budget(athlete_id)
        if not within_budget:
            send_json(self, 429, {
                "error": "daily_budget_exceeded",
                "message": (
                    f"You've hit today's coach budget ({used}/{budget} calls). "
                    f"Resets at midnight UTC. This is a soft safety cap; ping "
                    f"support if you need it raised."
                ),
                "used": used,
                "budget": budget,
            })
            return

        memory = load_memory(athlete_id)

        # One-time migration: silently fold any legacy pending inferences into
        # About Me with dedup, then clear the list. The approve/dismiss UI has
        # been retired — we do this in the background now, so orphaned entries
        # from the old flow shouldn't linger forever in memory.
        legacy_pending = memory.get("pendingInferences") or []
        if legacy_pending:
            existing_about = memory.get("aboutMe", "") or ""
            merged_lines: list[str] = []
            if existing_about.strip():
                merged_lines.append(existing_about.rstrip())
            for p in legacy_pending:
                t = str(p.get("text", "")).strip()
                if not t:
                    continue
                # Use the same dedup heuristic as the live detector so
                # paraphrases of profile/race/existing facts drop out.
                if fact_already_known(
                    t,
                    "\n".join(merged_lines),
                    snapshot.get("athleteProfile"),
                    snapshot.get("race"),
                ):
                    continue
                merged_lines.append(f"- {t}")
            memory["aboutMe"] = "\n".join(merged_lines) if merged_lines else ""
            memory["pendingInferences"] = []
            save_memory(athlete_id, memory)

        # Append user turn(s) to memory first so they persist even on failure
        for m in incoming:
            if m.get("role") == "user":
                memory["conversation"].append(
                    {
                        "id": new_turn_id(),
                        "role": "user",
                        "content": str(m.get("content", "")),
                        "ts": int(time.time() * 1000),
                    }
                )
            elif m.get("role") == "system-handoff":
                memory["conversation"].append(
                    {
                        "id": new_turn_id(),
                        "role": "system-handoff",
                        "content": str(m.get("content", "")),
                        "ts": int(time.time() * 1000),
                    }
                )
        save_memory(athlete_id, memory)

        messages = _compose_messages(memory["conversation"], [])
        # remove the trailing entries we already appended from memory so we
        # don't double-include; _compose_messages already does that correctly
        # since we pass [] as new_user_messages.

        persona_for_model = snapshot.get("coachPersona") or memory.get("coachPersona")
        model = pick_model(messages, coach_persona=persona_for_model)
        system = build_system_prompt(
            about_me=memory.get("aboutMe", ""),
            pending_inferences=memory.get("pendingInferences", []),
            conversation_summary=memory.get("conversationSummary"),
            athlete_profile=snapshot.get("athleteProfile"),
            race=snapshot.get("race"),
            # Prefer the snapshot's persona (it's fresh), fall back to
            # whatever's in KV memory so a persona set in an earlier
            # session still applies if the client hasn't synced yet.
            coach_persona=snapshot.get("coachPersona") or memory.get("coachPersona"),
        )

        # Decide depth
        last_user_msg = ""
        for m in reversed(incoming):
            if m.get("role") == "user":
                last_user_msg = str(m.get("content", ""))
                break
        depth = "30d" if detect_expand_trigger(last_user_msg) else "7d"
        include_full_plan = detect_full_plan_trigger(last_user_msg)
        ctx = build_context_block(
            snapshot,
            depth=depth,
            include_full_plan=include_full_plan,
        )
        plan_note = "full-plan" if include_full_plan else "14-day"
        system_full = (
            f"{system}\n\n---\n\n"
            f"Current context snapshot ({depth}, plan window: {plan_note}):\n{ctx}"
        )

        # Stream
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        full_text = ""
        usage = {"input": 0, "output": 0}
        t0 = time.time()
        try:
            stream_iter = stream_anthropic(
                model=model,
                system=system_full,
                messages=messages,
                max_tokens=700,
            )
            for kind, payload in stream_iter:
                if kind == "delta":
                    full_text += payload
                    _write_sse(self, {"type": "delta", "text": payload})
                elif kind == "done":
                    # full_text already accumulated
                    pass
                elif kind == "usage":
                    try:
                        usage = json.loads(payload)
                    except Exception:
                        pass
        except Exception as e:
            _write_sse(self, {"type": "error", "message": str(e)})
            _write_sse(self, {"type": "done"})
            try:
                log_llm_call(
                    athlete_id=athlete_id,
                    model=model,
                    surface="chat",
                    input_tokens=0,
                    output_tokens=0,
                    latency_ms=int((time.time() - t0) * 1000),
                    success=False,
                )
            except Exception:
                pass
            return

        # If model said it needs more history and we weren't already 30d, retry
        if full_text.strip().startswith("[NEED_MORE_HISTORY]") and depth != "30d":
            ctx = build_context_block(snapshot, depth="30d")
            system_full = f"{system}\n\n---\n\nCurrent context snapshot (30d):\n{ctx}"
            full_text = ""
            try:
                for kind, payload in stream_anthropic(
                    model=model,
                    system=system_full,
                    messages=messages,
                    max_tokens=700,
                ):
                    if kind == "delta":
                        full_text += payload
                        _write_sse(self, {"type": "delta", "text": payload})
                    elif kind == "usage":
                        try:
                            u2 = json.loads(payload)
                            usage["input"] += u2.get("input", 0)
                            usage["output"] += u2.get("output", 0)
                        except Exception:
                            pass
            except Exception as e:
                _write_sse(self, {"type": "error", "message": str(e)})

        _write_sse(self, {"type": "done"})

        # Log telemetry
        try:
            log_llm_call(
                athlete_id=athlete_id,
                model=model,
                surface="chat",
                input_tokens=usage.get("input", 0),
                output_tokens=usage.get("output", 0),
                latency_ms=int((time.time() - t0) * 1000),
                success=True,
            )
            log_sample_event(
                athlete_id=athlete_id,
                model=model,
                surface="chat",
                system_prompt=system_full,
                messages=messages,
                response=full_text,
            )
        except Exception:
            pass

        # Persist assistant turn
        try:
            memory = load_memory(athlete_id)  # re-load in case modified
            assistant_turn_id = new_turn_id()
            memory["conversation"].append(
                {
                    "id": assistant_turn_id,
                    "role": "assistant",
                    "content": full_text,
                    "ts": int(time.time() * 1000),
                }
            )

            # Inference detection — fold new facts silently into About Me.
            # The user used to approve each one via a UI card, but in
            # practice that produced duplicate/noisy prompts. Now we
            # detect + dedup + merge in the background. The detector
            # already knows about existing About Me, athlete profile,
            # and race info, so duplicates are filtered before we see
            # them here.
            if full_text and last_user_msg:
                facts = detect_inferences(
                    athlete_id,
                    last_user_msg,
                    full_text,
                    existing_about_me=memory.get("aboutMe", "") or "",
                    athlete_profile=(snapshot or {}).get("athleteProfile"),
                    race=(snapshot or {}).get("race"),
                )
                if facts:
                    existing = (memory.get("aboutMe") or "").rstrip()
                    lines: list[str] = []
                    if existing:
                        lines.append(existing)
                    for f in facts:
                        lines.append(f"- {f}")
                    memory["aboutMe"] = "\n".join(lines)

            # Summarize if needed
            memory["conversationSummary"] = summarize_conversation(
                athlete_id,
                memory["conversation"],
                memory.get("conversationSummary"),
            )
            save_memory(athlete_id, memory)
        except Exception:
            pass
