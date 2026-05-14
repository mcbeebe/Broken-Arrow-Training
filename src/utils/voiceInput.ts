/**
 * Voice input plumbing for the coach chat composer.
 *
 * Pairs `MediaRecorder` (browser-side capture) with the /api/coach/voice
 * Whisper endpoint (server-side transcription). The browser side is
 * thin: pick a supported MIME type, capture a blob, base64-encode, POST.
 *
 * Sprint 1 of the AI Coach roadmap. The same utility will be reused for
 * cooldown debrief (Sprint 7B) and on-run dictation (Sprint 7C).
 */

import { coachApiAvailable, coachApiBase } from './coachApi'

const SETTING_KEY = 'ba_coach_voice_enabled'

/** Default ON — voice input is the primary UX win in Sprint 1. */
export function isVoiceInputEnabled(): boolean {
  try {
    const raw = localStorage.getItem(SETTING_KEY)
    if (raw === null) return true
    return raw !== '0'
  } catch {
    return true
  }
}

export function setVoiceInputEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SETTING_KEY, enabled ? '1' : '0')
  } catch {
    /* quota */
  }
}

export interface VoiceCaptureError {
  code:
    | 'unsupported'
    | 'permission_denied'
    | 'no_audio'
    | 'too_short'
    | 'api_unavailable'
    | 'http_error'
    | 'transcribe_failed'
  message: string
  status?: number
}

/** Browser MediaRecorder pick — first supported type wins. */
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
]

