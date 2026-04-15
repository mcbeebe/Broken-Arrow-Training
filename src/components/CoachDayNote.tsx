import type { CoachDayNote } from '../utils/coachNotes'
import type { CoachInsight } from '../types'

interface CoachDayNoteProps {
  /** Heuristic fallback note (used when LLM insight is absent). */
  note?: CoachDayNote | null
  /** LLM-generated insight for this specific day card. Takes precedence. */
  insight?: CoachInsight | null
  loading?: boolean
  onAsk?: (seed: string) => void
}

/**
 * Inline coach line rendered on a DayCard. Prefers the LLM insight when
 * present; otherwise renders the heuristic note. Silent when neither
 * provides content.
 */
export default function CoachDayNoteView({ note, insight, loading, onAsk }: CoachDayNoteProps) {
  if (loading && !insight && !note) {
    return (
      <div className="mt-1.5 px-2 py-1.5 rounded-md border text-xs bg-indigo-50/50 border-indigo-100 text-indigo-600/60 animate-pulse">
        <span className="font-semibold">Coach:</span> …
      </div>
    )
  }

  // Prefer LLM insight
  if (insight && !insight.silent && insight.text) {
    return (
      <div className="mt-1.5 px-2 py-1.5 rounded-md border text-xs leading-snug bg-indigo-50 text-indigo-800 border-indigo-200 flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="font-semibold">Coach:</span> {insight.text}
        </div>
        {onAsk && (
          <button
            onClick={e => {
              e.stopPropagation()
              onAsk(insight.text)
            }}
            className="text-[10px] font-medium text-indigo-700 hover:text-indigo-900 shrink-0"
          >
            Ask →
          </button>
        )}
      </div>
    )
  }

  if (!note) return null

  const toneClass =
    note.tone === 'flag'
      ? 'bg-red-50 text-red-800 border-red-200'
      : note.tone === 'heads_up'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : 'bg-indigo-50 text-indigo-800 border-indigo-200'

  return (
    <div className={`mt-1.5 px-2 py-1.5 rounded-md border text-xs leading-snug ${toneClass} flex items-start justify-between gap-2`}>
      <div className="flex-1 min-w-0">
        <span className="font-semibold">Coach:</span> {note.text}
      </div>
      {onAsk && (
        <button
          onClick={e => {
            e.stopPropagation()
            onAsk(note.text)
          }}
          className="text-[10px] font-medium opacity-70 hover:opacity-100 shrink-0"
        >
          Ask →
        </button>
      )}
    </div>
  )
}
