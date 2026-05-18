import type { ReactNode } from 'react'

export type MetricTone = 'default' | 'positive' | 'warning' | 'critical'
export type DeltaDirection = 'up' | 'down' | 'flat'
export type MetricSize = 'sm' | 'md'

export interface MetricDelta {
  /** Display text — "14%", "+3 min", "▲ 6 vs yesterday". */
  value: string
  /** Up/down/flat decides the chip color and arrow. */
  direction: DeltaDirection
  /** "Up is good" by default (volume, fitness). Set to true for metrics
   *  where down is good (fatigue, finish time, soreness). */
  invertGoodness?: boolean
}

interface Props {
  /** Short uppercase eyebrow — "Total Distance", "Quads tomorrow". */
  label: string
  /** Hero number or string. */
  value: ReactNode
  /** Tiny suffix appended to the value at smaller weight — "mi", "bpm". */
  valueSuffix?: string
  /** Comparison chip rendered to the right of the value. */
  delta?: MetricDelta
  /** One-line plain-English subtitle under the value. */
  subtitle?: string
  /** Optional date range / context label rendered under the subtitle. */
  context?: string
  /** Background/border tone — defaults to white card. */
  tone?: MetricTone
  /** Visual scale — "sm" for tight grids, "md" for hero positions. */
  size?: MetricSize
  /** Click handler — makes the whole card a button. */
  onClick?: () => void
  className?: string
}

const TONE_BG: Record<MetricTone, string> = {
  default: 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700',
  positive: 'bg-emerald-50 dark:bg-emerald-950 border-emerald-100 dark:border-emerald-900',
  warning: 'bg-amber-50 dark:bg-amber-950 border-amber-100 dark:border-amber-900',
  critical: 'bg-rose-50 dark:bg-rose-950 border-rose-100 dark:border-rose-900',
}

const TONE_LABEL: Record<MetricTone, string> = {
  default: 'text-slate-500 dark:text-slate-400',
  positive: 'text-emerald-700 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  critical: 'text-rose-700 dark:text-rose-300',
}

const SIZE: Record<MetricSize, { pad: string; value: string; suffix: string; subtitle: string }> = {
  sm: {
    pad: 'px-3 py-2',
    value: 'text-base font-bold',
    suffix: 'text-xs font-medium',
    subtitle: 'text-xs',
  },
  md: {
    pad: 'px-3.5 py-2.5',
    value: 'text-xl font-bold',
    suffix: 'text-sm font-medium',
    subtitle: 'text-xs',
  },
}

function deltaClasses(d: MetricDelta): string {
  if (d.direction === 'flat') {
    return 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800'
  }
  const goodUp = !d.invertGoodness
  const positive = d.direction === 'up' ? goodUp : !goodUp
  return positive
    ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-900/40'
    : 'text-rose-700 dark:text-rose-300 bg-rose-100/70 dark:bg-rose-900/40'
}

function deltaArrow(direction: DeltaDirection): string {
  if (direction === 'up') return '▲'
  if (direction === 'down') return '▼'
  return '—'
}

export default function MetricCard({
  label, value, valueSuffix, delta, subtitle, context,
  tone = 'default', size = 'md', onClick, className = '',
}: Props) {
  const Tag = onClick ? 'button' : 'div'
  const s = SIZE[size]
  return (
    <Tag
      onClick={onClick}
      className={`block w-full text-left rounded-xl border shadow-sm ${s.pad} ${TONE_BG[tone]} ${
        onClick ? 'hover:brightness-105 transition-[filter] cursor-pointer' : ''
      } ${className}`}
    >
      <p className={`text-[10px] font-medium uppercase tracking-wide ${TONE_LABEL[tone]}`}>
        {label}
      </p>
      <div className="flex items-baseline gap-1.5 mt-0.5 flex-wrap">
        <span className={`${s.value} text-slate-900 dark:text-slate-50 leading-tight`}>
          {value}
        </span>
        {valueSuffix && (
          <span className={`${s.suffix} text-slate-500 dark:text-slate-400`}>
            {valueSuffix}
          </span>
        )}
        {delta && (
          <span
            className={`inline-flex items-center gap-0.5 text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${deltaClasses(delta)}`}
            aria-label={`Change ${delta.direction} ${delta.value}`}
          >
            <span aria-hidden>{deltaArrow(delta.direction)}</span>
            <span>{delta.value}</span>
          </span>
        )}
      </div>
      {subtitle && (
        <p className={`${s.subtitle} text-slate-600 dark:text-slate-300 mt-1 leading-snug`}>
          {subtitle}
        </p>
      )}
      {context && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
          {context}
        </p>
      )}
    </Tag>
  )
}