export function pickRecorderMimeType(): string | null {
  if (typeof window === 'undefined' || !window.MediaRecorder) return null
  for (const t of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  // Safari doesn't report isTypeSupported for any of the above as of
  // iOS 17, but it will still accept 'audio/mp4' at recorder construction
  // time. Returning '' lets the browser pick its default.
  return ''
}

export function voiceCaptureSupported(): boolean {
  if (typeof window === 'undefined') return false
  if (!navigator.mediaDevices?.getUserMedia) return false
  if (!window.MediaRecorder) return false
  return true
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  // Use a chunked approach so we don't blow the call stack on long clips.
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(binary)
}

export interface ActiveRecording {
  /** Stop recording and resolve with the captured audio blob. Rejects
   *  with a VoiceCaptureError on permission revocation or no-audio. */
  stop(): Promise<{ blob: Blob; durationMs: number; mediaType: string }>
  /** Cancel without producing a blob — used when the user changes their
   *  mind mid-recording. */
  cancel(): void
}

/**
 * Start capturing audio. Returns an ActiveRecording handle the caller
 * can stop/cancel. The handle's promise resolves with the blob.
 */
export async function startRecording(): Promise<ActiveRecording> {
  if (!voiceCaptureSupported()) {
    throw {
      code: 'unsupported',
      message: "This browser doesn't support voice input.",
    } as VoiceCaptureError
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (e) {
    throw {
      code: 'permission_denied',
      message:
        (e as Error).name === 'NotAllowedError'
          ? 'Microphone access was denied. Enable it in your browser settings.'
          : `Couldn't access the microphone: ${(e as Error).message}`,
    } as VoiceCaptureError
  }

  const mime = pickRecorderMimeType() ?? ''
  const recorder = mime
    ? new MediaRecorder(stream, { mimeType: mime })
    : new MediaRecorder(stream)
  const chunks: BlobPart[] = []
  const startedAt = Date.now()

  recorder.addEventListener('dataavailable', e => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  })
  recorder.start()

  let settled = false
  let stopResolver: ((value: { blob: Blob; durationMs: number; mediaType: string }) => void) | null = null
  let stopRejecter: ((reason: VoiceCaptureError) => void) | null = null
  const stopPromise = new Promise<{ blob: Blob; durationMs: number; mediaType: string }>(
    (res, rej) => {
      stopResolver = res
      stopRejecter = rej
    },
  )

  recorder.addEventListener('stop', () => {
    stream.getTracks().forEach(t => t.stop())
    if (settled) return
    settled = true
    const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' })
    if (blob.size === 0) {
      stopRejecter?.({ code: 'no_audio', message: 'No audio was captured.' })
      return
    }
    const durationMs = Date.now() - startedAt
    if (durationMs < 250) {
      stopRejecter?.({ code: 'too_short', message: 'Hold a bit longer to record.' })
      return
    }
    stopResolver?.({ blob, durationMs, mediaType: blob.type })
  })

  return {
    stop() {
      if (recorder.state !== 'inactive') recorder.stop()
      return stopPromise
    },
    cancel() {
      settled = true
      if (recorder.state !== 'inactive') recorder.stop()
      stream.getTracks().forEach(t => t.stop())
    },
  }
}

/**
 * Send a captured blob to the chat endpoint's transcription branch and
 * return the transcribed text. Throws VoiceCaptureError on failure.
 *
 * Voice transcription is folded into /api/coach/chat (with
 * `op: 'transcribe'`) so we don't burn an extra Vercel serverless
 * function slot. The endpoint dispatches before the SSE setup.
 */
export async function transcribeAudio(
  athleteId: string,
  audio: { blob: Blob; mediaType: string },
): Promise<string> {
  if (!coachApiAvailable()) {
    throw {
      code: 'api_unavailable',
      message: 'Coach API is offline — voice input unavailable.',
    } as VoiceCaptureError
  }
  const base64 = await blobToBase64(audio.blob)
  let res: Response
  try {
    res = await fetch(`${coachApiBase()}/api/coach/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        athleteId,
        op: 'transcribe',
        audio: { mediaType: audio.mediaType, data: base64 },
      }),
    })
  } catch (e) {
    throw {
      code: 'http_error',
      message: (e as Error).message || 'Network error contacting voice endpoint.',
    } as VoiceCaptureError
  }
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 200)
    } catch {
      /* ignore */
    }
    throw {
      code: res.status === 429 ? 'http_error' : 'transcribe_failed',
      status: res.status,
      message:
        res.status === 429
          ? 'Daily coach budget reached. Try again later.'
          : `Transcription failed (${res.status}). ${detail}`,
    } as VoiceCaptureError
  }
  const data = (await res.json()) as { text?: string }
  return (data.text || '').trim()
}


// ─── Sprint 7: TTS playback (pre-run audio briefings) ─────────────
//
// Server proxies OpenAI's TTS endpoint. We POST {text, voice} to
// /api/coach/chat with op=speak and get back base64-encoded MP3 audio
// which we play via HTMLAudioElement.
//
// Voice selection is persona-aware: the 11-trait CoachPersona maps to
// one of OpenAI's 6 tts-1 voices so "Coach Chuck, direct + nerdy"
// sounds different in the earbuds than "Coach Sarah, warm +
// motivational". Same insight text, different voice — the persona
// finally lives at the audio layer where it actually creates the
// emotional bond Runna and Athletica can't.

type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'

/**
 * Map a CoachPersona (name + 11-trait list) to one of OpenAI's tts-1
 * voices. The mapping is intentionally simple — pick the first
 * matching trait. Athlete persona always wins over default.
 */
export function pickCoachVoice(persona?: { traits?: string[] } | null): OpenAIVoice {
  const traits = (persona?.traits || []).map(t => String(t).toLowerCase())
  // Order matters — first match wins. Energy-forward traits map to
  // brighter voices; serious traits map to lower/measured voices.
  if (traits.includes('high-energy')) return 'shimmer'
  if (traits.includes('funny') || traits.includes('lighthearted')) return 'fable'
  if (traits.includes('strict') || traits.includes('demanding')) return 'onyx'
  if (traits.includes('direct') || traits.includes('old-school')) return 'echo'
  if (traits.includes('nerdy')) return 'echo'
  if (traits.includes('motivational') || traits.includes('warm')) return 'nova'
  if (traits.includes('chill')) return 'alloy'
  // Default: warm female voice. Matches the default coach persona.
  return 'nova'
}

export interface TTSError {
  code: 'unsupported' | 'api_unavailable' | 'http_error' | 'tts_failed'
  message: string
  status?: number
}

/**
 * Request TTS audio for the given text + voice. Returns an
 * HTMLAudioElement ready to .play(). Throws TTSError on failure.
 *
 * Note: TTS responses are decent-sized (~30 KB for a 2-sentence
 * briefing) — we don't cache them in localStorage because audio bytes
 * blow the quota fast. The OpenAI cost is ~$15 per million chars so a
 * 200-char briefing costs $0.003; just-in-time is the right tradeoff.
 */
export async function fetchTTSAudio(
  athleteId: string,
  text: string,
  voice: OpenAIVoice,
): Promise<HTMLAudioElement> {
  if (!coachApiAvailable()) {
    throw {
      code: 'api_unavailable',
      message: 'Coach API is offline — audio playback unavailable.',
    } as TTSError
  }
  let res: Response
  try {
    res = await fetch(`${coachApiBase()}/api/coach/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        athleteId,
        op: 'speak',
        text,
        voice,
      }),
    })
  } catch (e) {
    throw {
      code: 'http_error',
      message: (e as Error).message || 'Network error contacting TTS endpoint.',
    } as TTSError
  }
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 200)
    } catch {
      /* ignore */
    }
    throw {
      code: res.status === 429 ? 'http_error' : 'tts_failed',
      status: res.status,
      message:
        res.status === 429
          ? 'Daily coach budget reached. Try again later.'
          : `Audio briefing failed (${res.status}). ${detail}`,
    } as TTSError
  }
  const data = (await res.json()) as { audio?: string; mediaType?: string }
  if (!data.audio) {
    throw { code: 'tts_failed', message: 'TTS returned no audio.' } as TTSError
  }
  // Build a playable Audio element. Using a blob URL (not a data URL)
  // because data URLs blow past the URL-length limit on some browsers
  // for longer briefings.
  const audioBytes = base64ToBytes(data.audio)
  // slice(0) returns a fresh ArrayBuffer (not SharedArrayBuffer), which
  // is what Blob's BlobPart union expects under strict TS settings.
  const blob = new Blob([audioBytes.buffer.slice(0) as ArrayBuffer], { type: data.mediaType || 'audio/mpeg' })
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  // Free the blob URL when the audio ends so we don't leak memory if
  // the athlete plays many briefings in one session.
  audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true })
  audio.addEventListener('error', () => URL.revokeObjectURL(url), { once: true })
  return audio
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

