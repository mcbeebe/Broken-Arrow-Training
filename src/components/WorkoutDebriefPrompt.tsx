import { useEffect, useRef, useState } from 'react'
import type { ActiveRecording, VoiceCaptureError } from '../utils/voiceInput'
import {
  isVoiceInputEnabled,
  startRecording,
  transcribeAudio,
  voiceCaptureSupported,
} from '../utils/voiceInput'
import type { PlannedDay } from '../types'

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
  coachName = 'Coach',
  onAskCoach,
}: Props) {
  const [state, setState] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [error, setError] = useState<string | null>(null)
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

  if (dismissed) return null
  if (!day.actual) return null
  if (!voiceCaptureSupported()) return null
  if (!isVoiceInputEnabled()) return null

  function markDone() {
    try {
      localStorage.setItem(lsKey(athleteId, day), '1')
    } catch {
      /* quota */
    }
    setDismissed(true)
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
        const text = await transcribeAudio(athleteId, {
          blob: captured.blob,
          mediaType: captured.mediaType,
        })
        if (text) {
          // Seed structure: a brief framing for the coach so the
          // reply lands in the rhythm of a debrief rather than a
          // random transcription. The trailing "actual" detail
          // gives the coach the planned vs actual stats they need.
          const actualBits: string[] = []
          if (day.actual?.distance) actualBits.push(`${day.actual.distance.toFixed(2)}mi`)
          if (day.actual?.movingTime) actualBits.push(`${Math.round(day.actual.movingTime / 60)}min`)
          if (day.actual?.avgHR) actualBits.push(`avg HR ${day.actual.avgHR}`)
          const actualLine = actualBits.length ? ` (${actualBits.join(' · ')})` : ''
          const seed = `Just finished ${day.workout} on ${day.day}${actualLine}. Here's how it went: ${text}`
          onAskCoach(seed)
          markDone()
        } else {
          setError("Couldn't hear that — try again.")
        }
      } catch (err) {
        const e = err as VoiceCaptureError
        setError(e?.message || 'Voice debrief failed.')
      } finally {
        // Always return to idle. setState is harmless if we're already
        // there (after a successful debrief markDone path).
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

  return (
    <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl px-3 py-2.5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
          🎙 Tell {coachName} how it went
        </p>
        <p className="text-xs text-amber-700/80 dark:text-amber-300/70 mt-0.5">
          {state === 'recording'
            ? 'Recording — tap to stop'
            : state === 'transcribing'
            ? 'Transcribing…'
            : error
            ? error
            : "30 seconds on what felt good, what didn't. We'll add the bits worth remembering."}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={handleMicTap}
          disabled={state === 'transcribing'}
          aria-label={state === 'recording' ? 'Stop debrief' : 'Start debrief'}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors disabled:opacity-60 ${
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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M10 2a3 3 0 00-3 3v5a3 3 0 006 0V5a3 3 0 00-3-3z" />
              <path d="M4.5 9.5a.75.75 0 011.5 0 4 4 0 008 0 .75.75 0 011.5 0 5.5 5.5 0 01-4.75 5.452V17.25a.75.75 0 01-1.5 0v-2.298A5.5 5.5 0 014.5 9.5z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={markDone}
          aria-label="Skip debrief"
          className="text-xs text-amber-700/80 hover:text-amber-900 px-1"
          title="Don't ask again for this workout"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
