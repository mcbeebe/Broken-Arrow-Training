import type { ReactNode } from 'react'

export type InsightTone = 'intelligence' | 'positive' | 'warning' | 'critical' | 'neutral'

interface Props {
  /** Body text — one short paragraph of plain-English read. */
  children: ReactNode
  /** Eyebrow label — defaults to "Athlete Intelligence" to match the
   *  Strava-style coaching read pattern. Override per-context if needed
   *  ("Coach read", "Race-week brief", etc.). */
  label?: string
  /** Tone changes the accent color of the eyebrow + border. */
  tone?: InsightTone
  /** Optional inline action — e.g. "Tell me more →" — rendered after the body. */
  action?: { label: string; onClick: () => void }
  /** Set false to drop the leading shield emoji. */
  showIcon?: boolean
  className?: string
}

const TONE_CONTAINER: Record<InsightTone, string> = {
  intelligence: 'bg-intelligence-50 dark:bg-intelligence-950/40 border-intelligence-200 dark:border-intelligence-900',
  positive: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900',
  warning: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900',
  critical: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900',
  neutral: 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800',
}

const TONE_LABEL: Record<InsightTone, string> = {
  intelligence: 'text-intelligence-700 dark:text-intelligence-300',
  positive: 'text-emerald-700 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  critical: 'text-rose-700 dark:text-rose-300',
  neutral: 'text-slate-600 dark:text-slate-400',
}

const TONE_ACTION: Record<InsightTone, string> = {
  intelligence: 'text-intelligence-700 dark:text-intelligence-300 hover:text-intelligence-800 dark:hover:text-intelligence-200',
  positive: 'text-emerald-700 dark:text-emerald-300 hover:text-emerald-800',
  warning: 'text-amber-700 dark:text-amber-300 hover:text-amber-800',
  critical: 'text-rose-700 dark:text-rose-300 hover:text-rose-800',
  neutral: 'text-slate-700 dark:text-slate-300 hover:text-slate-900',
}

export default function InsightNote({
  children, label = 'Athlete Intelligence', tone = 'intelligence', action, showIcon = true, className = '',
}: Props) {
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${TONE_CONTAINER[tone]} ${className}`}>
      <div className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${TONE_LABEL[tone]}`}>
        {showIcon && <span aria-hidden>🛡️</span>}
        <span>{label}</span>
      </div>
      <p className="text-sm text-slate-800 dark:text-slate-100 leading-snug mt-1.5">
        {children}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`text-xs font-semibold mt-2 transition-colors ${TONE_ACTION[tone]}`}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
