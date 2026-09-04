import { isoFromLocalDate } from '../utils/planDates'
import { useEffect, useRef, useState } from 'react'
import type { ActiveRecording, VoiceCaptureError } from '../utils/voiceInput'
import {
  isVoiceInputEnabled,
  startRecording,
  transcribeAudio,
  voiceCaptureSupported,
} from '../utils/voiceInput'
import type { JournalNote } from '../types'
import { DEFAULT_COACH_NAME } from '../types'

export interface JournalEntryDraft {
  text: string
  mood?: number
  energy?: number
  dateISO: string
}

interface Props {
  athleteId: string
  coachEnabled?: boolean
  coachName?: string
  /** Presence flips the sheet into edit mode (prefilled + Delete). */
  existing?: JournalNote
  /** Create (new mode) or save edits (edit mode) — parent decides which. */
  onSubmit: (draft: JournalEntryDraft) => void
  /** Edit mode only — soft-delete this entry. */
  onDelete?: () => void
  onClose: () => void
}

const MOODS: { v: number; emoji: string; label: string }[] = [
  { v: 1, emoji: '😖', label: 'Rough' },
  { v: 2, emoji: '😕', label: 'Low' },
  { v: 3, emoji: '😐', label: 'OK' },
  { v: 4, emoji: '🙂', label: 'Good' },
  { v: 5, emoji: '😄', label: 'Great' },
]

/** Local calendar date (YYYY-MM-DD) for a date input default.
 *
 *  This used to shift the instant by the timezone offset and then read it
 *  back through `toISOString()` — correct, but only because the two errors
 *  cancelled. Reading local components directly needs no shift, and the
 *  shifted form would be wrong the moment anyone "simplified" one half of it.
 */
function todayLocalDate(): string {
  return isoFromLocalDate(new Date())
}

/** Turn a `YYYY-MM-DD` input back into an ISO timestamp. Keeps the original
 *  time-of-day when the calendar date didn't change (so edits don't reorder
 *  the feed); otherwise anchors at local noon so a TZ shift never moves the
 *  entry to the wrong day. */
function dateInputToISO(dateStr: string, fallbackISO?: string): string {
  if (fallbackISO && fallbackISO.slice(0, 10) === dateStr) return fallbackISO
  const ms = Date.parse(`${dateStr}T12:00:00`)
  return Number.isNaN(ms) ? new Date().toISOString() : new Date(ms).toISOString()
}

/**
 * Compose / edit a free-standing journal entry — the sheet behind the Journal
 * page's "+ New entry" button. Pure reflection capture: a few words, an
 * optional mood + energy read, an optional back-date. Voice dictation mirrors
 * the workout journal so an athlete can talk an entry in on a cooldown walk.
 *
 * Coach sharing is automatic (the parent fires it on save when coach is on),
 * so this sheet only collects + persists; it shows a one-line hint when the
 * coach will see it.
 */
