import { useState, type ReactNode } from 'react'
import type { PlannedDay, ReadinessScore, CoachSnapshot, TRIMPRecord } from '../types'
import type { WeatherChip } from '../utils/weatherChip'
import { getWorkoutStyle, adaptBg } from '../utils/styles'
import { formatMiles, formatSeconds, estimateRunTime } from '../utils/format'
import { parsePlannedTargets } from '../utils/targets'
import { gradeWorkoutDay } from '../hooks/useCompliance'
import { getPlannedDrills, getDrillDay } from '../utils/drills'
import { calculateGrade } from '../utils/grading'
import { classifyRun, getSportMultiplier, calculateElevationBonus } from '../utils/trimp'
import { SPORT_LABELS } from '../hooks/useMIMCalibration'
import { generateDayCardNote } from '../utils/coachNotes'
import { useCoachInsight } from '../hooks/useCoachInsight'
import TargetVsActual from './TargetVsActual'
import CoachDayNoteView from './CoachDayNote'

interface DayCardProps {
  day: PlannedDay
  weekNum?: number
  onTap: () => void
  onLog?: () => void
  onSwap?: () => void
  /** Open the manual edit sheet for this day. */
  onEdit?: () => void
  /** True when this day has a user-applied override (vs. base plan). Used
   *  to tint the pencil button so the athlete can spot edited days. */
  hasEdit?: boolean
  isSwapSelected?: boolean
  isSwapTarget?: boolean
  readiness?: ReadinessScore
  coachEnabled?: boolean
  /** When true, this day is "today" — enables LLM insight for its card. */
  isToday?: boolean
  /** When true, this day's date is before today. Used to grade rest days
   *  the athlete correctly rested on (past + type:rest + no actual → green). */
  isPast?: boolean
  athleteId?: string
  coachSnapshot?: CoachSnapshot | null
  onAskCoach?: (seed: string) => void
  /** Canonical training-load record for the logged activity, if any.
   *  Surfaces the engine's MIM tier, elevation bonus, and adjusted load
   *  on the card so the athlete can see how the workout was credited. */
  trimpRecord?: TRIMPRecord
  /** Pre-resolved forecast for this day (parent looks up by ISO date).
   *  When present, renders a compact ☀️/🌧/⚡ + temp chip and an
   *  amber WARN / red SWAP banner under the workout title.
   *  Only future / today days carry useful weather — past days are
   *  intentionally null. */
  weatherChip?: WeatherChip | null
}

