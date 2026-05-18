import type { ReactNode } from 'react'

export type InsightTone = 'intelligence' | 'positive' | 'warning' | 'critical' | 'neutral'

interface Props {
  /** Body text — one short paragraph of plain-English read. */
  children: ReactNode
  /** Eyebrow label — defaults to "Athlete Intelligence" to match the
   *  Strava-style coaching read pattern. */
  label?: string
  /** Tone changes the accent color of the eyebrow + accent stripe. */
  tone?: InsightTone
  /** Optional inline action — "Tell me more →". */
  action?: { label: string; onClick: () => void }
  /** Set false to drop the leading shield emoji. */
  showIcon?: boolean
  className?: string
}

const TONE_LABEL: Record<InsightTone, string> = {
  intelligence: 'text-intelligence-700 dark:text-intelligence-300',
  positive: 'text-emerald-700 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  critical: 'text-rose-700 dark:text-rose-300',
  neutral: 'text-slate-600 dark:text-slate-400',
}

const TONE_ACCENT: Record<InsightTone, string> = {
  intelligence: 'border-l-intelligence-400 dark:border-l-intelligence-600',
  positive: 'border-l-emerald-400 dark:border-l-emerald-600',
  warning: 'border-l-amber-400 dark:border-l-amber-600',
  critical: 'border-l-rose-400 dark:border-l-rose-600',
  neutral: 'border-l-slate-300 dark:border-l-slate-600',
}

const TONE_ACTION: Record<InsightTone, string> = {
  intelligence: 'text-intelligence-700 dark:text-intelligence-300 hover:text-intelligence-800 dark:hover:text-intelligence-200',
  positive: 'text-emerald-700 dark:text-emerald-300 hover:text-emerald-800',
  warning: 'text-amber-700 dark:text-amber-300 hover:text-amber-800',
  critical: 'text-rose-700 dark:text-rose-300 hover:text-rose-800',
  neutral: 'text-slate-700 dark:text-slate-300 hover:text-slate-900',
}

export default function InsightNote({
  children, label = 'Athlete Intelligence', tone = 'intelligence',
  action, showIcon = true, className = '',
}: Props) {
  return (
    <div
      className={`rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 border-l-4 px-3 py-2.5 ${TONE_ACCENT[tone]} ${className}`}
    >
      <div className={`flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide ${TONE_LABEL[tone]}`}>
        {showIcon && <span aria-hidden className="text-[11px]">🛡️</span>}
        <span>{label}</span>
      </div>
      <p className="text-xs text-slate-700 dark:text-slate-200 leading-snug mt-1">
        {children}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`text-[11px] font-semibold mt-1.5 transition-colors ${TONE_ACTION[tone]}`}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
