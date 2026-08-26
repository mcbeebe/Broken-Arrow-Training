import { useMemo } from 'react'
import type { TrainingWeek } from '../types'
import type { StrengthCapacity } from '../engines/strength/benchmark'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import { buildAthleteModel, fmtPaceSecMi } from '../engines/adaptive/athleteModel'
import { projectHyroxFinish, formatFinish } from '../engines/hyrox/projection'
import { todayDateString } from '../utils/planDates'

/**
 * "Your Engine" (Adaptive Engine phase 2, PR 5 — mockup C1): the
 * athlete model rendered with its receipts. Every number names its
 * evidence; every missing number says what unlocks it. Nothing here is
 * a questionnaire answer.
 */
interface Props {
  weeks: TrainingWeek[]
  capacity?: StrengthCapacity | null
  /** For the projection card (Hyrox plans). */
  config?: OnboardingConfig | null
}

export default function YourEngineSection({ weeks, capacity, config }: Props) {
  const model = useMemo(
    () => buildAthleteModel(weeks, todayDateString(), { capacity }),
    [weeks, capacity],
  )
  const projection = useMemo(
    () => (config?.raceType === 'hyrox' ? projectHyroxFinish({ weeks, config, capacity }) : null),
    [weeks, config, capacity],
  )
  const cs = model.criticalSpeed
  const eff = model.efficiency

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 mt-4 space-y-3">
      <div>
        <p className="text-base font-semibold text-slate-700 dark:text-slate-200">⚙️ Your engine</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          What your plan runs on — every number measured from you, updated as workouts land.
        </p>
      </div>

      {/* Critical speed */}
      <div className="border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-purple-700 dark:text-purple-400">Critical speed</p>
          {cs && (
            <span className="text-[10px] text-slate-400">
              {cs.method === 'linear-fit' ? `fit from ${cs.effortCount} efforts` : `best-effort floor · ${cs.effortCount} runs`}
            </span>
          )}
        </div>
        {cs ? (
          <>
            <p className="font-mono text-xl font-bold text-slate-800 dark:text-white mt-1">{fmtPaceSecMi(cs.secPerMi)}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              The pace you can sustain aerobically{cs.method === 'best-effort' ? ' — a floor until a time trial or hard intervals sharpen it' : `, with a ${cs.dPrimeMeters} m anaerobic reserve`}.
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-400 mt-1">Not enough data yet — a few runs over 8 minutes unlock this.</p>
        )}
      </div>

      {/* Efficiency trend */}
      <div className="border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-purple-700 dark:text-purple-400">Aerobic efficiency</p>
          {eff && <span className="text-[10px] text-slate-400">from {eff.sampleCount} steady runs</span>}
        </div>
        {eff ? (
          <>
            <p className="font-mono text-xl font-bold text-slate-800 dark:text-white mt-1">
              {eff.current}
              <span className={`text-sm ml-2 ${eff.deltaPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {eff.deltaPct >= 0 ? '+' : ''}{eff.deltaPct}% vs your baseline
              </span>
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              Speed per heartbeat on steady runs — the fitness signal every run measures for free.
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-400 mt-1">Not enough data yet — steady runs with heart rate, spread over a few weeks, unlock this.</p>
        )}
      </div>

      {/* Volume row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-purple-700 dark:text-purple-400">Weekly volume</p>
          <p className="font-mono text-xl font-bold text-slate-800 dark:text-white mt-1">
            {model.weeklyRunMiles4wk != null ? `${model.weeklyRunMiles4wk} mi` : '—'}
          </p>
          <p className="text-[10px] text-slate-400 leading-snug">measured, trailing 4 weeks</p>
        </div>
        <div className="border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-purple-700 dark:text-purple-400">Longest run</p>
          <p className="font-mono text-xl font-bold text-slate-800 dark:text-white mt-1">
            {model.longestRun30dMi != null ? `${model.longestRun30dMi} mi` : '—'}
          </p>
          <p className="text-[10px] text-slate-400 leading-snug">30 days — new runs cap at +10% of this</p>
        </div>
      </div>

      {/* Strength */}
      {model.strength.length > 0 && (
        <div className="border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-purple-700 dark:text-purple-400 mb-1.5">Strength (est. 1RM)</p>
          <div className="space-y-1">
            {model.strength.map(s => (
              <div key={s.name} className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-slate-600 dark:text-slate-300 truncate">{s.name}</span>
                <span className="font-mono text-xs font-semibold text-slate-800 dark:text-white shrink-0">
                  {s.e1RM} lb
                  <span className={`ml-1.5 ${s.deltaPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {s.deltaPct >= 0 ? '+' : ''}{s.deltaPct}%
                  </span>
                  <span className="text-slate-400 font-normal ml-1.5">· {s.sessions} sessions</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Benchmarks */}
      {model.stationBenchmarks.length > 0 && (
        <div className="border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-purple-700 dark:text-purple-400 mb-1.5">Measured benchmarks</p>
          <div className="space-y-1">
            {model.stationBenchmarks.map(b => (
              <div key={b.label} className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-slate-600 dark:text-slate-300">{b.label}</span>
                <span className="font-mono text-xs font-semibold text-slate-800 dark:text-white">{b.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projection */}
      {projection && (
        <div className="bg-slate-900 rounded-lg px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-teal-400">Race projection</p>
            <span className="text-[10px] text-slate-500">{projection.confidence} confidence</span>
          </div>
          <p className="font-mono text-xl font-bold text-white mt-1">
            {formatFinish(projection.lowSec)} – {formatFinish(projection.highSec)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{projection.basis[0]}</p>
        </div>
      )}

      <p className="text-[10px] text-slate-400 leading-snug">
        The model rebuilds from your history on every open. Benchmarks, time trials, and simulations sharpen it fastest.
      </p>
    </div>
  )
}
