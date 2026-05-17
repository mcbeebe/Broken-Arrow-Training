import type { ReactNode } from 'react'

export type MetricTone = 'default' | 'positive' | 'warning' | 'critical'
export type DeltaDirection = 'up' | 'down' | 'flat'

export interface MetricDelta {
  /** Display text — e.g. "14%", "+3 min", "▲ 6 vs yesterday". */
  value: string
  /** Up/down/flat decides the chip color and arrow. */
  direction: DeltaDirection
  /** "Up is good" by default (volume, fitness). Set to true for metrics
   *  where down is good (fatigue, finish time, soreness) so the color
   *  semantics flip. */
  invertGoodness?: boolean
}

interface Props {
  /** Short uppercase eyebrow — "Total Distance", "Quads tomorrow". */
  label: string
  /** Hero number or string. Renders large + bold. */
  value: ReactNode
  /** Tiny suffix appended to the value at smaller weight — "mi", "bpm". */
  valueSuffix?: string
  /** Comparison chip rendered to the right of the value. */
  delta?: MetricDelta
  /** One-line plain-English subtitle under the value. */
  subtitle?: string
  /** Optional date range or context label rendered under the subtitle. */
  context?: string
  /** Background/border tone — defaults to neutral slate. */
  tone?: MetricTone
  /** Click handler — makes the whole card a button. */
  onClick?: () => void
  className?: string
}

const TONE_BG: Record<MetricTone, string> = {
  default: 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800',
  positive: 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900',
  warning: 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900',
  critical: 'bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-900',
}

const TONE_LABEL: Record<MetricTone, string> = {
  default: 'text-slate-500 dark:text-slate-400',
  positive: 'text-emerald-700 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  critical: 'text-rose-700 dark:text-rose-300',
}

function deltaClasses(d: MetricDelta): string {
  const flat = d.direction === 'flat'
  const goodUp = !d.invertGoodness
  const isPositiveOutcome =
    flat ? false : (d.direction === 'up' ? goodUp : !goodUp)
  if (flat) {
    return 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800'
  }
  return isPositiveOutcome
    ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-900/40'
    : 'text-rose-700 dark:text-rose-300 bg-rose-100/70 dark:bg-rose-900/40'
}

function deltaArrow(direction: DeltaDirection): string {
  if (direction === 'up') return '▲'
  if (direction === 'down') return '▼'
  return '—'
}

export default function MetricCard({
  label, value, valueSuffix, delta, subtitle, context, tone = 'default', onClick, className = '',
}: Props) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`block w-full text-left rounded-xl border px-4 py-3.5 ${TONE_BG[tone]} ${
        onClick ? 'hover:brightness-105 transition-[filter] cursor-pointer' : ''
      } ${className}`}
    >
      <p className={`text-[11px] font-semibold uppercase tracking-wider ${TONE_LABEL[tone]}`}>
        {label}
      </p>
      <div className="flex items-baseline gap-2 mt-1 flex-wrap">
        <span className="text-3xl font-bold text-slate-900 dark:text-slate-50 leading-none">
          {value}
        </span>
        {valueSuffix && (
          <span className="text-base font-medium text-slate-500 dark:text-slate-400">
            {valueSuffix}
          </span>
        )}
        {delta && (
          <span
            className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5 ${deltaClasses(delta)}`}
            aria-label={`Change ${delta.direction} ${delta.value}`}
          >
            <span aria-hidden>{deltaArrow(delta.direction)}</span>
            <span>{delta.value}</span>
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-sm text-slate-700 dark:text-slate-200 mt-1.5 leading-snug">
          {subtitle}
        </p>
      )}
      {context && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {context}
        </p>
      )}
    </Tag>
  )
}
