"""Voice transcription endpoint (Whisper).

POST /api/coach/voice
{ athleteId, audio: { mediaType, data (base64) }, hint? }

Returns { text, durationMs? }. Forwards the audio blob to OpenAI's
Whisper API and surfaces the transcription. Budget-gated using the
same per-athlete daily counter the chat endpoint uses so a runaway
dictation loop can't burn the token budget.

Sprint 1 of the AI Coach differentiation roadmap. Voice input is the
unlock for two later features: cooldown debrief on the trail (Sprint 7B)
and live on-run coaching (Sprint 7C). Today it just lets the athlete
talk into the chat composer instead of typing.
"""

import base64
import os
import time
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler

from ._core import (
    check_and_increment_budget,
    log_interaction,
    log_llm_call,
    read_json_body,
    send_cors_preflight,
    send_json,
)


OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions"
WHISPER_MODEL = os.environ.get("OPENAI_WHISPER_MODEL", "whisper-1")

# Cap the audio size at ~10 MB after base64 decoding. Whisper accepts
# up to 25 MB but the typical post-run debrief is <1 MB; anything
# bigger is almost certainly a client bug or someone trying to upload
# a podcast.
MAX_AUDIO_BYTES = 10 * 1024 * 1024

# Map common browser MediaRecorder MIME types to extensions Whisper
# recognizes. WebM/Opus is what Chrome/Firefox emit; MP4/AAC is Safari
# on iOS. WAV is the manual override path if a client transcodes.
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


def _build_multipart_body(
    audio_bytes: bytes,
    filename: str,
    mime_type: str,
    model: str,
) -> tuple[bytes, str]:
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


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_POST(self):
        body = read_json_body(self)
        athlete_id = str(body.get("athleteId", "")).strip()
        audio = body.get("audio") or {}
        media_type = str(audio.get("mediaType", "")).strip().lower()
        data_b64 = str(audio.get("data", "")).strip()

        if not athlete_id:
            send_json(self, 400, {"error": "athleteId required"})
            return
        if not data_b64:
            send_json(self, 400, {"error": "audio.data required (base64)"})
            return

        # Strip any data: URL prefix the client forgot to drop.
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

        # Budget guard. Voice transcription is cheap (~$0.006/min) but a
        # client bug that re-uploads on every render could still hurt.
        # Each transcription counts as one "call" against the daily
        # counter, matching the chat / insight discipline.
        within, used, budget = check_and_increment_budget(athlete_id)
        if not within:
            send_json(
                self,
                429,
                {
                    "error": "budget_exceeded",
                    "used": used,
                    "budget": budget,
                },
            )
            return

        api_key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not api_key:
            send_json(self, 503, {"error": "openai_api_key_unconfigured"})
            return

        ext = EXT_BY_MIME.get(media_type, "webm")
        # MediaRecorder MIME often includes a codec suffix; strip that
        # for the Content-Type we send to OpenAI so we don't surprise
        # their parser.
        clean_mime = media_type.split(";", 1)[0] if media_type else f"audio/{ext}"
        filename = f"voice.{ext}"

        multipart_body, content_type = _build_multipart_body(
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
                athlete_id=athlete_id,
                model=WHISPER_MODEL,
                surface="voice_transcription",
                input_tokens=0,
                output_tokens=0,
                latency_ms=int((time.time() - t0) * 1000),
                success=False,
            )
            send_json(
                self,
                502,
                {"error": f"whisper_http_{e.code}", "detail": err_body},
            )
            return
        except Exception as e:
            log_llm_call(
                athlete_id=athlete_id,
                model=WHISPER_MODEL,
                surface="voice_transcription",
                input_tokens=0,
                output_tokens=0,
                latency_ms=int((time.time() - t0) * 1000),
                success=False,
            )
            send_json(self, 502, {"error": f"whisper_unavailable: {e}"})
            return

        latency_ms = int((time.time() - t0) * 1000)

        try:
            import json as _json
            parsed = _json.loads(raw)
        except Exception:
            send_json(self, 502, {"error": "whisper_invalid_response"})
            return

        text = (parsed.get("text") or "").strip()

        log_llm_call(
            athlete_id=athlete_id,
            model=WHISPER_MODEL,
            surface="voice_transcription",
            input_tokens=0,
            output_tokens=len(text) // 4,  # rough char/4 proxy
            latency_ms=latency_ms,
            success=True,
        )
        log_interaction(
            athlete_id=athlete_id,
            kind="voice_transcription",
            meta={"audioBytes": len(audio_bytes), "chars": len(text)},
        )

        send_json(self, 200, {"text": text, "latencyMs": latency_ms})
