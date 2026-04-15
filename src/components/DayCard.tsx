import type { PlannedDay, ReadinessScore } from '../types'
import { getWorkoutStyle } from '../utils/styles'
import { formatMiles, formatSeconds, estimateRunTime } from '../utils/format'
import { parsePlannedTargets } from '../utils/targets'
import { gradeWorkoutDay } from '../hooks/useCompliance'
import { getPlannedDrills, getDrillDay } from '../utils/drills'
import TargetVsActual from './TargetVsActual'

interface DayCardProps {
  day: PlannedDay
  weekNum?: number
  onTap: () => void
  onLog?: () => void
  onSwap?: () => void
  isSwapSelected?: boolean
  isSwapTarget?: boolean
  readiness?: ReadinessScore
}

export default function DayCard({ day, weekNum, onTap, onLog, onSwap, isSwapSelected, isSwapTarget, readiness }: DayCardProps) {
  const style = getWorkoutStyle(day.type)
  const actual = day.actual
  const timeEst = estimateRunTime(day.zone)

  const dotColor = readiness?.status === 'PEAK' ? 'bg-indigo-500'
    : readiness?.status === 'YELLOW' ? 'bg-amber-400'
    : readiness?.status === 'RED' ? 'bg-red-500'
    : null

  const statusDot = readiness && dotColor ? (
    <span
      className={`w-2.5 h-2.5 rounded-full inline-block ${dotColor}`}
      title={`Readiness: ${readiness.status} (${readiness.displayScore}/100) — State ${readiness.trainingState}`}
    />
  ) : null

  return (
    <div
      className="rounded-xl overflow-hidden shadow-sm cursor-pointer active:scale-[0.98] transition-transform"
      style={{ backgroundColor: style.bg, borderLeft: `4px solid ${style.border}` }}
      onClick={onTap}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">{style.label}</span>
            <span className="font-semibold text-sm text-slate-800">{day.day}</span>
            {actual && (
              <span className="text-xs bg-green-100 text-green-700 rounded-full px-1.5 py-0.5 font-medium">
                ✓ Done{actual.rpe ? ` · RPE ${actual.rpe}` : ''}
              </span>
            )}
            {(() => {
              // Drill indicator: show for run days that either have drills in
              // the plan detail or are the week's scheduled drill day.
              const runTypes = new Set(['run', 'long', 'quality', 'race'])
              if (!runTypes.has(day.type)) return null
              const plannedDrills = getPlannedDrills(day)
              const isScheduledDrillDay = weekNum !== undefined && getDrillDay(weekNum) === day.day
              if (plannedDrills.length === 0 && !isScheduledDrillDay) return null
              const drillDone = actual?.drills?.completed
              const doneCount = actual?.drills?.items?.filter(i => i.done).length ?? 0
              const totalCount = actual?.drills?.items?.length ?? plannedDrills.length
              if (drillDone) {
                return (
                  <span className="text-[10px] bg-sky-100 text-sky-700 rounded-full px-1.5 py-0.5 font-medium"
                    title={`Drills done${doneCount > 0 ? ` (${doneCount}/${totalCount})` : ''}`}>
                    🤸 Drills ✓
                  </span>
                )
              }
              if (actual) {
                return (
                  <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-medium"
                    title="Drills planned but not logged as completed">
                    🤸 Drills —
                  </span>
                )
              }
              return (
                <span className="text-[10px] bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5 font-medium"
                  title="Drills scheduled for this run">
                  🤸 Drills
                </span>
              )
            })()}
          </div>
          <div className="flex items-center gap-1.5">
            {onSwap && (
              <button
                onClick={e => { e.stopPropagation(); onSwap() }}
                className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
                  isSwapSelected
                    ? 'bg-teal-500 text-white'
                    : isSwapTarget
                    ? 'bg-teal-100 text-teal-700 animate-pulse'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                ⇄
              </button>
            )}
            {onLog && (
              <button
                onClick={e => { e.stopPropagation(); onLog() }}
                className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
                  actual
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                }`}
              >
                {actual ? '✏️ Edit' : '📝 Log'}
              </button>
            )}
            {statusDot}
            {day.time !== '—' && (
              <span className="text-xs text-slate-500 bg-white/60 rounded-full px-2 py-0.5">
                {day.time}
              </span>
            )}
            <span className="text-slate-400 text-xs">›</span>
          </div>
        </div>
        <div className="mt-1.5">
          <p className="font-medium text-sm text-slate-800">{day.workout}</p>
          {day.detail && (
            <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{day.detail}</p>
          )}
        </div>
        {day.zone !== '—' && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
            <span>📊 {day.zone}{timeEst ? ` (${timeEst} running)` : ''}</span>
            {day.route !== '—' && <span>📍 {day.route}</span>}
          </div>
        )}

        {/* Readiness adjustment suggestion */}
        {readiness && readiness.adjustment && readiness.status !== 'GREEN' && (
          <div className={`mt-1.5 px-2 py-1 rounded-md text-xs ${
            readiness.status === 'YELLOW'
              ? 'bg-amber-100/60 text-amber-700'
              : 'bg-red-100/60 text-red-700'
          }`}>
            💡 {readiness.adjustment}
          </div>
        )}

        {/* Target vs Actual compliance grid (renders if targets parseable & workout done) */}
        {actual && (() => {
          const targets = parsePlannedTargets(day)
          const hasTargets = targets.distanceMi !== undefined
            || targets.durationMin !== undefined
            || targets.hrLow !== undefined
          if (!hasTargets) return null
          const compliance = gradeWorkoutDay(day, targets)
          return <TargetVsActual compliance={compliance} />
        })()}

        {/* Actual data overlay */}
        {actual && (
          <div className="mt-2 pt-2 border-t border-slate-200/50">
            <p className="text-xs font-medium text-teal-700 mb-1">
              {actual.source === 'manual' || actual.type === 'Manual' ? '📝' : actual.source === 'garmin' ? '⌚ Garmin:' : '🔗 Strava:'} {actual.name}
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
              {actual.distance > 0 && (
                <span>📏 {formatMiles(actual.distance)}</span>
              )}
              {actual.movingTime > 0 && (
                <span>⏱ {formatSeconds(actual.movingTime)}</span>
              )}
              {actual.avgHR && (
                <span>❤️ {actual.avgHR} avg</span>
              )}
              {actual.elevationGain > 0 && (
                <span>⛰ {actual.elevationGain} ft</span>
              )}
              {actual.sufferScore && (
                <span>🔥 {actual.sufferScore} effort</span>
              )}
              {actual.calories && (
                <span>🔋 {actual.calories} cal</span>
              )}
              {actual.aerobicTE != null && (
                <span>🫀 AE {actual.aerobicTE.toFixed(1)}</span>
              )}
              {actual.anaerobicTE != null && (
                <span>⚡ AN {actual.anaerobicTE.toFixed(1)}</span>
              )}
              {actual.epoc != null && actual.epoc > 0 && (
                <span>🔥 EPOC {Math.round(actual.epoc)}</span>
              )}
              {actual.recoveryTimeHours != null && actual.recoveryTimeHours > 0 && (
                <span>🔄 {actual.recoveryTimeHours}h recovery</span>
              )}
            </div>
            {actual.hrZoneSummary && actual.hrZoneSummary.length > 0 && (
              <div className="mt-1.5">
                <div className="flex h-2 rounded-full overflow-hidden">
                  {actual.hrZoneSummary.map((z, i) => {
                    const total = actual.hrZoneSummary!.reduce((s, z) => s + z.seconds, 0)
                    const pct = total > 0 ? (z.seconds / total) * 100 : 0
                    const colors = ['#94A3B8', '#3B82F6', '#22C55E', '#F59E0B', '#EF4444']
                    return pct > 0 ? (
                      <div key={i} style={{ width: `${pct}%`, backgroundColor: colors[z.zone - 1] || '#94A3B8' }} />
                    ) : null
                  })}
                </div>
                <div className="flex justify-between mt-0.5">
                  <span className="text-[8px] text-slate-400">Z1</span>
                  <span className="text-[8px] text-slate-400">Z5</span>
                </div>
              </div>
            )}
            {actual.strengthLog && actual.strengthLog.length > 0 && (
              <div className="mt-1.5 text-xs text-purple-600">
                💪 {actual.strengthLog.length} exercise{actual.strengthLog.length > 1 ? 's' : ''}
                {' · '}
                {actual.strengthLog.map(ex => ex.focus).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
              </div>
            )}
            {actual.rpe && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                  actual.rpe <= 3 ? 'bg-green-100 text-green-700'
                  : actual.rpe <= 6 ? 'bg-amber-100 text-amber-700'
                  : actual.rpe <= 8 ? 'bg-orange-100 text-orange-700'
                  : 'bg-red-100 text-red-700'
                }`}>RPE {actual.rpe}/10</span>
                <span className="text-[10px] text-slate-400">
                  {actual.rpe <= 3 ? 'Easy' : actual.rpe <= 5 ? 'Moderate' : actual.rpe <= 7 ? 'Hard' : actual.rpe <= 9 ? 'Very Hard' : 'Max'}
                </span>
              </div>
            )}
            {actual.notes && (
              <p className="mt-1 text-xs text-slate-500 italic">{actual.notes}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
