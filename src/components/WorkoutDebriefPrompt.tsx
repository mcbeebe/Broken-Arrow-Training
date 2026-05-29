import { useEffect, useRef, useState } from 'react'
import type { ActiveRecording, VoiceCaptureError } from '../utils/voiceInput'
import {
  isVoiceInputEnabled,
  startRecording,
  transcribeAudio,
  voiceCaptureSupported,
} from '../utils/voiceInput'
import type { PlannedDay } from '../types'
import { DEFAULT_COACH_NAME } from '../types'

interface Props {
  athleteId: string
  day: PlannedDay
  coachName?: string
  /** Seed the chat with the debrief. Same callback used by other
   *  "Ask the coach" entry points so the message lands in the
   *  conversation thread and runs through inference detection. */
  onAskCoach: (seed: string) => void
}

const LS_PREFIX = 'ba_coach_debriefed_v1:'

function lsKey(athleteId: string, day: PlannedDay): string {
  // Day labels are unique within a plan (date-based), so they're a
  // safe dedup key for "I already submitted a debrief for this
  // workout."
  return `${LS_PREFIX}${athleteId}:${day.day}`
}

/**
 * Sprint 7B — cooldown voice debrief prompt. Shows on the
 * WorkoutModal after the athlete logs / syncs a completed workout.
 * They tap the mic, dictate 30 seconds of "how it went", and we send
 * the transcription as a chat turn. The existing inference detector
 * picks up any durable facts ("knee felt better today after the foam
 * rolling routine") and pushes them into About Me.
 *
 * Voice input is frictionless on a cooldown walk in a way typing
 * never is — the user is breathless, sweaty, holding a bottle. This
 * is the closest the persona system gets to the "talk to my coach"
 * promise without an on-run companion yet.
 */
export default function WorkoutDebriefPrompt({
  athleteId,
  day,
  coachName = DEFAULT_COACH_NAME,
  onAskCoach,
}: Props) {
  const [state, setState] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(lsKey(athleteId, day)) === '1'
    } catch {
      return false
    }
  })
  const recorderRef = useRef<ActiveRecording | null>(null)

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel()
    }
  }, [])

  // The mic is an optional accelerator — the typed debrief is always
  // available, so the prompt shows even when voice isn't supported or the
  // user has it turned off. Only the mic button is gated on voice support.
  const voiceOK = voiceCaptureSupported() && isVoiceInputEnabled()

  if (dismissed) return null
  if (!day.actual) return null

  function markDone() {
    try {
      localStorage.setItem(lsKey(athleteId, day), '1')
    } catch {
      /* quota */
    }
    setDismissed(true)
  }

  // Frame the debrief for the coach so the reply lands in the rhythm of a
  // debrief rather than a random note. The trailing "actual" detail gives
  // the coach the planned vs actual stats they need to analyze it.
  function buildSeed(body: string): string {
    const actualBits: string[] = []
    if (day.actual?.distance) actualBits.push(`${day.actual.distance.toFixed(2)}mi`)
    if (day.actual?.movingTime) actualBits.push(`${Math.round(day.actual.movingTime / 60)}min`)
    if (day.actual?.avgHR) actualBits.push(`avg HR ${day.actual.avgHR}`)
    const actualLine = actualBits.length ? ` (${actualBits.join(' · ')})` : ''
    return `Just finished ${day.workout} on ${day.day}${actualLine}. Here's how it went: ${body.trim()}`
  }

  function handleSend() {
    const body = text.trim()
    if (!body) return
    onAskCoach(buildSeed(body))
    markDone()
  }

  async function handleMicTap() {
    if (state === 'transcribing') return
    if (state === 'recording') {
      const rec = recorderRef.current
      if (!rec) return
      try {
        const captured = await rec.stop()
        recorderRef.current = null
        setState('transcribing')
        setError(null)
        const transcript = await transcribeAudio(athleteId, {
          blob: captured.blob,
          mediaType: captured.mediaType,
        })
        if (transcript) {
          // Drop the transcript into the text box so the athlete can read,
          // edit, or add to it before sending — instead of firing it off
          // blind. Appends when there's already typed text.
          setText(prev => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript))
        } else {
          setError("Couldn't hear that — try typing instead.")
        }
      } catch (err) {
        const e = err as VoiceCaptureError
        setError(e?.message || 'Voice debrief failed.')
      } finally {
        setState('idle')
      }
      return
    }
    setError(null)
    try {
      const rec = await startRecording()
      recorderRef.current = rec
      setState('recording')
    } catch (err) {
      const e = err as VoiceCaptureError
      setError(e?.message || "Couldn't start recording.")
      setState('idle')
    }
  }

  const subtext = state === 'recording'
    ? 'Recording — tap the mic to stop'
    : state === 'transcribing'
    ? 'Transcribing…'
    : error
    ? error
    : voiceOK
    ? "What felt good, what didn't? Type it or tap the mic — we'll share it with your coach and remember what matters."
    : "What felt good, what didn't? We'll share it with your coach and remember what matters."

  return (
    <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl px-3 py-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            💬 Tell {coachName} how it went
          </p>
          <p className="text-xs text-amber-700/80 dark:text-amber-300/70 mt-0.5">
            {subtext}
          </p>
        </div>
        <button
          type="button"
          onClick={markDone}
          aria-label="Skip debrief"
          className="text-xs text-amber-700/80 hover:text-amber-900 dark:hover:text-amber-100 px-1 shrink-0"
          title="Don't ask again for this workout"
        >
          Skip
        </button>
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={4}
        placeholder="Legs felt strong on the climbs, but I faded on the last interval…"
        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-y leading-relaxed text-slate-700 dark:text-slate-100 placeholder:text-slate-400"
      />

      <div className="flex items-center justify-between gap-2">
        {voiceOK ? (
          <button
            type="button"
            onClick={handleMicTap}
            disabled={state === 'transcribing'}
            aria-label={state === 'recording' ? 'Stop recording' : 'Dictate with mic'}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-2 rounded-full transition-colors disabled:opacity-60 ${
              state === 'recording'
                ? 'bg-red-500 text-white animate-pulse hover:bg-red-600'
                : state === 'transcribing'
                ? 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-200'
                : 'bg-amber-500 text-white hover:bg-amber-600'
            }`}
          >
            {state === 'transcribing' ? (
              <span className="inline-block w-4 h-4 rounded-full border-2 border-amber-700 border-t-transparent animate-spin" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M10 2a3 3 0 00-3 3v5a3 3 0 006 0V5a3 3 0 00-3-3z" />
                <path d="M4.5 9.5a.75.75 0 011.5 0 4 4 0 008 0 .75.75 0 011.5 0 5.5 5.5 0 01-4.75 5.452V17.25a.75.75 0 01-1.5 0v-2.298A5.5 5.5 0 014.5 9.5z" />
              </svg>
            )}
            <span>{state === 'recording' ? 'Stop' : state === 'transcribing' ? 'Transcribing…' : 'Dictate'}</span>
          </button>
        ) : <span />}
        <button
          type="button"
          onClick={handleSend}
          disabled={!text.trim() || state === 'transcribing'}
          className="font-semibold text-sm px-4 py-2 rounded-full bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send to {coachName}
        </button>
      </div>
    </div>
  )
}
