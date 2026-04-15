import { useState } from 'react'
import type { PlannedDay, ReadinessScore } from '../types'
import { getWorkoutStyle } from '../utils/styles'
import { formatMiles, formatSeconds, estimateRunTime } from '../utils/format'
import { parsePlannedTargets } from '../utils/targets'
import { gradeWorkoutDay } from '../hooks/useCompliance'
import { getPlannedDrills, getDrillDay } from '../utils/drills'
import { calculateGrade } from '../utils/grading'
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
  const gradeResult = calculateGrade(day)
  const isCompleted = !!actual
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)

  // When completed, use a more saturated emerald background but preserve
  // the workout-type color as the left border (visual identity stays)
  const cardBg = isCompleted ? '#D1FAE5' : style.bg

  const dotColor = readiness?.status === 'PEAK' ? 'bg-indigo-500'
    : readiness?.status === 'YELLOW' ? 'bg-amber-400'
    : readiness?.status === 'RED' ? 'bg-red-500'
    : null

  const statusDot = readiness && dotColor ? (
    <span
      className={`w-3 h-3 rounded-full inline-block ${dotColor}`}
      title={`Readiness: ${readiness.status} (${readiness.displayScore}/100) — State ${readiness.trainingState}`}
    />
  ) : null

  return (
    <div
      className="rounded-xl overflow-hidden shadow-sm cursor-pointer active:scale-[0.98] transition-all"
      style={{ backgroundColor: cardBg, borderLeft: `4px solid ${style.border}` }}
      onClick={onTap}
    >
      <div className="px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base">{style.label}</span>
              <span className="font-semibold text-base text-slate-800">{day.day}</span>
              {actual?.rpe && (
                <span className="text-xs bg-white/60 text-slate-700 rounded-full px-2 py-0.5 font-medium">
                  RPE {actual.rpe}
                </span>
              )}
              {(() => {
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
                    <span className="text-xs bg-sky-100 text-sky-700 rounded-full px-2 py-0.5 font-medium"
                      title={`Drills done${doneCount > 0 ? ` (${doneCount}/${totalCount})` : ''}`}>
                      🤸 Drills ✓
                    </span>
                  )
                }
                if (actual) {
                  return (
                    <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium"
                      title="Drills planned but not logged as completed">
                      🤸 Drills —
                    </span>
                  )
                }
                return (
                  <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5 font-medium"
                    title="Drills scheduled for this run">
                    🤸 Drills
                  </span>
                )
              })()}
            </div>
            <div className="mt-2">
              <p className="font-medium text-base text-slate-800">{day.workout}</p>
              {day.detail && (
                <>
                  <p className={`text-sm text-slate-700 mt-1 ${descExpanded ? '' : 'line-clamp-2'}`}>{day.detail}</p>
                  {day.detail.length > 80 && (
                    <button
                      onClick={e => { e.stopPropagation(); setDescExpanded(!descExpanded) }}
                      className="text-xs text-teal-700 hover:text-teal-900 font-medium mt-0.5"
                    >
                      {descExpanded ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right column: Grade (large) + action buttons */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {gradeResult && (
              <div className="flex items-center gap-1.5">
                <span className={`text-xs leading-tight text-right max-w-[6rem] ${gradeResult.color} opacity-80`}>
                  {gradeResult.reason}
                </span>
                <div className={`${gradeResult.bgColor} rounded-lg px-2.5 py-1 flex flex-col items-center min-w-[3.25rem]`}>
                  <span className={`text-2xl font-black leading-tight ${gradeResult.color}`}>
                    {gradeResult.grade}
                  </span>
                </div>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              {onSwap && (
                <button
                  onClick={e => { e.stopPropagation(); onSwap() }}
                  className={`text-xs font-medium px-2 py-1 rounded-full transition-colors ${
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
                  className={`text-xs font-medium px-2 py-1 rounded-full transition-colors ${
                    actual
                      ? 'bg-emerald-200 text-emerald-800 hover:bg-emerald-300'
                      : 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                  }`}
                >
                  {actual ? '✏️ Edit' : '📝 Log'}
                </button>
              )}
              {statusDot}
              {day.time !== '—' && (
                <span className="text-xs text-slate-600 bg-white/60 rounded-full px-2 py-0.5">
                  {day.time}
                </span>
              )}
              <span className="text-slate-400 text-sm">›</span>
            </div>
          </div>
        </div>

        {day.zone !== '—' && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-sm text-slate-600">
            <span>📊 {day.zone}{timeEst ? ` (${timeEst} running)` : ''}</span>
            {day.route !== '—' && <span>📍 {day.route}</span>}
          </div>
        )}

        {readiness && readiness.adjustment && readiness.status !== 'GREEN' && (
          <div className={`mt-2 px-2.5 py-1.5 rounded-md text-sm ${
            readiness.status === 'YELLOW'
              ? 'bg-amber-100/60 text-amber-700'
              : 'bg-red-100/60 text-red-700'
          }`}>
            💡 {readiness.adjustment}
          </div>
        )}

        {actual && (() => {
          const targets = parsePlannedTargets(day)
          const hasTargets = targets.distanceMi !== undefined
            || targets.durationMin !== undefined
            || targets.hrLow !== undefined
          if (!hasTargets) return null
          const compliance = gradeWorkoutDay(day, targets)
          return <TargetVsActual compliance={compliance} />
        })()}

        {/* Actual data overlay — collapsible */}
        {actual && (
          <div className="mt-2 pt-2 border-t border-emerald-200/60">
            <button
              onClick={e => { e.stopPropagation(); setDetailsExpanded(!detailsExpanded) }}
              className="w-full flex items-center justify-between text-left"
            >
              <p className="text-sm font-medium text-teal-700">
                {actual.source === 'manual' || actual.type === 'Manual' ? '📝' : actual.source === 'garmin' ? '⌚ Garmin:' : '🔗 Strava:'} {actual.name}
              </p>
              <span className="text-xs text-teal-600 ml-2 shrink-0">
                {detailsExpanded ? '▴ Hide' : '▾ Details'}
              </span>
            </button>

            {/* Always-visible key stats */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-700 mt-1.5">
              {actual.distance > 0 && <span>📏 {formatMiles(actual.distance)}</span>}
              {actual.movingTime > 0 && <span>⏱ {formatSeconds(actual.movingTime)}</span>}
              {actual.avgHR && <span>❤️ {actual.avgHR} avg</span>}
              {actual.elevationGain > 0 && <span>⛰ {actual.elevationGain} ft</span>}
            </div>

            {/* Expanded details */}
            {detailsExpanded && (
              <>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-700 mt-1.5">
                  {actual.sufferScore && <span>🔥 {actual.sufferScore} effort</span>}
                  {actual.calories && <span>🔋 {actual.calories} cal</span>}
                  {actual.aerobicTE != null && <span>🫀 AE {actual.aerobicTE.toFixed(1)}</span>}
                  {actual.anaerobicTE != null && <span>⚡ AN {actual.anaerobicTE.toFixed(1)}</span>}
                  {actual.epoc != null && actual.epoc > 0 && <span>🔥 EPOC {Math.round(actual.epoc)}</span>}
                  {actual.recoveryTimeHours != null && actual.recoveryTimeHours > 0 && (
                    <span>🔄 {actual.recoveryTimeHours}h recovery</span>
                  )}
                </div>
                {actual.strengthLog && actual.strengthLog.length > 0 && (
                  <div className="mt-2 text-sm text-purple-700">
                    💪 {actual.strengthLog.length} exercise{actual.strengthLog.length > 1 ? 's' : ''}
                    {' · '}
                    {actual.strengthLog.map(ex => ex.focus).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                  </div>
                )}
                {actual.rpe && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`text-sm font-bold px-2 py-0.5 rounded ${
                      actual.rpe <= 3 ? 'bg-green-100 text-green-700'
                      : actual.rpe <= 6 ? 'bg-amber-100 text-amber-700'
                      : actual.rpe <= 8 ? 'bg-orange-100 text-orange-700'
                      : 'bg-red-100 text-red-700'
                    }`}>RPE {actual.rpe}/10</span>
                    <span className="text-xs text-slate-500">
                      {actual.rpe <= 3 ? 'Easy' : actual.rpe <= 5 ? 'Moderate' : actual.rpe <= 7 ? 'Hard' : actual.rpe <= 9 ? 'Very Hard' : 'Max'}
                    </span>
                  </div>
                )}
                {actual.notes && (
                  <p className="mt-2 text-sm text-slate-600 italic">{actual.notes}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
