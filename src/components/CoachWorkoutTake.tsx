import type { CoachWorkoutTake } from '../utils/coachNotes'
import type { CoachInsight } from '../types'
import { renderMarkdown } from '../utils/markdown'

interface Props {
  /** Heuristic fallback (used if no insight). */
  take?: CoachWorkoutTake
  /** LLM-generated insight — takes precedence when present. */
  insight?: CoachInsight | null
  loading?: boolean
  onAsk?: (seed: string) => void
}

/**
 * Coach's take rendered at the top of the WorkoutModal. Prefers the LLM
 * insight when available; otherwise falls back to the heuristic take.
 */
export default function CoachWorkoutTakeView({ take, insight, loading, onAsk }: Props) {
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
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xl">🤖</span>
          <p className="text-sm font-bold uppercase tracking-wider text-indigo-700">Coach</p>
        </div>
        {onAsk && (
          <button
            onClick={() => onAsk(text)}
            className="text-xs font-medium text-indigo-700 hover:text-indigo-900"
          >
            Ask →
          </button>
        )}
      </div>
      <div className="text-base text-slate-700 leading-relaxed">{renderMarkdown(text)}</div>
      {tip && (
        <div className="mt-2 text-sm text-indigo-700/90 leading-relaxed">
          <span className="font-semibold">Tip:</span> {renderMarkdown(tip)}
        </div>
      )}
    </div>
  )
}
