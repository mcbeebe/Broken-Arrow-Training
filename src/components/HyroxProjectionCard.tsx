import { useMemo, useState } from 'react'
import type { TrainingWeek } from '../types'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import type { StrengthCapacity } from '../engines/strength/benchmark'
import { projectHyroxFinish, formatFinish, type SegmentSource } from '../engines/hyrox/projection'

/**
 * Projected Hyrox finish (Phase 4, PR 10) — the Race-tab card that turns
 * simulations, benchmarks, and run fitness into a finish range. Renders
 * nothing when no personal evidence exists: population averages are not
 * this athlete's projection.
 */

const SOURCE_LABEL: Record<SegmentSource, string> = {
  sim: 'measured',
  benchmark: 'benchmark',
  'run-fitness': 'run fitness',
  typical: 'typical',
}

const SOURCE_CLASS: Record<SegmentSource, string> = {
  sim: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
  benchmark: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  'run-fitness': 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
  typical: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
}

export default function HyroxProjectionCard({ weeks, config, capacity }: {
  weeks: TrainingWeek[]
  config?: OnboardingConfig | null
  capacity?: StrengthCapacity | null
}) {
  const [expanded, setExpanded] = useState(false)
  const projection = useMemo(
    () => projectHyroxFinish({ weeks, config, capacity }),
    [weeks, config, capacity],
  )
  if (!projection) return null

  const confClass =
    projection.confidence === 'high' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
    : projection.confidence === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
    : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'

  return (
    <div className="mt-3 bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">🎯 Projected finish</p>
        <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${confClass}`}>
          {projection.confidence} confidence
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <p className="font-mono text-2xl font-bold text-teal-700 dark:text-teal-400">
          {formatFinish(projection.lowSec)} – {formatFinish(projection.highSec)}
        </p>
        <p className="font-mono text-xs text-slate-400">mid {formatFinish(projection.totalSec)}</p>
      </div>

      <ul className="mt-2 space-y-0.5">
        {projection.basis.map((b, i) => (
          <li key={i} className="text-xs text-slate-500 dark:text-slate-400 leading-snug">· {b}</li>
        ))}
      </ul>

      <button
        onClick={() => setExpanded(e => !e)}
        className="mt-2 text-xs font-medium text-teal-700 dark:text-teal-400"
      >
        {expanded ? 'Hide segment estimates' : 'Show segment estimates'}
      </button>

      {expanded && (
        <div className="mt-2 space-y-0.5">
          {projection.segments.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-sm rounded px-2 py-1 bg-slate-50 dark:bg-slate-900">
              <span className="text-slate-600 dark:text-slate-300 truncate">{s.label}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className={`text-[9px] font-semibold rounded px-1 py-0.5 ${SOURCE_CLASS[s.source]}`}>
                  {SOURCE_LABEL[s.source]}
                </span>
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{formatFinish(s.sec)}</span>
              </span>
            </div>
          ))}
          <p className="pt-1 text-[10px] text-slate-400 leading-snug">
            Simulation splits already include transitions; a parts-built projection adds a roxzone allowance.
            Run a race simulation to replace every "typical" line with your own numbers.
          </p>
        </div>
      )}
    </div>
  )
}
