import type { ReactNode } from 'react'
import InsightNote, { type InsightTone } from './InsightNote'

interface Props {
  /** Section title — e.g. "Total Distance", "Time in Zones". */
  title: string
  /** Headline value rendered next to the title — e.g. "99.7 mi". */
  headlineValue?: ReactNode
  /** Right-side header slot (filter chips, compare toggle, share). */
  headerAction?: ReactNode
  /** Subtitle under the title — date range, sport scope, etc. */
  subtitle?: string
  /** The chart itself. */
  children: ReactNode
  /** Plain-English coaching read rendered below the chart. String or node. */
  insight?: ReactNode
  /** Eyebrow override for the insight note. */
  insightLabel?: string
  /** Tone override for the insight note. */
  insightTone?: InsightTone
  /** Inline action attached to the insight ("Tell me more →"). */
  insightAction?: { label: string; onClick: () => void }
  className?: string
}

/**
 * Universal section rhythm — headline → chart → plain-English read.
 * The container of every Progress/Activity-Detail section so the user
 * learns one pattern and reads every metric the same way.
 */
export default function ChartWithInsight({
  title, headlineValue, headerAction, subtitle, children,
  insight, insightLabel, insightTone, insightAction, className = '',
}: Props) {
  return (
    <section className={`space-y-3 ${className}`}>
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            {title}
          </h3>
          {headlineValue !== undefined && (
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-50 mt-1 leading-none">
              {headlineValue}
            </p>
          )}
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {subtitle}
            </p>
          )}
        </div>
        {headerAction && <div className="shrink-0">{headerAction}</div>}
      </header>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
        {children}
      </div>
      {insight !== undefined && insight !== null && insight !== '' && (
        <InsightNote
          label={insightLabel}
          tone={insightTone}
          action={insightAction}
        >
          {insight}
        </InsightNote>
      )}
    </section>
  )
}
