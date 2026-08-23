import { useMemo, useState } from 'react'
import type { TrainingWeek } from '../types'
import {
  buildProgression,
  projectToWeek,
  suggestNextTarget,
  type ExerciseProgression,
} from '../utils/strengthProgression'
import {
  e1RMTrend,
  detectPRs,
  formatPR,
  weeklyStrengthVolume,
  gobletBenchmarkComparison,
} from '../utils/strengthRecords'
import type { StrengthCapacity } from '../engines/strength/benchmark'

interface Props {
  weeks: TrainingWeek[]
  /** Current training week — drives the projection target. We project
   *  4 weeks forward by default and also at race week (last plan week). */
  currentWeekNum?: number
  /** Measured benchmark — powers the working-weight-vs-8RM bar. */
  capacity?: StrengthCapacity | null
}

export default function StrengthProgressSection({ weeks, currentWeekNum, capacity }: Props) {
  const progressionMap = useMemo(() => buildProgression(weeks), [weeks])
  const progressions = useMemo(() => {
    return Array.from(progressionMap.values())
      .filter(p => p.sessions.length > 0)
      .sort((a, b) => b.sessions.length - a.sessions.length)
  }, [progressionMap])
  // Records layer (Phase 4): PRs newest-first, weekly working-set volume,
  // and the benchmark comparison when one was measured.
  const prs = useMemo(() => detectPRs(weeks).slice(-5).reverse(), [weeks])
  const volume = useMemo(() => weeklyStrengthVolume(weeks).slice(-6), [weeks])
  const benchmark = useMemo(
    () => gobletBenchmarkComparison(progressionMap, capacity),
    [progressionMap, capacity],
  )

  // The section now owns the Stats "Strength" sub-tab, so an empty
  // history gets an explanation instead of a blank pane.
  if (progressions.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 mt-4 text-center space-y-1.5">
        <p className="text-2xl">🏋️</p>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No strength sessions logged yet</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Log a strength day (or play one live with ▶ Start) and your per-exercise
          trends, estimated 1RMs, and PRs build here.
        </p>
      </div>
    )
  }

  const lastWeekNum = weeks.length > 0 ? weeks[weeks.length - 1].num : 10
  const baseWeek = currentWeekNum ?? Math.max(...progressions.map(p => p.last?.weekNum ?? 1))
  const projectionWeek = Math.min(lastWeekNum, baseWeek + 4)

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 mt-4">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-base font-semibold text-slate-700 dark:text-slate-200">🏋️ Strength Progress</p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">{progressions.length} exercise{progressions.length === 1 ? '' : 's'} tracked</p>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        Per-exercise trajectory across all logged sessions, with a linear projection to Wk {projectionWeek} and Wk {lastWeekNum} (race week).
      </p>

      <div className="space-y-2">
        {progressions.map(p => (
          <ExerciseRow
            key={p.canonicalName}
            progression={p}
            projectionWeek={projectionWeek}
            raceWeekNum={lastWeekNum}
          />
        ))}
      </div>

      {benchmark && (
        <div className="mt-3 border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Working weight vs benchmark 8RM ({benchmark.benchLb} lb)
            </p>
            <p className="font-mono text-sm font-bold text-teal-700 dark:text-teal-400">{benchmark.pct}%</p>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-600"
              style={{ width: `${Math.min(100, benchmark.pct)}%` }}
            />
          </div>
          {benchmark.expectedNext8RMLb != null && (
            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              Your e1RM trend says the next re-test should clear a {benchmark.expectedNext8RMLb} lb 8RM.
            </p>
          )}
        </div>
      )}

      {prs.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">🏆 Recent PRs</p>
          <div className="space-y-1">
            {prs.map((pr, i) => (
              <div key={i} className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950 border border-amber-100 dark:border-amber-900 rounded-lg px-2.5 py-1.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-amber-900 dark:text-amber-200 truncate">{formatPR(pr)}</p>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">{pr.dayLabel}{pr.weekNum > 0 ? ` · Wk ${pr.weekNum}` : ' · previous plan'}</p>
                </div>
                <span className="shrink-0 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900 rounded px-1.5 py-0.5">PR</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {volume.length > 1 && (
        <div className="mt-3">
          <div className="flex items-baseline gap-1.5 mb-1.5">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Weekly strength volume</p>
            <p className="text-[10px] text-slate-400">(working sets)</p>
          </div>
          <div className="flex items-end gap-1.5 h-14">
            {volume.map(v => {
              const max = Math.max(...volume.map(x => x.sets))
              return (
                <div key={v.weekNum} className="flex-1 flex flex-col items-center gap-0.5">
                  <span className="font-mono text-[9px] text-slate-500">{v.sets}</span>
                  <div
                    className="w-full rounded-t bg-purple-500/80 dark:bg-purple-600"
                    style={{ height: `${Math.max(8, (v.sets / max) * 100)}%` }}
                  />
                  <span className="text-[9px] text-slate-400">W{v.weekNum}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] text-slate-400 dark:text-slate-500 leading-snug">
        Projections use simple linear regression on your session-by-session topset data. Confidence:
        <span className="text-emerald-600 dark:text-emerald-400 font-medium"> high</span> = 5+ sessions trending up,
        <span className="text-amber-600 dark:text-amber-400 font-medium"> medium</span> = 3+ sessions,
        <span className="text-slate-500 font-medium"> low</span> = fewer than 3 or noisy.
        Held-flat means you've maintained — good when the goal isn't more weight.
      </p>
    </div>
  )
}

function ExerciseRow({
  progression,
  projectionWeek,
  raceWeekNum,
}: {
  progression: ExerciseProgression
  projectionWeek: number
  raceWeekNum: number
}) {
  const [expanded, setExpanded] = useState(false)
  const first = progression.first!
  const last = progression.last!
  const firstReps = first.sets.length > 0 ? Math.round(first.totalReps / first.sets.length) : 0
  const lastReps = last.sets.length > 0 ? Math.round(last.totalReps / last.sets.length) : 0
  const isBW = progression.isBodyweight

  // Trajectory delta
  const weightDelta = last.topWeightLb - first.topWeightLb
  const repsDelta = lastReps - firstReps
  const weightPct = first.topWeightLb > 0 ? Math.round((weightDelta / first.topWeightLb) * 100) : 0
  const repsPct = firstReps > 0 ? Math.round((repsDelta / firstReps) * 100) : 0
  const trending = isBW ? repsDelta > 0 : weightDelta > 0
  const flat = isBW ? repsDelta === 0 : weightDelta === 0

  // Projections
  const projAtTarget = projectToWeek(progression, projectionWeek)
  const projAtRace = projectToWeek(progression, raceWeekNum)

  // Last vs target — replicate the workout-card "Try" line
  const target = suggestNextTarget(progression, last.sets.length, lastReps)

  // Estimated 1RM headline (Phase 4) — weighted lifts only.
  const e1rm = isBW ? null : e1RMTrend(progression)

  const trajIcon = trending ? '📈' : flat ? '➖' : '📉'
  const trajClass = trending ? 'text-emerald-600 dark:text-emerald-400' : flat ? 'text-slate-500' : 'text-amber-600 dark:text-amber-400'

  return (
    <div className="border border-slate-100 dark:border-slate-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-3 py-2 flex items-start justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{progression.displayName}</p>
          <p className={`text-xs font-mono ${trajClass}`}>
            <span className="mr-1">{trajIcon}</span>
            {isBW ? (
              <>{firstReps} → {lastReps} reps {repsDelta !== 0 && `(${repsDelta >= 0 ? '+' : ''}${repsPct}%)`}</>
            ) : (
              <>{first.topWeightLb} → {last.topWeightLb} lb {weightDelta !== 0 && `(${weightDelta >= 0 ? '+' : ''}${weightPct}%)`}</>
            )}
            <span className="text-slate-400 dark:text-slate-500 ml-1">· {progression.sessions.length} session{progression.sessions.length === 1 ? '' : 's'}</span>
          </p>
          {e1rm && (
            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              est. 1RM <span className="font-semibold text-slate-700 dark:text-slate-200">{e1rm.current} lb</span>
              {e1rm.deltaPct !== 0 && (
                <span className={e1rm.deltaPct > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                  {' '}({e1rm.deltaPct > 0 ? '+' : ''}{e1rm.deltaPct}% since first)
                </span>
              )}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          {projAtTarget && (
            <p className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
              Wk {projectionWeek}:{' '}
              {isBW
                ? <span className="font-semibold">{projAtTarget.predictedReps} reps</span>
                : <span className="font-semibold">{projAtTarget.predictedWeightLb} lb</span>}
            </p>
          )}
          <p className={`text-[10px] ${
            projAtTarget?.confidence === 'high' ? 'text-emerald-600 dark:text-emerald-400'
            : projAtTarget?.confidence === 'medium' ? 'text-amber-600 dark:text-amber-400'
            : 'text-slate-400'
          }`}>
            {projAtTarget?.method === 'last-known' ? 'held flat' : projAtTarget?.confidence ?? 'no projection'}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-700 space-y-2">
          <div className="text-xs space-y-0.5 font-mono">
            {progression.sessions.slice(-8).map((s, i) => {
              const reps = s.sets.length > 0 ? Math.round(s.totalReps / s.sets.length) : 0
              const isLast = i === Math.min(progression.sessions.length, 8) - 1
              return (
                <div key={i} className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-slate-400">{s.weekNum > 0 ? `Wk ${s.weekNum}` : `prev · ${s.dayLabel}`}</span>
                  <span className={isLast ? 'font-semibold text-slate-700 dark:text-slate-200' : ''}>
                    {s.topWeightLb > 0 ? `${s.topWeightLb} lb` : 'BW'} × {reps} × {s.sets.length}
                  </span>
                </div>
              )
            })}
            {projAtTarget && (
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 italic pt-1 border-t border-dashed border-slate-200 dark:border-slate-700 mt-1">
                <span className="text-slate-400">Wk {projectionWeek} (projected)</span>
                <span>
                  {isBW ? `BW × ${projAtTarget.predictedReps}` : `${projAtTarget.predictedWeightLb} lb`} × {last.sets.length}
                </span>
              </div>
            )}
            {projAtRace && projectionWeek !== raceWeekNum && (
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 italic">
                <span className="text-slate-400">Wk {raceWeekNum} (race week)</span>
                <span>
                  {isBW ? `BW × ${projAtRace.predictedReps}` : `${projAtRace.predictedWeightLb} lb`} × {last.sets.length}
                </span>
              </div>
            )}
          </div>

          {target && (
            <div className={`rounded-md px-2 py-1.5 text-xs ${
              target.tier === 'progress'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-100 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900'
                : target.tier === 'deload'
                  ? 'bg-amber-50 text-amber-800 border border-amber-100 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900'
                  : 'bg-slate-50 text-slate-700 border border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700'
            }`}>
              <p className="font-semibold">
                🎯 Next session: {target.weightLb > 0 ? `${target.weightLb} lb` : 'bodyweight'} × {target.reps} reps × {target.sets} sets
              </p>
              <p className="mt-0.5 leading-snug">{target.rationale}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