export default function DayCard({ day, weekNum, onTap, onLog, onSwap, onEdit, hasEdit, isSwapSelected, isSwapTarget, readiness, coachEnabled, isToday, isPast, athleteId, coachSnapshot, onAskCoach, trimpRecord, weatherChip }: DayCardProps) {
  const style = getWorkoutStyle(day.type)
  const actual = day.actual
  const timeEst = estimateRunTime(day.zone)
  const gradeResult = calculateGrade(day)
  const isCompleted = !!actual
  // Rest days the athlete correctly rested on (past date, no activity
  // logged) count as "completed on plan" and get the green treatment,
  // same as a logged workout. Future/today rest days stay neutral.
  const restedAsPlanned = !isCompleted && !!isPast &&
    (day.type === 'rest' || day.type === 'travel')
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const [cardCollapsed, setCardCollapsed] = useState(isCompleted)

  // When completed (or rested-as-planned), use a more saturated emerald
  // background but preserve the workout-type color as the left border
  // (visual identity stays).
  const cardBg = adaptBg(isCompleted || restedAsPlanned ? '#D1FAE5' : style.bg)

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
              <span className="font-semibold text-base text-slate-800 dark:text-white">{day.day}</span>
              {actual?.rpe && (
                <span className="text-xs bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 rounded-full px-2 py-0.5 font-medium">
                  RPE {actual.rpe}
                </span>
              )}
              {(() => {
                const runTypes = new Set(['run', 'long', 'quality', 'race'])
                if (!runTypes.has(day.type)) return null
                const plannedDrills = getPlannedDrills(day)
                const isScheduledDrillDay = weekNum !== undefined && getDrillDay(weekNum) === day.day
                if (plannedDrills.length === 0 && !isScheduledDrillDay) return null
                const items = actual?.drills?.items
                const doneCount = items?.filter(i => i.done).length ?? 0
                const totalCount = items?.length ?? plannedDrills.length
                // Item-level completion takes precedence over the `completed` flag:
                // an unchecked list with completed=true is still "partial".
                const drillPct = items && items.length > 0
                  ? doneCount / items.length
                  : (actual?.drills?.completed ? 1 : 0)
                if (drillPct >= 0.8) {
                  return (
                    <span className="text-xs bg-sky-100 text-sky-700 rounded-full px-2 py-0.5 font-medium"
                      title={`Drills done (${doneCount}/${totalCount})`}>
                      🤸 Drills ✓
                    </span>
                  )
                }
                if (actual && drillPct > 0) {
                  return (
                    <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium"
                      title={`Partial (${doneCount}/${totalCount})`}>
                      🤸 Drills {doneCount}/{totalCount}
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
                  <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full px-2 py-0.5 font-medium"
                    title="Drills scheduled for this run">
                    🤸 Drills
                  </span>
                )
              })()}
            </div>
            <div className="mt-2">
              <p className="font-medium text-base text-slate-800 dark:text-white">{day.workout}</p>
              {day.detail && !cardCollapsed && (
                <>
                  <p className={`text-sm text-slate-700 dark:text-slate-200 mt-1 ${descExpanded ? '' : 'line-clamp-2'}`}>{day.detail}</p>
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
              {/* Compact summary line when collapsed */}
              {cardCollapsed && actual && (
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 truncate">
                  {actual.distance > 0 && <span>{formatMiles(actual.distance)} · </span>}
                  {actual.movingTime > 0 && <span>{formatSeconds(actual.movingTime)}</span>}
                  {actual.avgHR ? <span> · ❤️ {actual.avgHR}</span> : null}
                </p>
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
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  ⇄
                </button>
              )}
              {onEdit && (
                <button
                  onClick={e => { e.stopPropagation(); onEdit() }}
                  className={`text-xs font-medium px-2 py-1 rounded-full transition-colors ${
                    hasEdit
                      ? 'bg-amber-200 text-amber-800 hover:bg-amber-300'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                  title={hasEdit ? 'Workout has personal edits — tap to adjust' : 'Edit this workout'}
                >
                  ✏️
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
                <span className="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800/60 rounded-full px-2 py-0.5">
                  {day.time}
                </span>
              )}
              {isCompleted && (
                <button
                  onClick={e => { e.stopPropagation(); setCardCollapsed(!cardCollapsed) }}
                  className="text-xs font-medium text-teal-700 hover:text-teal-900 px-1.5 py-1 rounded"
                  title={cardCollapsed ? 'Show details' : 'Collapse'}
                >
                  {cardCollapsed ? '▾' : '▴'}
                </button>
              )}
              <span className="text-slate-400 text-sm">›</span>
            </div>
          </div>
        </div>

        {!cardCollapsed && (day.zone !== '—' || (weatherChip && !isCompleted)) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-sm text-slate-600 dark:text-slate-300">
            {day.zone !== '—' && (
              <span>📊 {day.zone}{timeEst ? ` (${timeEst} running)` : ''}</span>
            )}
            {day.route !== '—' && <span>📍 {day.route}</span>}
            {weatherChip && !isCompleted && (
              <span
                className="inline-flex items-center gap-1"
                title={weatherChip.warningLabel || weatherChip.conditionsLabel}
              >
                <span aria-hidden>{weatherChip.icon}</span>
                {weatherChip.hourLabel && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {weatherChip.hourLabel}
                  </span>
                )}
                <span>{weatherChip.tempLabel}</span>
              </span>
            )}
          </div>
        )}

        {/* Weather alert banner — surfaces the same WARN/SWAP severity
            the coach reads from the snapshot. WARN tier is informational
            (amber); SWAP tier means a storm is forecast and the coach
            will propose an indoor swap (red). Past days get no banner
            since the weather is already-history. */}
        {!cardCollapsed && !isCompleted && weatherChip && weatherChip.accent !== 'neutral' && (
          <div
            className={`mt-2 px-2.5 py-1.5 rounded-md text-sm flex items-start gap-1.5 ${
              weatherChip.accent === 'swap'
                ? 'bg-red-100/70 text-red-800 dark:bg-red-950/40 dark:text-red-200'
                : 'bg-amber-100/70 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
            }`}
          >
            <span aria-hidden>{weatherChip.accent === 'swap' ? '🚨' : '⚠️'}</span>
            <span className="leading-snug">
              <span className="font-semibold">
                {weatherChip.accent === 'swap' ? 'Swap likely:' : 'Weather:'}
              </span>{' '}
              {weatherChip.warningLabel || weatherChip.conditionsLabel}
            </span>
          </div>
        )}

        {/* Readiness adjustment is a forward-looking recommendation
            (e.g. "consider rest", "dial back intensity"). Suppress it
            on completed workouts — by the time the day is logged, the
            advice is stale and misleading. */}
        {!cardCollapsed && !isCompleted && readiness && readiness.adjustment && readiness.status !== 'GREEN' && (
          <div className={`mt-2 px-2.5 py-1.5 rounded-md text-sm ${
            readiness.status === 'YELLOW'
              ? 'bg-amber-100/60 text-amber-700'
              : 'bg-red-100/60 text-red-700'
          }`}>
            💡 {readiness.adjustment}
          </div>
        )}

        {/* Ambient Coach inline note — Mike-only for now. Only renders
            when the coach has something worth saying. For today's card,
            also attempts to fetch an LLM-generated note. */}
        {!cardCollapsed && coachEnabled && (
          <DayCardCoachNote
            day={day}
            weekNum={weekNum}
            readiness={readiness}
            isToday={!!isToday}
            athleteId={athleteId}
            coachSnapshot={coachSnapshot}
            onAsk={onAskCoach}
          />
        )}

        {/* Target vs Actual compliance grid (renders if targets parseable & workout done) */}
        {!cardCollapsed && actual && (() => {
          const targets = parsePlannedTargets(day)
          const hasTargets = targets.distanceMi !== undefined
            || targets.durationMin !== undefined
            || targets.hrLow !== undefined
          if (!hasTargets) return null
          const compliance = gradeWorkoutDay(day, targets)
          return <TargetVsActual compliance={compliance} />
        })()}

        {/* Actual data overlay — collapsible */}
        {!cardCollapsed && actual && (
          <div className="mt-2 pt-2 border-t border-emerald-200/60">
            <button
              onClick={e => { e.stopPropagation(); setDetailsExpanded(!detailsExpanded) }}
              className="w-full flex items-center justify-between text-left"
            >
              <p className="text-sm font-medium text-teal-700">
                {/* Show a subtle source icon only. The activity name
                    stands on its own — users don't care whether it
                    came through Strava or Garmin, and the "Strava:"
                    prefix was misleading on Garmin-recorded sessions
                    that happened to ingest via Strava. */}
                {actual.source === 'manual' || actual.type === 'Manual' ? '📝 ' : '🏃 '}
                {actual.name}
              </p>
              <span className="text-xs text-teal-600 ml-2 shrink-0">
                {detailsExpanded ? '▴ Hide' : '▾ Details'}
              </span>
            </button>

            {/* Always-visible key stats */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-700 dark:text-slate-200 mt-1.5">
              {actual.distance > 0 && <span>📏 {formatMiles(actual.distance)}</span>}
              {actual.movingTime > 0 && <span>⏱ {formatSeconds(actual.movingTime)}</span>}
              {actual.avgHR && <span>❤️ {actual.avgHR} avg</span>}
              {actual.elevationGain > 0 && <span>⛰ {actual.elevationGain} ft</span>}
              {actual.elevationGain > 0 && actual.distance > 0 && (
                <span>📐 Avg Grade: {((actual.elevationGain / (actual.distance * 5280)) * 100).toFixed(1)}%</span>
              )}
              {trimpRecord && trimpRecord.adjustedTRIMP > 0 && (
                <span title={`Adjusted training load. Base ${trimpRecord.baseTRIMP} × MIM ${trimpRecord.sportMultiplier.toFixed(2)} + ${trimpRecord.elevationBonus} elev bonus.`}>
                  🎯 Load: {Math.round(trimpRecord.adjustedTRIMP)}
                </span>
              )}
            </div>
            {(() => {
              const pills: ReactNode[] = []
              const runTypes = new Set(['run', 'long', 'quality', 'race'])

              // MIM tier pill — show for every logged activity. Prefer
              // the engine's classification (trimpRecord) so the pill
              // matches what the load math actually used; fall back to
              // local classification for runs the engine hasn't scored
              // yet (e.g., manual logs without HR).
              let sportType = trimpRecord?.sportType
              if (!sportType && runTypes.has(day.type) && actual.elevationGain > 0) {
                sportType = classifyRun(
                  'running',
                  actual.elevationGain,
                  actual.distance > 0 ? actual.distance : undefined,
                )
              }
              if (sportType) {
                const mim = trimpRecord?.sportMultiplier ?? getSportMultiplier(sportType)
                const label = SPORT_LABELS[sportType] ?? sportType
                const isHigh = mim >= 1.2
                const isLow = mim < 1.0
                const cls = isHigh
                  ? 'bg-emerald-200 text-emerald-900 border-emerald-300'
                  : isLow
                  ? 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                pills.push(
                  <span
                    key="mim"
                    className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full border px-2 py-0.5 ${cls}`}
                    title={`${label}: MIM ${mim.toFixed(2)}× applied to base training load.`}
                  >
                    {label} · MIM {mim.toFixed(2)}×
                  </span>
                )
              }

              // Elevation-bonus pill — surfaces the additive +10/500ft
              // credit so the athlete sees both load contributors.
              const elevBonus = trimpRecord?.elevationBonus
                ?? (actual.elevationGain > 0 ? calculateElevationBonus(actual.elevationGain) : 0)
              if (elevBonus >= 10) {
                pills.push(
                  <span
                    key="elev"
                    className="inline-flex items-center gap-1 text-xs font-semibold rounded-full border px-2 py-0.5 bg-amber-100 text-amber-800 border-amber-200"
                    title={`Elevation bonus: +10 training load per 500 ft of gain. ${actual.elevationGain} ft → +${Math.round(elevBonus)}.`}
                  >
                    🔥 Elev Bonus +{Math.round(elevBonus)}
                  </span>
                )
              }

              if (pills.length === 0) return null
              return <div className="mt-1.5 flex flex-wrap gap-1.5">{pills}</div>
            })()}

            {/* Expanded details */}
            {detailsExpanded && (
              <>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-700 dark:text-slate-200 mt-1.5">
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
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {actual.rpe <= 3 ? 'Easy' : actual.rpe <= 5 ? 'Moderate' : actual.rpe <= 7 ? 'Hard' : actual.rpe <= 9 ? 'Very Hard' : 'Max'}
                    </span>
                  </div>
                )}
                {actual.notes && (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 italic">{actual.notes}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


// ─── DayCardCoachNote ──────────────────────────────────────────
// Small wrapper so the LLM hook is only active when rendered (we gate it
// to today's card to keep costs bounded — other cards just use the
// heuristic note).
function DayCardCoachNote({
  day,
  weekNum,
  readiness,
  isToday,
  athleteId,
  coachSnapshot,
  onAsk,
}: {
  day: PlannedDay
  weekNum?: number
  readiness?: ReadinessScore
  isToday: boolean
  athleteId?: string
  coachSnapshot?: CoachSnapshot | null
  onAsk?: (seed: string) => void
}) {
  const heuristic = generateDayCardNote(day, weekNum, readiness, weekNum === 10)
  const { insight, loading } = useCoachInsight({
    athleteId: athleteId || '',
    surface: `day_card:${day.day}`,
    snapshot: coachSnapshot ?? null,
    enabled: isToday && !!athleteId && !!coachSnapshot,
    fallbackText: heuristic?.text,
  })
  // If neither surfaces anything and we're not loading, render nothing
  if (!heuristic && !insight && !loading) return null
  return (
    <CoachDayNoteView
      note={heuristic}
      insight={isToday ? insight : null}
      loading={isToday ? loading : false}
      onAsk={onAsk}
    />
  )
}
