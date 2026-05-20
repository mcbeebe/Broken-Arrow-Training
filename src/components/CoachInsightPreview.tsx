import { useMemo } from 'react'
import type { CoachInsight } from '../types'
import { extractProposal } from '../utils/chatProposal'
import { extractTriggerSignal, firstSentencePreview } from '../utils/coachInsightText'

interface Props {
  insight: CoachInsight | null
  loading: boolean
  coachName?: string
  /** Open the Coach tab so the athlete can read the full message
   *  and reply in chat. */
  onOpenCoachTab: () => void
}

/**
 * Compact Summary-tab surface for the daily coach insight. Shows the coach
 * name, the trigger pill, and a one-sentence preview — tapping anywhere on
 * the card opens the Coach tab where the full message lives. Keeps Summary
 * scannable while making the full read one tap away.
 */
export default function CoachInsightPreview({ insight, loading, coachName, onOpenCoachTab }: Props) {
  const name = coachName?.trim() || 'Coach'

  const { signal, preview } = useMemo(() => {
    if (!insight?.text) return { signal: null as string | null, preview: '' }
    const { content } = extractProposal(insight.text)
    const t = extractTriggerSignal(content || insight.text)
    return { signal: t.signal, preview: firstSentencePreview(t.body || content || insight.text) }
  }, [insight])

  if (loading && !insight) {
    return (
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl px-3 py-3 animate-pulse">
        <div className="h-3 w-16 bg-indigo-200/60 rounded mb-2" />
        <div className="h-3 w-3/4 bg-indigo-200/40 rounded" />
      </div>
    )
  }
  if (!insight || insight.silent || !insight.text) return null

  return (
    <button
      type="button"
      onClick={onOpenCoachTab}
      aria-label={`Open Coach tab to read full message from ${name}`}
      className="w-full text-left bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-xl px-3 py-3 hover:bg-indigo-100/70 dark:hover:bg-indigo-950/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xl leading-none shrink-0" role="img" aria-label="coach">🧢</span>
          <p className="text-sm font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-200 truncate">
            {name}
          </p>
        </div>
        <span aria-hidden className="text-indigo-500 dark:text-indigo-300 text-lg shrink-0 leading-none">›</span>
      </div>

      {signal && (
        <span className="mt-1.5 inline-flex items-center gap-1 max-w-full text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-200 bg-indigo-100/80 dark:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 rounded-full px-2 py-0.5">
          <span aria-hidden>⚡</span>
          <span className="truncate">{signal}</span>
        </span>
      )}

      {preview && (
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-200 leading-snug">
          {preview}
        </p>
      )}

      <p className="mt-2 text-xs font-medium text-indigo-700 dark:text-indigo-300">
        Read full message in Coach →
      </p>
    </button>
  )
}
