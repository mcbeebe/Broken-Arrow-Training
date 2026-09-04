"""Streaming chat endpoint.

POST /api/coach/chat
{ messages, snapshot }

AUTH: requires `Authorization: Bearer <session>`; the athlete is the token
subject. Checked before the transcribe/speak branches, which reach OpenAI
and are charged to that same verified athlete.

Streams SSE:
  data: {"type":"delta","text":"..."}
  data: {"type":"done"}

After the stream completes, appends the assistant turn to memory and
runs two best-effort post-processing steps (inference detection,
conversation summary refresh).

ALTERNATE BODY — voice transcription:
{ athleteId, op: "transcribe", audio: { mediaType, data: base64 } }

Returns JSON (not SSE) with `{ text, latencyMs }`. We dispatch this
through the same endpoint so we don't add a separate Vercel function
(Hobby-tier function-count limit). The audio path forwards to OpenAI
Whisper and is budget-gated the same way as a chat call.
"""

import base64
import json
import os
import time
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler

from ._core import (
    HAIKU_MODEL,
    build_context_block,
    build_system_prompt,
    check_and_increment_budget,
    call_anthropic,
    detect_expand_trigger,
    detect_long_history_trigger,
    detect_full_plan_trigger,
    detect_inferences,
    fact_already_known,
    load_memory,
    log_interaction,
    log_llm_call,
    log_sample_event,
    new_fact_id,
    new_turn_id,
    pick_model,
    read_json_body,
    save_memory,
    send_cors_preflight,
    send_json,
    stream_anthropic,
    summarize_conversation,
    sync_about_me_string,
)
from ..auth._helpers import athlete_from_bearer


# ─── Whisper transcription (voice input) ─────────────────────────
# Folded into chat.py so /api/coach/voice doesn't burn a serverless-
# function slot. The frontend POSTs to /api/coach/chat with
# {op: "transcribe", audio: {mediaType, data}} and we dispatch based
# on the `op` discriminator before falling into the SSE path.

OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions"
WHISPER_MODEL = os.environ.get("OPENAI_WHISPER_MODEL", "whisper-1")
MAX_AUDIO_BYTES = 10 * 1024 * 1024  # 10 MB; Whisper allows up to 25

EXT_BY_MIME = {
    "audio/webm": "webm",
    "audio/webm;codecs=opus": "webm",
    "audio/ogg": "ogg",
    "audio/ogg;codecs=opus": "ogg",
    "audio/mp4": "mp4",
    "audio/mp4;codecs=mp4a.40.2": "mp4",
    "audio/x-m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-wav": "wav",
}


def _build_whisper_multipart(
    audio_bytes: bytes,
    filename: str,
    mime_type: str,
    model: str,
):
    boundary = f"----CoachVoice{uuid.uuid4().hex}"
    crlf = b"\r\n"
    parts: list[bytes] = []

    def field(name: str, value: str) -> None:
        parts.append(f"--{boundary}".encode())
        parts.append(
            f'Content-Disposition: form-data; name="{name}"'.encode()
        )
        parts.append(b"")
        parts.append(value.encode())

    field("model", model)
    field("response_format", "json")

    parts.append(f"--{boundary}".encode())
    parts.append(
        f'Content-Disposition: form-data; name="file"; filename="{filename}"'.encode()
    )
    parts.append(f"Content-Type: {mime_type}".encode())
    parts.append(b"")
    parts.append(audio_bytes)
    parts.append(f"--{boundary}--".encode())
    parts.append(b"")

    body = crlf.join(parts)
    return body, f"multipart/form-data; boundary={boundary}"


