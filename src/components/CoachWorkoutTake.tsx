import { useEffect, useRef, useState } from 'react'
import type { CoachWorkoutTake } from '../utils/coachNotes'
import type { CoachInsight, CoachPersona } from '../types'
import { DEFAULT_COACH_NAME } from '../types'
import { renderMarkdown } from '../utils/markdown'
import { fetchTTSAudio, pickCoachVoice, type TTSError } from '../utils/voiceInput'

interface Props {
  /** Heuristic fallback (used if no insight). */
  take?: CoachWorkoutTake
  /** LLM-generated insight — takes precedence when present. */
  insight?: CoachInsight | null
  loading?: boolean
  onAsk?: (seed: string) => void
  /** Persona name; defaults to the app's default coach name. */
  coachName?: string
  /** Sprint 7 — when both are provided, a "Play briefing" button
   *  renders next to "Ask →" and streams a persona-voiced TTS
   *  rendering of the take text. */
  athleteId?: string
  persona?: CoachPersona | null
}

/**
 * Coach's take rendered at the top of the WorkoutModal. Prefers the LLM
 * insight when available; otherwise falls back to the heuristic take.
 */
export default function CoachWorkoutTakeView({ take, insight, loading, onAsk, coachName, athleteId, persona }: Props) {
  const name = coachName?.trim() || DEFAULT_COACH_NAME
  const text = (insight && !insight.silent && insight.text) || take?.text || ''
  const tip = (insight && insight.tip) || take?.tip

  if (loading && !text) {
    return (
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl px-3 py-2.5 animate-pulse">
        <div className="h-3 w-16 bg-indigo-200/60 rounded mb-2" />
        <div className="h-3 w-full bg-indigo-200/40 rounded" />
      </div>
    )
  }
  if (!text) return null

  return (
    <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl px-3 py-3">
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl leading-none" role="img" aria-label="coach">🧢</span>
          <p className="text-sm font-bold uppercase tracking-wider text-indigo-700 truncate">{name}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {athleteId && (
            <BriefingPlayButton
              athleteId={athleteId}
              text={tip ? `${text}\n\nTip: ${tip}` : text}
              persona={persona}
            />
          )}
          {onAsk && (
            <button
              onClick={() => onAsk(text)}
              className="text-xs font-medium text-indigo-700 hover:text-indigo-900"
            >
              Ask →
            </button>
          )}
        </div>
      </div>
      <div className="text-base text-slate-700 dark:text-slate-200 leading-relaxed">{renderMarkdown(text)}</div>
      {tip && (
        <div className="mt-2 text-sm text-indigo-700/90 leading-relaxed">
          <span className="font-semibold">Tip:</span> {renderMarkdown(tip)}
        </div>
      )}
    </div>
  )
}

/**
 * "Play briefing" — tap to hear the coach speak this workout's take
 * in their configured persona voice. Sprint 7 of the AI Coach roadmap.
 *
 * Pre-run audio briefings are the first piece of the trail-voice-coach
 * moat: hearing the right coach voice in your earbuds at the trailhead
 * is structurally different from reading the text. Neither Runna's road
 * pacing audio nor Athletica's (none-shipped) audio cover this.
 */
function BriefingPlayButton({
  athleteId,
  text,
  persona,
}: {
  athleteId: string
  text: string
  persona?: CoachPersona | null
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle')
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Clean up the audio element on unmount so nothing keeps playing if
  // the athlete closes the modal mid-briefing.
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  async function handleTap() {
    if (state === 'playing') {
      audioRef.current?.pause()
      audioRef.current = null
      setState('idle')
      return
    }
    if (state === 'loading') return
    setError(null)
    setState('loading')
    try {
      const voice = pickCoachVoice(persona)
      const audio = await fetchTTSAudio(athleteId, text, voice)
      audioRef.current = audio
      audio.addEventListener('ended', () => {
        if (audioRef.current === audio) audioRef.current = null
        setState('idle')
      })
      audio.addEventListener('error', () => {
        if (audioRef.current === audio) audioRef.current = null
        setState('idle')
        setError('Playback failed.')
      })
      await audio.play()
      setState('playing')
    } catch (e) {
      const err = e as TTSError
      setError(err?.message || 'Audio briefing failed.')
      setState('idle')
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleTap}
        disabled={state === 'loading'}
        aria-label={state === 'playing' ? 'Stop briefing' : 'Play audio briefing'}
        className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full transition-colors disabled:opacity-60 ${
          state === 'playing'
            ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100'
            : 'text-indigo-700 hover:text-indigo-900'
        }`}
        title={
          state === 'idle'
            ? 'Hear this in your coach\'s voice'
            : state === 'loading'
            ? 'Generating audio…'
            : 'Tap to stop'
        }
      >
        {state === 'loading' ? (
          <span className="inline-block w-3 h-3 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        ) : state === 'playing' ? (
          <span aria-hidden>⏸</span>
        ) : (
          <span aria-hidden>▶︎</span>
        )}
        <span>{state === 'playing' ? 'Stop' : state === 'loading' ? 'Generating…' : 'Play'}</span>
      </button>
      {error && (
        <span className="text-[10px] text-amber-700" title={error}>⚠</span>
      )}
    </div>
  )
}
