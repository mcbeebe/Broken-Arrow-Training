import type { CoachInsight } from '../types'
import { renderMarkdown } from '../utils/markdown'

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
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xl">🤖</span>
          <p className="text-sm font-bold uppercase tracking-wider text-indigo-700">
            Coach
          </p>
        </div>
        {onAsk && (
          <button
            onClick={() => onAsk(insight.text)}
            className="text-sm font-medium text-indigo-700 hover:text-indigo-900 transition-colors"
          >
            Ask about this →
          </button>
        )}
      </div>
      <div className="text-base text-slate-800 leading-relaxed">
        {renderMarkdown(insight.text)}
      </div>
      {insight.tip && (
        <div className="mt-2 text-sm text-indigo-700/90 leading-relaxed">
          <span className="font-semibold">Tip:</span> {renderMarkdown(insight.tip)}
        </div>
      )}
    </div>
  )
}
