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
  /** Persist the journal note onto the workout AND share it with the coach
   *  in the background. The single source of truth for this note is
   *  `day.actual.notes`; this callback writes it (and seeds a background
   *  coach turn so the coach receives + analyzes it). */
  onSaveNote: (note: string) => void | Promise<void>
}

/**
 * Workout journal — the single place an athlete writes how a workout went.
 *
 * This is the one source of truth for a workout's notes (`actual.notes`),
 * shared with the log editor's Notes field. Saving here persists the note
 * onto the workout and shares it with the coach in the background (no
 * navigation) so durable facts get remembered and the coach's reply waits
 * in the Coach tab.
 *
 * Voice input is a frictionless accelerator on a cooldown walk — the athlete
 * is breathless, sweaty, holding a bottle — so the mic dictates straight
 * into the box for review/edit before saving. Typing always works, so the
 * journal shows even when voice isn't supported.
 */
export default function WorkoutDebriefPrompt({
  athleteId,
  day,
  coachName = DEFAULT_COACH_NAME,
  onSaveNote,
}: Props) {
  const savedFromWorkout = day.actual?.notes ?? ''
  const [state, setState] = useState<'idle' | 'recording' | 'transcribing' | 'saving'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState(savedFromWorkout)
  // The note last persisted, so we can disable Save when nothing changed.
  const [savedNote, setSavedNote] = useState(savedFromWorkout)
  // Whether we shared a note with the coach in THIS session. We only claim
  // "Shared with coach ✓" after an actual share — not for a pre-existing
  // note that may predate the coach-sharing feature.
  const [justShared, setJustShared] = useState(false)
  const recorderRef = useRef<ActiveRecording | null>(null)

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel()
    }
  }, [])

  // The mic is an optional accelerator — typing is always available, so the
  // journal shows even without voice support. Only the mic is gated.
  const voiceOK = voiceCaptureSupported() && isVoiceInputEnabled()

  if (!day.actual) return null

  const dirty = text.trim() !== savedNote.trim()
  const hasSavedNote = !dirty && savedNote.trim().length > 0

  async function handleSave() {
    const body = text.trim()
    if (!body || !dirty || state === 'saving') return
    setState('saving')
    setError(null)
    try {
      await onSaveNote(body)
      setSavedNote(body)
      setJustShared(true)
    } catch {
      setError("Saved to your journal — couldn't reach the coach. We'll share it next time.")
    } finally {
      setState('idle')
    }
  }

  async function handleMicTap() {
    if (state === 'transcribing' || state === 'saving') return
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
          // Drop the transcript into the box so the athlete can read, edit,
          // or add to it before saving. Appends when there's already text.
          setText(prev => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript))
        } else {
          setError("Couldn't hear that — try typing instead.")
        }
      } catch (err) {
        const e = err as VoiceCaptureError
        setError(e?.message || 'Voice capture failed.')
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
    : state === 'saving'
    ? `Sharing with ${coachName}…`
    : error
    ? error
    : justShared && hasSavedNote
    ? `Shared with ${coachName} ✓ — edit anytime`
    : hasSavedNote
    ? 'Your journal note — edit to update and share'
    : voiceOK
    ? `What felt good, what didn't? Type it or tap the mic — we'll share it with ${coachName} and remember what matters.`
    : `What felt good, what didn't? We'll share it with ${coachName} and remember what matters.`

  return (
    <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl px-3 py-3 space-y-2.5">
      <div>
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
          📓 Workout journal
        </p>
        <p className="text-xs text-amber-700/80 dark:text-amber-300/70 mt-0.5">
          {subtext}
        </p>
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
            disabled={state === 'transcribing' || state === 'saving'}
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
          onClick={handleSave}
          disabled={!dirty || !text.trim() || state === 'saving' || state === 'transcribing'}
          className="font-semibold text-sm px-4 py-2 rounded-full bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state === 'saving' ? 'Saving…' : hasSavedNote ? 'Saved ✓' : `Save & tell ${coachName}`}
        </button>
      </div>
    </div>
  )
}
