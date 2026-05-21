import { useEffect } from 'react'
import type { RaceInfo } from '../types'
import type { RaceReadinessDetail, RaceReadinessSummary, ReadinessAssignment } from '../utils/raceReadiness'
import { getWorkoutStyle } from '../utils/styles'

interface Props {
  race: RaceInfo
  summary: RaceReadinessSummary
  detail: RaceReadinessDetail
  onClose: () => void
  /** When provided, each assignment row becomes a button that opens the
   *  full daily workout card with the race-readiness target attached. */
  onSelectAssignment?: (weekNum: number, assignment: ReadinessAssignment) => void
}

const GAP_TONE: Record<RaceReadinessSummary['gap'], { ring: string; pill: string; pillText: string; headerBg: string; headerBorder: string }> = {
  'on-track': { ring: 'stroke-emerald-500', pill: 'bg-emerald-100 dark:bg-emerald-950', pillText: 'text-emerald-700 dark:text-emerald-300', headerBg: '#ECFDF5', headerBorder: '#059669' },
  fitness: { ring: 'stroke-blue-500', pill: 'bg-blue-100 dark:bg-blue-950', pillText: 'text-blue-700 dark:text-blue-300', headerBg: '#DBEAFE', headerBorder: '#2563EB' },
  vert: { ring: 'stroke-violet-500', pill: 'bg-violet-100 dark:bg-violet-950', pillText: 'text-violet-700 dark:text-violet-300', headerBg: '#EDE9FE', headerBorder: '#7C3AED' },
  taper: { ring: 'stroke-amber-500', pill: 'bg-amber-100 dark:bg-amber-950', pillText: 'text-amber-700 dark:text-amber-300', headerBg: '#FEF3C7', headerBorder: '#D97706' },
}

const GAP_LABEL: Record<RaceReadinessSummary['gap'], string> = {
  'on-track': 'on track',
  fitness: 'fitness gap',
  vert: 'vert gap',
  taper: 'taper window',
}

export default function RaceReadinessDetailModal({ race, summary, detail, onClose, onSelectAssignment }: Props) {
  const tone = GAP_TONE[summary.gap]
  const circumference = 2 * Math.PI * 32
  const offset = circumference * (1 - summary.pct / 100)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const horizonLabel = detail.horizonWeeks <= 1 ? 'This week' : `Next ${detail.horizonWeeks} weeks`

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Race readiness details"
        className="relative bg-white dark:bg-slate-800 rounded-t-2xl w-full max-h-[88dvh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="sticky top-0 px-4 pt-4 pb-3 rounded-t-2xl z-10 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700"
        >
          <div className="flex items-start gap-3">
            <div className="relative shrink-0">
              <svg width="80" height="80" viewBox="0 0 80 80" aria-hidden="true">
                <circle cx="40" cy="40" r="32" fill="none" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="6" />
                <circle
                  cx="40"
                  cy="40"
                  r="32"
                  fill="none"
                  className={tone.ring}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  transform="rotate(-90 40 40)"
                />
              </svg>
              <span
                className="absolute inset-0 flex items-center justify-center text-xl font-bold text-slate-800 dark:text-white"
                aria-label={`${summary.pct} percent ready`}
              >
                {summary.pct}%
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Race readiness</p>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${tone.pill} ${tone.pillText}`}>
                  {GAP_LABEL[summary.gap]}
                </span>
              </div>
              <p className="text-base font-semibold text-slate-800 dark:text-white mt-0.5 leading-snug">{summary.headline}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {race.name} · {race.distance} · {summary.daysLeft} day{summary.daysLeft === 1 ? '' : 's'} out
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors shrink-0"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-5">
          {/* Why this matters */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Why this matters
            </h3>
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{detail.why}</p>
          </section>

          {/* What changes — workout-anchored */}
          {detail.weeks.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                {horizonLabel} — what to change
              </h3>
              <div className="space-y-3">
                {detail.weeks.map(week => (
                  <div key={week.weekNum} className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white">{week.weekLabel}</p>
                      </div>
                      {week.focus && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{week.focus}</p>
                      )}
                    </div>
                    {week.assignments.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 italic">
                        No specific changes — keep the plan as written.
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                        {week.assignments.map((a, i) => {
                          const style = getWorkoutStyle(a.workoutType)
                          const tappable = !!onSelectAssignment
                          const rowInner = (
                            <div className="flex items-start gap-2">
                              <span className="text-lg leading-none mt-0.5" aria-hidden="true">{style.label}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-slate-800 dark:text-white">
                                  {a.dayLabel} · {a.plannedName}
                                </p>
                                {a.plannedDetail && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                                    <span className="font-medium">Planned:</span> {a.plannedDetail}
                                  </p>
                                )}
                                <div className={`mt-2 rounded-md px-2 py-1.5 ${tone.pill}`}>
                                  <p className={`text-xs font-semibold uppercase tracking-wide ${tone.pillText}`}>
                                    🎯 Race-day target
                                  </p>
                                  <p className="text-sm text-slate-800 dark:text-white mt-0.5 leading-snug font-semibold">
                                    {a.action}
                                  </p>
                                  <p className="text-xs text-slate-700 dark:text-slate-200 mt-0.5 leading-snug">
                                    {a.target}
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug italic">
                                    Same {a.dayLabel.split(/\s+/)[0]} session — bias it to deliver this. If your planned structure already hits the target, you're set.
                                  </p>
                                </div>
                                {tappable && (
                                  <p className="mt-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                    Tap for the full workout →
                                  </p>
                                )}
                              </div>
                            </div>
                          )
                          if (tappable) {
                            return (
                              <li key={i}>
                                <button
                                  type="button"
                                  onClick={() => onSelectAssignment!(week.weekNum, a)}
                                  aria-label={`Open ${a.dayLabel} ${a.plannedName} — race-day target: ${a.action}`}
                                  className="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                                >
                                  {rowInner}
                                </button>
                              </li>
                            )
                          }
                          return (
                            <li key={i} className="px-3 py-2.5">
                              {rowInner}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* By workout — what every other slot does */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
              By workout — what stays, what shifts
            </h3>
            <ul className="space-y-2">
              {detail.guidance.map((g, i) => (
                <li key={i} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{g.label}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">{g.text}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* Footnote */}
          <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
            Readiness blends fitness (CTL), race demands (distance + climbing), and recovery balance (TSB).
            Updates as you log workouts.
          </p>
        </div>
      </div>
    </div>
  )
}