def _handle_transcribe(self, body, athlete_id):
    """Whisper transcription branch. Reads {audio:{mediaType,data}} out
    of the chat-endpoint body and returns JSON (not SSE). Shares the
    same per-athlete daily budget as chat.

    `athlete_id` is the caller's verified identity, passed in rather than
    read from the body: it is what the daily spend is charged against, so a
    client must not be able to bill another athlete for its transcription.
    """
    audio = body.get("audio") or {}
    media_type = str(audio.get("mediaType", "")).strip().lower()
    data_b64 = str(audio.get("data", "")).strip()

    if not data_b64:
        send_json(self, 400, {"error": "audio.data required (base64)"})
        return

    if data_b64.startswith("data:"):
        try:
            data_b64 = data_b64.split(",", 1)[1]
        except IndexError:
            send_json(self, 400, {"error": "malformed data URL"})
            return

    try:
        audio_bytes = base64.b64decode(data_b64, validate=False)
    except Exception:
        send_json(self, 400, {"error": "invalid base64"})
        return

    if not audio_bytes:
        send_json(self, 400, {"error": "empty audio"})
        return
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        send_json(
            self,
            413,
            {"error": f"audio too large ({len(audio_bytes)} > {MAX_AUDIO_BYTES} bytes)"},
        )
        return

    within, used, budget = check_and_increment_budget(athlete_id)
    if not within:
        send_json(self, 429, {"error": "budget_exceeded", "used": used, "budget": budget})
        return

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        send_json(self, 503, {"error": "openai_api_key_unconfigured"})
        return

    ext = EXT_BY_MIME.get(media_type, "webm")
    clean_mime = media_type.split(";", 1)[0] if media_type else f"audio/{ext}"
    filename = f"voice.{ext}"

    multipart_body, content_type = _build_whisper_multipart(
        audio_bytes, filename, clean_mime, WHISPER_MODEL,
    )

    req = urllib.request.Request(
        OPENAI_TRANSCRIBE_URL,
        data=multipart_body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": content_type,
        },
        method="POST",
    )

    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        err_body = ""
        try:
            err_body = e.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            pass
        log_llm_call(
            athlete_id=athlete_id, model=WHISPER_MODEL, surface="voice_transcription",
            input_tokens=0, output_tokens=0,
            latency_ms=int((time.time() - t0) * 1000), success=False,
        )
        send_json(self, 502, {"error": f"whisper_http_{e.code}", "detail": err_body})
        return
    except Exception as e:
        log_llm_call(
            athlete_id=athlete_id, model=WHISPER_MODEL, surface="voice_transcription",
            input_tokens=0, output_tokens=0,
            latency_ms=int((time.time() - t0) * 1000), success=False,
        )
        send_json(self, 502, {"error": f"whisper_unavailable: {e}"})
        return

    latency_ms = int((time.time() - t0) * 1000)
    try:
        parsed = json.loads(raw)
    except Exception:
        send_json(self, 502, {"error": "whisper_invalid_response"})
        return

    text = (parsed.get("text") or "").strip()
    log_llm_call(
        athlete_id=athlete_id, model=WHISPER_MODEL, surface="voice_transcription",
        input_tokens=0, output_tokens=len(text) // 4,
        latency_ms=latency_ms, success=True,
    )
    log_interaction(
        athlete_id=athlete_id, kind="voice_transcription",
        meta={"audioBytes": len(audio_bytes), "chars": len(text)},
    )
    send_json(self, 200, {"text": text, "latencyMs": latency_ms})


def _write_sse(handler, obj: dict) -> None:
    data = json.dumps(obj)
    try:
        handler.wfile.write(f"data: {data}\n\n".encode())
        handler.wfile.flush()
    except Exception:
        pass


# ─── OpenAI TTS (Sprint 7 pre-run audio briefing) ────────────────
# Folded into chat.py for the same Vercel-function-cap reason as
# transcribe. The frontend POSTs {op: "speak", text, voice} and we
# return base64-encoded MP3 audio for the client to play with
# HTMLAudioElement.
#
# Why server-side: we don't want to ship the OpenAI key to the
# browser. The chat endpoint already proxies LLM calls; TTS rides the
# same lane.

OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech"
TTS_MODEL = os.environ.get("OPENAI_TTS_MODEL", "tts-1")
# OpenAI's tts-1 supports these 6 voices. The persona→voice mapping
# happens client-side (see voiceInput.ts); we just validate here.
ALLOWED_TTS_VOICES = {"alloy", "echo", "fable", "onyx", "nova", "shimmer"}
DEFAULT_TTS_VOICE = "nova"

# Cap input text. Briefings are 2-3 sentences; anything larger is a
# bug. 1500 chars covers a long workout_take with headroom.
MAX_TTS_CHARS = 1500


def _handle_speak(self, body, athlete_id):
    """OpenAI TTS branch. Reads {text, voice?} and returns base64-encoded
    MP3 audio. Shares the same per-athlete daily budget as chat.

    `athlete_id` is the caller's verified identity (see _handle_transcribe).
    """
    import base64 as _base64

    text = str(body.get("text", "")).strip()
    voice = str(body.get("voice", "")).strip().lower() or DEFAULT_TTS_VOICE

    if not text:
        send_json(self, 400, {"error": "text required"})
        return
    if len(text) > MAX_TTS_CHARS:
        send_json(self, 413, {"error": f"text too long ({len(text)} > {MAX_TTS_CHARS} chars)"})
        return
    if voice not in ALLOWED_TTS_VOICES:
        voice = DEFAULT_TTS_VOICE

    within, used, budget = check_and_increment_budget(athlete_id)
    if not within:
        send_json(self, 429, {"error": "budget_exceeded", "used": used, "budget": budget})
        return

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        send_json(self, 503, {"error": "openai_api_key_unconfigured"})
        return

    req_body = json.dumps({
        "model": TTS_MODEL,
        "voice": voice,
        "input": text,
        "response_format": "mp3",
    }).encode()
    req = urllib.request.Request(
        OPENAI_TTS_URL,
        data=req_body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            audio_bytes = resp.read()
    except urllib.error.HTTPError as e:
        err_body = ""
        try:
            err_body = e.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            pass
        log_llm_call(
            athlete_id=athlete_id, model=TTS_MODEL, surface="voice_tts",
            input_tokens=len(text) // 4, output_tokens=0,
            latency_ms=int((time.time() - t0) * 1000), success=False,
        )
        send_json(self, 502, {"error": f"tts_http_{e.code}", "detail": err_body})
        return
    except Exception as e:
        log_llm_call(
            athlete_id=athlete_id, model=TTS_MODEL, surface="voice_tts",
            input_tokens=len(text) // 4, output_tokens=0,
            latency_ms=int((time.time() - t0) * 1000), success=False,
        )
        send_json(self, 502, {"error": f"tts_unavailable: {e}"})
        return

    latency_ms = int((time.time() - t0) * 1000)
    audio_b64 = _base64.b64encode(audio_bytes).decode()

    log_llm_call(
        athlete_id=athlete_id, model=TTS_MODEL, surface="voice_tts",
        input_tokens=len(text) // 4, output_tokens=0,
        latency_ms=latency_ms, success=True,
    )
    log_interaction(
        athlete_id=athlete_id, kind="voice_tts",
        meta={"chars": len(text), "voice": voice, "bytes": len(audio_bytes)},
    )

    send_json(self, 200, {
        "audio": audio_b64,
        "mediaType": "audio/mpeg",
        "voice": voice,
        "latencyMs": latency_ms,
    })


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
        # Auth FIRST — before the transcribe / speak branches below, which
        # reach OpenAI and spend budget without ever touching athlete_id.
        ok, _auth_status, _auth_err, athlete_id = athlete_from_bearer(self.headers)
        if not ok:
            send_json(self, _auth_status, {"error": _auth_err})
            return
        body = read_json_body(self)
        incoming = body.get("messages") or []
        snapshot = body.get("snapshot") or {}

        # Voice transcription path: dispatch before the SSE setup since
        # this branch returns JSON. Folded into chat.py so we don't add
        # a separate Vercel function (Hobby tier function-count limit).
        op = str(body.get("op", "")).strip()
        if op == "transcribe":
            _handle_transcribe(self, body, athlete_id)
            return
        if op == "speak":
            # Sprint 7 — OpenAI TTS for pre-run audio briefings.
            _handle_speak(self, body, athlete_id)
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
        # Sprint 4 — folded inferences become structured facts that carry
        # their original proposedAt and sourceTurnId so anniversary
        # surfaces ("you mentioned this 47 days ago") can find provenance.
        legacy_pending = memory.get("pendingInferences") or []
        if legacy_pending:
            facts_list = memory.setdefault("aboutMeFacts", [])
            # Accumulate the existing aboutMe + new facts as one string
            # for dedup probing, so paraphrases of profile/race/existing
            # facts drop out before they become persisted facts.
            existing_about = memory.get("aboutMe", "") or ""
            dedup_pool = [existing_about.rstrip()] if existing_about.strip() else []
            for p in legacy_pending:
                t = str(p.get("text", "")).strip()
                if not t:
                    continue
                if fact_already_known(
                    t,
                    "\n".join(dedup_pool),
                    snapshot.get("athleteProfile"),
                    snapshot.get("race"),
                ):
                    continue
                fact: dict = {
                    "id": new_fact_id(),
                    "text": t,
                    "learnedAt": int(p.get("proposedAt") or time.time() * 1000),
                }
                source_turn = p.get("sourceTurnId")
                if isinstance(source_turn, str) and source_turn:
                    fact["sourceTurnId"] = source_turn
                facts_list.append(fact)
                dedup_pool.append(f"- {t}")
            sync_about_me_string(memory)
            memory["pendingInferences"] = []
            save_memory(athlete_id, memory)

        # Append user turn(s) to memory first so they persist even on failure.
        # Images are ephemeral — we never store the bytes, only an inline
        # marker in the text so the historical bubble shows an attachment hint.
        latest_image: dict | None = None
        for m in incoming:
            if m.get("role") == "user":
                text_content = str(m.get("content", ""))
                img = m.get("image") if isinstance(m.get("image"), dict) else None
                if img and isinstance(img.get("data"), str) and img["data"]:
                    latest_image = {
                        "media_type": str(img.get("mediaType") or "image/jpeg"),
                        "data": img["data"],
                    }
                    marker = "[📷 image attached]"
                    text_content = (
                        f"{text_content}\n\n{marker}" if text_content else marker
                    )
                memory["conversation"].append(
                    {
                        "id": new_turn_id(),
                        "role": "user",
                        "content": text_content,
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

        # If this turn has an image, replace the last user message's plain
        # string content with an Anthropic content-block array so vision
        # gets the photo. We don't persist the bytes — the image lives
        # only for this one turn.
        if latest_image:
            for i in range(len(messages) - 1, -1, -1):
                if messages[i].get("role") == "user":
                    text = messages[i].get("content", "")
                    if isinstance(text, str):
                        # Strip the "[📷 image attached]" marker we added for
                        # the persisted history bubble — the model gets the
                        # actual image instead.
                        text = text.replace("[📷 image attached]", "").strip()
                        if not text:
                            text = "What do you see in this photo?"
                        messages[i]["content"] = [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": latest_image["media_type"],
                                    "data": latest_image["data"],
                                },
                            },
                            {"type": "text", "text": text},
                        ]
                    break

        persona_for_model = snapshot.get("coachPersona") or memory.get("coachPersona")
        model = pick_model(messages, coach_persona=persona_for_model)
        # Last athlete message — computed BEFORE the system prompt so R6's
        # keyword-gated knowledge modules can be injected; reused for depth.
        last_user_msg = ""
        for m in reversed(incoming):
            if m.get("role") == "user":
                last_user_msg = str(m.get("content", ""))
                break
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
            zones=snapshot.get("zones"),
            user_msg=last_user_msg,  # R6 — keyword-gated knowledge modules
        )

        # Decide depth
        # Depth tiers: 120d for multi-month/whole-block questions,
        # 30d (→60 activities) for history/trend/pattern keywords,
        # 7d (→30 activities) as the new default baseline.
        if detect_long_history_trigger(last_user_msg):
            depth = "120d"
        elif detect_expand_trigger(last_user_msg):
            depth = "30d"
        else:
            depth = "7d"
        include_full_plan = detect_full_plan_trigger(last_user_msg)
        ctx = build_context_block(
            snapshot,
            depth=depth,
            include_full_plan=include_full_plan,
            user_msg=last_user_msg,  # R5 — injury floor reads the athlete's message
        )
        plan_note = "full-plan" if include_full_plan else "14-day"
        ctx_text = (
            f"\n\n---\n\n"
            f"Current context snapshot ({depth}, plan window: {plan_note}):\n{ctx}"
        )
        # Prompt caching: the system prompt (role + knowledge + persona +
        # about-me) is stable across turns in a chat session. Mark it as
        # a cache breakpoint so Anthropic reuses KV-cache on subsequent
        # turns (~90% input-token discount on the cached prefix).
        system_full = [
            {"type": "text", "text": system, "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": ctx_text},
        ]

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
                max_tokens=1500,
                temperature=0.3,
                tools=[{
                    "type": "web_search_20250305",
                    "name": "web_search",
                    "max_uses": 3,
                }],
            )
            for kind, payload in stream_iter:
                if kind == "delta":
                    full_text += payload
                    _write_sse(self, {"type": "delta", "text": payload})
                elif kind == "status":
                    _write_sse(self, {"type": "status", "text": payload})
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
            ctx = build_context_block(snapshot, depth="30d", user_msg=last_user_msg)
            system_full = [
                {"type": "text", "text": system, "cache_control": {"type": "ephemeral"}},
                {"type": "text", "text": f"\n\n---\n\nCurrent context snapshot (30d):\n{ctx}"},
            ]
            full_text = ""
            try:
                for kind, payload in stream_anthropic(
                    model=model,
                    system=system_full,
                    messages=messages,
                    max_tokens=1500,
                    temperature=0.3,
                    tools=[{
                        "type": "web_search_20250305",
                        "name": "web_search",
                        "max_uses": 3,
                    }],
                ):
                    if kind == "delta":
                        full_text += payload
                        _write_sse(self, {"type": "delta", "text": payload})
                    elif kind == "status":
                        _write_sse(self, {"type": "status", "text": payload})
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
            system_for_log = (
                "\n".join(b["text"] for b in system_full)
                if isinstance(system_full, list)
                else system_full
            )
            log_sample_event(
                athlete_id=athlete_id,
                model=model,
                surface="chat",
                system_prompt=system_for_log,
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
                    # Sprint 4 — new facts land as structured entries that
                    # carry the current timestamp + the user turn that
                    # produced them, so the panel and anniversary engine
                    # can show provenance.
                    facts_list = memory.setdefault("aboutMeFacts", [])
                    # Find the most recent user turn id so newly-detected
                    # facts can reference where they came from.
                    source_turn_id = None
                    for t in reversed(memory.get("conversation") or []):
                        if t.get("role") == "user":
                            source_turn_id = t.get("id")
                            break
                    now_ms = int(time.time() * 1000)
                    for f in facts:
                        new_f: dict = {
                            "id": new_fact_id(),
                            "text": f,
                            "learnedAt": now_ms,
                        }
                        if isinstance(source_turn_id, str) and source_turn_id:
                            new_f["sourceTurnId"] = source_turn_id
                        facts_list.append(new_f)
                    sync_about_me_string(memory)

            # Summarize if needed
            memory["conversationSummary"] = summarize_conversation(
                athlete_id,
                memory["conversation"],
                memory.get("conversationSummary"),
            )
            save_memory(athlete_id, memory)
        except Exception:
            pass