export default function JournalEntryModal({
  athleteId,
  coachEnabled,
  coachName = DEFAULT_COACH_NAME,
  existing,
  onSubmit,
  onDelete,
  onClose,
}: Props) {
  const isEdit = !!existing
  const [text, setText] = useState(existing?.text ?? '')
  const [mood, setMood] = useState<number | undefined>(existing?.mood)
  const [energy, setEnergy] = useState<number | undefined>(existing?.energy)
  const [date, setDate] = useState(existing?.dateISO?.slice(0, 10) || todayLocalDate())
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<ActiveRecording | null>(null)

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel()
    }
  }, [])

  const voiceOK = voiceCaptureSupported() && isVoiceInputEnabled()
  const canSave = text.trim().length > 0 && voiceState === 'idle'

  function handleSave() {
    if (!canSave) return
    onSubmit({
      text: text.trim(),
      mood,
      energy,
      dateISO: dateInputToISO(date, existing?.dateISO),
    })
  }

  // Mirror of WorkoutDebriefPrompt's mic flow: tap to record, tap to stop +
  // transcribe, drop the transcript into the box for review before saving.
  async function handleMicTap() {
    if (voiceState === 'transcribing') return
    if (voiceState === 'recording') {
      const rec = recorderRef.current
      if (!rec) return
      try {
        const captured = await rec.stop()
        recorderRef.current = null
        setVoiceState('transcribing')
        setError(null)
        const transcript = await transcribeAudio(athleteId, {
          blob: captured.blob,
          mediaType: captured.mediaType,
        })
        if (transcript) {
          setText(prev => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript))
        } else {
          setError("Couldn't hear that — try typing instead.")
        }
      } catch (err) {
        const e = err as VoiceCaptureError
        setError(e?.message || 'Voice capture failed.')
      } finally {
        setVoiceState('idle')
      }
      return
    }
    setError(null)
    try {
      const rec = await startRecording()
      recorderRef.current = rec
      setVoiceState('recording')
    } catch (err) {
      const e = err as VoiceCaptureError
      setError(e?.message || "Couldn't start recording.")
      setVoiceState('idle')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit journal entry' : 'New journal entry'}
        className="relative bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-slate-800 px-4 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 dark:text-white">
              📓 {isEdit ? 'Edit entry' : 'New journal entry'}
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Reflection */}
          <div>
            <textarea
              autoFocus
              value={text}
              onChange={e => setText(e.target.value)}
              rows={5}
              placeholder="What's on your mind? How are you feeling today?"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-y leading-relaxed text-slate-700 dark:text-slate-100 placeholder:text-slate-400"
            />
            {voiceOK && (
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleMicTap}
                  disabled={voiceState === 'transcribing'}
                  aria-label={voiceState === 'recording' ? 'Stop recording' : 'Dictate with mic'}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full transition-colors disabled:opacity-60 ${
                    voiceState === 'recording'
                      ? 'bg-red-500 text-white animate-pulse hover:bg-red-600'
                      : voiceState === 'transcribing'
                      ? 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-200'
                      : 'bg-amber-500 text-white hover:bg-amber-600'
                  }`}
                >
                  {voiceState === 'transcribing' ? (
                    <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-amber-700 border-t-transparent animate-spin" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M10 2a3 3 0 00-3 3v5a3 3 0 006 0V5a3 3 0 00-3-3z" />
                      <path d="M4.5 9.5a.75.75 0 011.5 0 4 4 0 008 0 .75.75 0 011.5 0 5.5 5.5 0 01-4.75 5.452V17.25a.75.75 0 01-1.5 0v-2.298A5.5 5.5 0 014.5 9.5z" />
                    </svg>
                  )}
                  <span>
                    {voiceState === 'recording' ? 'Stop' : voiceState === 'transcribing' ? 'Transcribing…' : 'Dictate'}
                  </span>
                </button>
                {error && <span className="text-xs text-red-500 text-right">{error}</span>}
              </div>
            )}
            {!voiceOK && error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
          </div>

          {/* Mood (optional) */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Mood <span className="text-slate-400 font-normal">· optional</span>
            </label>
            <div className="flex gap-1">
              {MOODS.map(m => (
                <button
                  key={m.v}
                  type="button"
                  aria-label={m.label}
                  aria-pressed={mood === m.v}
                  onClick={() => setMood(prev => (prev === m.v ? undefined : m.v))}
                  className={`flex-1 py-2 rounded-lg text-lg transition-colors ${
                    mood === m.v
                      ? 'bg-amber-100 dark:bg-amber-900/40 ring-2 ring-amber-400'
                      : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 opacity-80'
                  }`}
                >
                  {m.emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Energy (optional) */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Energy <span className="text-slate-400 font-normal">· optional</span>
            </label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(val => (
                <button
                  key={val}
                  type="button"
                  aria-label={`Energy ${val} of 5`}
                  aria-pressed={energy === val}
                  onClick={() => setEnergy(prev => (prev === val ? undefined : val))}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
                    energy === val
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">1 = drained · 5 = full of energy</p>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Entry date
            </label>
            <input
              type="date"
              value={date}
              max={todayLocalDate()}
              onChange={e => setDate(e.target.value || todayLocalDate())}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent text-slate-700 dark:text-slate-100"
            />
          </div>

          {coachEnabled && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {isEdit
                ? 'Saved to your journal.'
                : `Saved to your journal — ${coachName} sees new entries.`}
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="w-full font-semibold py-3 rounded-xl transition-colors text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isEdit ? 'Update entry' : 'Save entry'}
          </button>

          {isEdit && onDelete && (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onDelete}
                  className="flex-1 text-sm font-semibold px-4 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  Delete entry
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 text-sm font-medium px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                >
                  Keep it
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="w-full text-sm font-medium text-red-500 hover:text-red-600 py-1"
              >
                Delete entry
              </button>
            )
          )}
        </div>

        <div className="h-4" />
      </div>
    </div>
  )
}
