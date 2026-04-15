import type { CoachInsight } from '../types'

interface Props {
  insight: CoachInsight | null
  loading: boolean
  onAsk?: (seed: string) => void
}

/**
 * Daily LLM-generated coach read, rendered on Summary and at the top of
 * the Coach tab. When insight is null + not loading, renders nothing.
 * The "Ask about this →" button routes back to Coach tab with the
 * insight seeded as conversation context.
 */
export default function CoachInsightCard({ insight, loading, onAsk }: Props) {
  if (loading && !insight) {
    return (
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl px-3 py-3 animate-pulse">
        <div className="h-3 w-16 bg-indigo-200/60 rounded mb-2" />
        <div className="h-3 w-full bg-indigo-200/40 rounded mb-1" />
        <div className="h-3 w-3/4 bg-indigo-200/40 rounded" />
      </div>
    )
  }
  if (!insight || insight.silent || !insight.text) return null

  return (
    <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl px-3 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-base">🤖</span>
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
            Coach
          </p>
        </div>
        {onAsk && (
          <button
            onClick={() => onAsk(insight.text)}
            className="text-[11px] font-medium text-indigo-700 hover:text-indigo-900 transition-colors"
          >
            Ask about this →
          </button>
        )}
      </div>
      <p className="text-sm text-slate-800 leading-snug whitespace-pre-wrap">
        {insight.text}
      </p>
      {insight.tip && (
        <p className="mt-1.5 text-xs text-indigo-700/90 leading-snug">
          <span className="font-semibold">Tip:</span> {insight.tip}
        </p>
      )}
    </div>
  )
}
