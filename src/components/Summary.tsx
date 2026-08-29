import { useMemo, useState } from 'react'
import type { ReadinessScore, GarminHealthData, CoachRecommendation, PerformanceMetrics, DailyTRIMP, PlannedDay, HRZone, CoachSnapshot, RaceInfo, ActualWorkout } from '../types'
import type { RiskFlag } from '../utils/readiness'
import type { SorenessLevel } from '../hooks/useSoreness'
import { getTSBState, getTSBLabel, getACWRRisk, getACWRLabel } from '../utils/performance'
import { localDateStr, formatLoadP } from '../utils/format'
import { findTrimpRecord } from '../utils/trimp'
import TodayBriefing from './TodayBriefing'
import TodayNarrativeCard from './TodayNarrativeCard'
import TRIMPBreakdown from './TRIMPBreakdown'
import WorkoutModal from './WorkoutModal'
import ManualLog from './ManualLog'
import { getWorkoutStyle, adaptBg } from '../utils/styles'
import { isEveningPreviewWindow } from '../utils/coach'
import Term from './TermGlossary'
import RaceReadinessDetailModal from './RaceReadinessDetailModal'
import { buildRaceReadinessDetail, computeRaceReadiness, type ReadinessAssignment } from '../utils/raceReadiness'
import { formatLooksLikeLine, findBestCourseMatchForPlanned } from '../utils/workoutCourseMatch'
import { weeksUntilRace } from '../utils/raceCountdown'
import { buildTrainingSignals } from '../utils/trainingSignals'
import { buildWeekNarrative } from '../utils/weekNarrative'
import PlanAtAGlance from './PlanAtAGlance'
import InsightNote from './primitives/InsightNote'
import type { PlanAdvisory } from '../types'
import { useDisplayPreferences } from '../hooks/useDisplayPreferences'

interface SummaryProps {
  athleteId: string
  todayScore: ReadinessScore | null
  weekScores: ReadinessScore[]
  todayHealth?: GarminHealthData
  healthHistory: GarminHealthData[]
  garminConnected: boolean
  coachRecommendation?: CoachRecommendation
  onCoachSwap?: (fromIndex: number, toIndex: number) => void
  dailyTrimp: DailyTRIMP[]
  performance: PerformanceMetrics[]
  todaySoreness: SorenessLevel | null
  onLogSoreness: (date: string, level: SorenessLevel) => void
  sorenessLoadByDate: Map<string, number>
  rpeByDate?: Map<string, number>
  exerciseLoadByDate?: Map<string, number>
  domsCarryByDate?: Map<string, number>
  coachEnabled?: boolean
  todayPlannedWorkout?: PlannedDay | null
  tomorrowPlannedWorkout?: PlannedDay | null
  /** Hour (0–23) at/after which the Tomorrow's-workout preview card shows.
   *  Athlete-configurable (Settings → Proactive coaching); default 8 PM. */
  cardPreviewHour?: number
  currentWeekNum?: number
  /** Bumped by Today's Verdict card when the athlete taps the ticket or
   *  Adjust — opens today's session detail without Today needing to own
   *  the modal. Same one-shot request pattern as the Engine deep-link. */
  openTodayRequest?: number
  /** Bumped by Today's readiness bubble. The full briefing is a tap deep
   *  rather than always-on: it stops competing with the verdict for the
   *  top of the page, and stops being buried when it matters. */
  openReadinessRequest?: number
  /** Full plan weeks — passed through to WorkoutModal so the strength
   *  progression display inside exercise cards has history to look up. */
  weeks?: import('../types').TrainingWeek[]
  zones?: HRZone[]
  coachSnapshot?: CoachSnapshot | null
  riskFlags?: RiskFlag[]
  /** Honest plan-level notes (feasibility, runway, goal-derived paces). */
  advisories?: PlanAdvisory[]
  /** Goal race — drives the race-ready hero card in the final ~8 weeks. */
  race?: RaceInfo
  /** The whole season — renders the multi-race overview card (countdowns,
   *  main goal, roles). Absent/single-race = no card (RaceCard covers it). */
  season?: import('../types').Season | null
  /** The athlete's goal words for the main-goal race (config.athleteGoal). */
  /** Deep link into the Plan tab's Season view, from the "how this fits"
   *  card. Absent = the card renders without the link. */
  onOpenSeason?: () => void
  /** Logs / edits a completed workout. When provided, the workout detail
   *  modals opened from Summary surface a "Log / Edit workout" pill so the
   *  athlete can log what they actually did without leaving the page —
   *  matching the Plan page's modal. */
  manualLog?: {
    logWorkout: (dayLabel: string, data: ActualWorkout, dayIso?: string | null) => void
    removeLog?: (dayLabel: string, dayIso?: string | null) => void
    logs?: Record<string, ActualWorkout>
  }
  /** Seeds the coach chat. Threaded into the workout detail modals so the
   *  coach take's "Ask →" / "Play" actions work the same as on the Plan
   *  page. */
  onAskCoach?: (seed: string) => void
  /** Share a workout journal note with the coach in the background — used by
   *  the inline journal on the workout modals and the log editor. */
  onShareNote?: (day: PlannedDay, note: string) => void | Promise<void>
}

// ─── Scale bar component ──────────────────────────────────────
// Consistent 6-segment gauge: red → orange → yellow → light green → green → darker green
// Midpoint (boundary between yellow and light green) = balanced/neutral zone

function GaugeBar({ value, min, max, labels, targetLines, zones }: {
  value: number; min: number; max: number; labels: string[]
  targetLines?: { pos: number; color: string; label?: string }[]
  zones?: string[]
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  return (
    <>
      <div className="relative mt-2.5 h-4 rounded-full overflow-hidden flex border border-slate-200 dark:border-slate-700">
        <div className="h-full bg-red-300" style={{ width: '16.67%' }} />
        <div className="h-full bg-orange-200" style={{ width: '16.67%' }} />
        <div className="h-full bg-amber-200" style={{ width: '16.67%' }} />
        <div className="h-full bg-green-200" style={{ width: '16.67%' }} />
        <div className="h-full bg-green-300" style={{ width: '16.67%' }} />
        <div className="h-full bg-emerald-400" style={{ width: '16.65%' }} />
        {targetLines?.map((t, i) => (
          <div key={i} className="absolute top-0 h-full border-l-2 border-dashed" style={{ left: `${((t.pos - min) / (max - min)) * 100}%`, borderColor: t.color }} />
        ))}
        <div
          className="absolute top-0 w-2.5 h-full bg-slate-900 rounded shadow"
          style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
        />
      </div>
      {zones && (
        <div className="flex mt-0.5">
          {zones.map((z, i) => (
            <span key={i} className="text-[10px] text-slate-400 text-center italic" style={{ width: '16.67%' }}>{z}</span>
          ))}
        </div>
      )}
      {targetLines?.some(t => t.label) && (
        <div className="relative h-3 mt-0">
          {targetLines.filter(t => t.label).map((t, i) => (
            <span key={i} className="absolute text-[10px] font-semibold" style={{ left: `${((t.pos - min) / (max - min)) * 100}%`, transform: 'translateX(-50%)', color: t.color }}>{t.label}</span>
          ))}
        </div>
      )}
      <div className={`flex justify-between text-[10px] text-slate-400 ${zones || targetLines?.some(t => t.label) ? 'mt-0' : 'mt-1'}`}>
        {labels.map((l, i) => <span key={i}>{l}</span>)}
      </div>
    </>
  )
}

// ACWR gauge: 6 equal segments, 1.0 centered in green
// blue → light blue → green → green → yellow → red

function ACWRGaugeBar({ value }: { value: number }) {
  const maxACWR = 2.0
  const pct = Math.max(0, Math.min(100, (value / maxACWR) * 100))
  return (
    <>
      <div className="relative mt-2.5 h-4 rounded-full overflow-hidden flex border border-slate-200 dark:border-slate-700">
        <div className="h-full bg-blue-300" style={{ width: '16.67%' }} />
        <div className="h-full bg-blue-200" style={{ width: '16.67%' }} />
        <div className="h-full bg-green-300" style={{ width: '16.67%' }} />
        <div className="h-full bg-green-200" style={{ width: '16.67%' }} />
        <div className="h-full bg-amber-300" style={{ width: '16.67%' }} />
        <div className="h-full bg-red-300" style={{ width: '16.65%' }} />
        <div className="absolute top-0 h-full border-l-2 border-dashed border-green-700/60" style={{ left: `${(0.8 / maxACWR) * 100}%` }} />
        <div className="absolute top-0 h-full border-l-2 border-dashed border-green-700/60" style={{ left: `${(1.3 / maxACWR) * 100}%` }} />
        <div
          className="absolute top-0 w-2.5 h-full bg-slate-900 rounded shadow"
          style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
        />
      </div>
      <div className="flex mt-0.5">
        <span className="text-[10px] text-slate-400 text-center italic" style={{ width: '16.67%' }}>Detrained</span>
        <span className="text-[10px] text-slate-400 text-center italic" style={{ width: '16.67%' }}>Under</span>
        <span className="text-[10px] text-green-600 text-center italic font-semibold" style={{ width: '33.34%' }}>Sweet Spot</span>
        <span className="text-[10px] text-slate-400 text-center italic" style={{ width: '16.67%' }}>Caution</span>
        <span className="text-[10px] text-slate-400 text-center italic" style={{ width: '16.65%' }}>Danger</span>
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-0">
        <span>0</span>
        <span>0.33</span>
        <span>0.67</span>
        <span className="font-semibold text-green-600">1.0</span>
        <span>1.33</span>
        <span>1.67</span>
        <span>2.0</span>
      </div>
    </>
  )
}

// Inline 7-day sparkline rendered as a tiny SVG
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const h = 16, w = 36
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 2) - 1}`
  ).join(' ')
  return (
    <svg width={w} height={h} className="inline-block mr-1 align-middle">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── What Changed This Week narrative ─────────────────────────

export default function Summary({
  athleteId,
  todayScore,
  weekScores,
  todayHealth,
  healthHistory,
  garminConnected,
  coachRecommendation,
  onCoachSwap,
  dailyTrimp,
  performance,
  todaySoreness,
  onLogSoreness,
  sorenessLoadByDate,
  rpeByDate,
  exerciseLoadByDate,
  domsCarryByDate,
  coachEnabled,
  todayPlannedWorkout,
  tomorrowPlannedWorkout,
  cardPreviewHour,
  currentWeekNum,
  weeks,
  openTodayRequest,
  openReadinessRequest,
  zones,
  coachSnapshot,
  riskFlags = [],
  advisories = [],
  race, season,
  onOpenSeason,
  manualLog,
  onAskCoach,
  onShareNote,
}: SummaryProps) {
  const { flags, isSectionVisible } = useDisplayPreferences(athleteId)
  const latestPerf = performance.length > 0 ? performance[performance.length - 1] : null
  const [perfOpen, setPerfOpen] = useState(false)
  const [narrativeOpen, setNarrativeOpen] = useState(true)
  const [showTodayModal, setShowTodayModal] = useState(false)

  // Today's Verdict card asks for the session detail by bumping a counter.
  // Adjusted during render rather than in an effect: the modal opens in the
  // same commit as the tap, with no extra frame where it is still closed.
  const [handledOpenRequest, setHandledOpenRequest] = useState(openTodayRequest)
  if (openTodayRequest !== handledOpenRequest) {
    setHandledOpenRequest(openTodayRequest)
    setShowTodayModal(true)
  }

  const [showReadiness, setShowReadiness] = useState(false)
  const [handledReadinessRequest, setHandledReadinessRequest] = useState(openReadinessRequest)
  if (openReadinessRequest !== handledReadinessRequest) {
    setHandledReadinessRequest(openReadinessRequest)
    setShowReadiness(true)
  }
  const [showTomorrowModal, setShowTomorrowModal] = useState(false)
  const [showRaceReadinessModal, setShowRaceReadinessModal] = useState(false)
  // Workout completion editor target — opened from the "Log / Edit workout"
  // pill in either of the workout detail modals below.
  const [logTarget, setLogTarget] = useState<{ day: PlannedDay; weekNum: number } | null>(null)
  // When the athlete taps a row in the Race Readiness modal we resolve it
  // to the underlying PlannedDay and open the daily workout card with the
  // race-readiness target attached as a banner. Single-source state — the
  // readiness modal closes while this is open so the athlete doesn't get
  // stacked sheets.
  const [readinessWorkout, setReadinessWorkout] = useState<{
    day: PlannedDay
    weekNum: number
    assignment: ReadinessAssignment
  } | null>(null)

  // Three-axis signal coherence — one object the cards (banner,
  // Performance Snapshot label, What Changed qualifier) all read from
  // so verdicts come from one place instead of each card inventing its
  // own.
  const trainingSignals = useMemo(
    () => buildTrainingSignals({
      performance: latestPerf,
      readiness: todayScore,
      sorenessLoadByDate,
    }),
    [latestPerf, todayScore, sorenessLoadByDate],
  )

  const weekNarrative = useMemo(
    () => buildWeekNarrative(performance, dailyTrimp, trainingSignals, weeks),
    [performance, dailyTrimp, trainingSignals, weeks],
  )

  // Race-ready hero is pinned to the top of Summary in the last ~8 weeks
  // before a goal race. The window is wide enough to span a full taper
  // (which begins ~2-3 weeks out) and the final build block.
  const raceReadiness = useMemo(() => {
    if (!race) return null
    const weeks = weeksUntilRace(race.date)
    if (weeks == null || weeks < 0 || weeks > 8) return null
    return computeRaceReadiness({ race, performance })
  }, [race, performance])

  // Workout-anchored detail — names specific days/workouts to change. Requires
  // weeks + currentWeekNum from the plan; without them the card falls back to
  // the generic summary.nextAction text.
  const raceReadinessDetail = useMemo(() => {
    if (!race || !raceReadiness || !weeks || weeks.length === 0) return null
    return buildRaceReadinessDetail({
      summary: raceReadiness,
      weeks,
      currentWeekNum: currentWeekNum ?? 1,
      race,
    })
  }, [race, raceReadiness, weeks, currentWeekNum])

  return (
    <div className="px-3 py-4 space-y-3">
      {/* The race countdown, the season list and the signal-coherence banner
          used to open this page. The countdown now lives once in the header,
          the season belongs to Plan, and the coherence reading is a line in
          the Verdict card rather than a full-width banner that told you your
          signals disagreed without telling you what to do about it. */}
      {/* Honest plan-level advisories (feasibility, runway, goal-derived paces).
          Shown regardless of Garmin so the athlete keeps seeing the reality of
          their plan, not just at method selection. */}
      {advisories.length > 0 && (
        <div className="space-y-2">
          {advisories.map((a) => (
            <InsightNote
              key={a.id}
              tone={a.severity === 'critical' ? 'critical' : a.severity === 'caution' ? 'warning' : 'neutral'}
              label={a.title}
            >
              {a.detail}
              {a.suggestion ? <span className="block mt-1 opacity-90">→ {a.suggestion}</span> : null}
            </InsightNote>
          ))}
        </div>
      )}
      {/* Plan-at-a-glance fills the Summary with useful, engaging context when
          there's no Garmin/readiness data to show (this week, next key session,
          phase coach note). */}
      {!garminConnected && weeks && weeks.length > 0 && (
        <PlanAtAGlance
          weeks={weeks}
          currentWeekNum={currentWeekNum ?? 1}
          todayPlannedWorkout={todayPlannedWorkout}
        />
      )}
      {race && raceReadiness && raceReadinessDetail && showRaceReadinessModal && (
        <RaceReadinessDetailModal
          race={race}
          summary={raceReadiness}
          detail={raceReadinessDetail}
          onClose={() => setShowRaceReadinessModal(false)}
          onSelectAssignment={weeks ? (weekNum, assignment) => {
            const week = weeks.find(w => w.num === weekNum)
            const day = week?.days.find(d => d.day === assignment.dayLabel)
            if (!day) return
            setShowRaceReadinessModal(false)
            setReadinessWorkout({ day, weekNum, assignment })
          } : undefined}
        />
      )}
      {readinessWorkout && (
        <WorkoutModal
          day={readinessWorkout.day}
          weekNum={readinessWorkout.weekNum}
          onClose={() => setReadinessWorkout(null)}
          zones={zones || []}
          weeks={weeks}
          latestPerf={latestPerf}
          coachSnapshot={coachSnapshot ?? undefined}
          athleteId={athleteId}
          coachEnabled={coachEnabled}
          onAskCoach={onAskCoach}
          onLog={manualLog ? () => {
            setLogTarget({ day: readinessWorkout.day, weekNum: readinessWorkout.weekNum })
            setReadinessWorkout(null)
          } : undefined}
          onSaveNote={manualLog && readinessWorkout.day.actual ? async (note) => {
            manualLog.logWorkout(readinessWorkout.day.day, { ...readinessWorkout.day.actual!, notes: note }, readinessWorkout.day.actual?.startDate?.slice(0, 10))
            await onShareNote?.(readinessWorkout.day, note)
          } : undefined}
          raceReadinessTarget={raceReadiness ? {
            gap: raceReadiness.gap,
            action: readinessWorkout.assignment.action,
            target: readinessWorkout.assignment.target,
          } : undefined}
        />
      )}
      {/* Workout completion editor — opened from the "Log / Edit workout"
          pill in the detail modals above. */}
      {logTarget && manualLog && (() => {
        const logIso = logTarget.day.actual?.startDate?.slice(0, 10)
        const hasManualEntry = Boolean(
          manualLog.logs && ((logIso && manualLog.logs[logIso]) || manualLog.logs[logTarget.day.day]),
        )
        return (
        <ManualLog
          dayLabel={logTarget.day.day}
          existing={logTarget.day.actual}
          planned={logTarget.day}
          weekNum={logTarget.weekNum}
          allWeeks={weeks}
          hasManualEntry={hasManualEntry}
          onRemove={manualLog.removeLog ? () => {
            manualLog.removeLog!(logTarget.day.day, logIso)
            setLogTarget(null)
          } : undefined}
          onSave={(data) => {
            manualLog.logWorkout(logTarget.day.day, data, logTarget.day.actual?.startDate?.slice(0, 10))
            if (data.notes?.trim()) onShareNote?.(logTarget.day, data.notes)
            setLogTarget(null)
          }}
          onClose={() => setLogTarget(null)}
        />
        )
      })()}
      {/* Tomorrow's Workout preview — evening only (athlete-configured hour) */}
      {isEveningPreviewWindow(new Date(), cardPreviewHour) && tomorrowPlannedWorkout && (() => {
        const style = getWorkoutStyle(tomorrowPlannedWorkout.type, tomorrowPlannedWorkout.workout)
        const courseMatch = findBestCourseMatchForPlanned(tomorrowPlannedWorkout, race)
        const looksLike = formatLooksLikeLine(courseMatch, "Tomorrow's")
        // Tomorrow may fall in a different plan week than today — derive its
        // week number by identity match so the detail modal's strength
        // progression lookup resolves correctly.
        const tomorrowWeekNum =
          weeks?.find(w => w.days.includes(tomorrowPlannedWorkout))?.num
          ?? currentWeekNum ?? 1
        return (
          <>
            <button
              onClick={() => setShowTomorrowModal(true)}
              className="w-full text-left rounded-xl border-2 px-3 py-2.5 transition-colors"
              style={{ borderColor: style.border, backgroundColor: adaptBg('#FFFFFF') }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Tomorrow's Workout
                  </p>
                  <p className="font-bold text-slate-800 dark:text-white mt-0.5">{tomorrowPlannedWorkout.workout}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                    {tomorrowPlannedWorkout.zone !== '—' && tomorrowPlannedWorkout.zone}
                    {tomorrowPlannedWorkout.time !== '—' && ` · ${tomorrowPlannedWorkout.time}`}
                  </p>
                  {looksLike && (
                    <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mt-1.5 flex items-start gap-1">
                      <span aria-hidden>🏔️</span>
                      <span>{looksLike}</span>
                    </p>
                  )}
                </div>
                <span className="text-2xl">{style.label}</span>
              </div>
            </button>
            {showTomorrowModal && (
              <WorkoutModal
                day={tomorrowPlannedWorkout}
                weekNum={tomorrowWeekNum}
                onClose={() => setShowTomorrowModal(false)}
                zones={zones || []}
                weeks={weeks}
                latestPerf={latestPerf}
                coachSnapshot={coachSnapshot ?? undefined}
                athleteId={athleteId}
                coachEnabled={coachEnabled}
                onAskCoach={onAskCoach}
              />
            )}
          </>
        )
      })()}

      {/* Today's Workout CTA */}
      {todayPlannedWorkout && todayPlannedWorkout.type !== 'rest' && (() => {
        const style = getWorkoutStyle(todayPlannedWorkout.type, todayPlannedWorkout.workout)
        const isCompleted = !!todayPlannedWorkout.actual
        // Course-as-protagonist projection: when today's planned workout
        // strongly matches a segment of the goal race course, surface it
        // as one line under the workout title. Returns null (renders
        // nothing) for rest days, courses we haven't curated, low-vert
        // sessions that don't map cleanly, or score below threshold.
        const courseMatch = findBestCourseMatchForPlanned(todayPlannedWorkout, race)
        const looksLike = formatLooksLikeLine(courseMatch)
        return (
          <>
            <button
              onClick={() => setShowTodayModal(true)}
              className="w-full text-left rounded-xl border-2 px-3 py-2.5 transition-colors"
              style={{ borderColor: style.border, backgroundColor: adaptBg(isCompleted ? style.bg : '#FFFFFF') }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    {isCompleted ? 'Completed' : "Today's Workout"}
                  </p>
                  <p className="font-bold text-slate-800 dark:text-white mt-0.5">{todayPlannedWorkout.workout}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                    {todayPlannedWorkout.zone !== '—' && todayPlannedWorkout.zone}
                    {todayPlannedWorkout.time !== '—' && ` · ${todayPlannedWorkout.time}`}
                  </p>
                  {looksLike && (
                    <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mt-1.5 flex items-start gap-1">
                      <span aria-hidden>🏔️</span>
                      <span>{looksLike}</span>
                    </p>
                  )}
                </div>
                <span className="text-2xl">{style.label}</span>
              </div>
            </button>
            {showTodayModal && (
              <WorkoutModal
                day={todayPlannedWorkout}
                weekNum={currentWeekNum ?? 1}
                onClose={() => setShowTodayModal(false)}
                zones={zones || []}
                weeks={weeks}
                readiness={todayScore ?? undefined}
                latestPerf={latestPerf}
                coachSnapshot={coachSnapshot ?? undefined}
                athleteId={athleteId}
                coachEnabled={coachEnabled}
                onAskCoach={onAskCoach}
                onLog={manualLog ? () => {
                  setLogTarget({ day: todayPlannedWorkout, weekNum: currentWeekNum ?? 1 })
                  setShowTodayModal(false)
                } : undefined}
                onSaveNote={manualLog && todayPlannedWorkout.actual ? async (note) => {
                  manualLog.logWorkout(todayPlannedWorkout.day, { ...todayPlannedWorkout.actual!, notes: note }, todayPlannedWorkout.actual?.startDate?.slice(0, 10))
                  await onShareNote?.(todayPlannedWorkout, note)
                } : undefined}
                trimpRecord={findTrimpRecord(
                  dailyTrimp,
                  localDateStr(),
                  todayPlannedWorkout.actual?.name,
                )}
              />
            )}
          </>
        )
      })()}

      {/* Why today matters — the plan's intent, in the athlete's own arc.
          Renders on rest days too (the CTA above hides those), because
          "today is rest and it counts" is exactly when people need it. */}
      <TodayNarrativeCard
        day={todayPlannedWorkout}
        weeks={weeks}
        currentWeekNum={currentWeekNum}
        race={race}
        season={season}
        onOpenSeason={onOpenSeason}
      />

      {/* The daily briefing, one tap behind Today's readiness bubble. */}
      {showReadiness && garminConnected && todayScore && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowReadiness(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full sm:max-w-lg max-h-[85vh] overflow-y-auto bg-slate-50 dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl p-3 pb-8"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Readiness detail"
            data-testid="readiness-sheet"
          >
            <div className="w-9 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto mb-3" />
            <TodayBriefing
              todayScore={todayScore}
              todayHealth={todayHealth}
              healthHistory={healthHistory}
              coachRecommendation={coachRecommendation}
              onCoachSwap={onCoachSwap}
              performance={performance}
              dailyTrimp={dailyTrimp}
              todaySoreness={todaySoreness}
              onLogSoreness={onLogSoreness}
            />
            <button
              onClick={() => setShowReadiness(false)}
              className="mt-3 w-full h-11 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* The briefing itself is now behind the bubble. What stays inline is
          only the page explaining why there is no verdict yet — that is not
          depth to go and find, it is the answer. */}
      {garminConnected && !todayScore && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
          <p className="text-base font-semibold text-slate-700 dark:text-slate-200">Readiness</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Syncing your watch — the readiness score appears once the first sync completes.
          </p>
        </div>
      )}
      {!garminConnected && (
        <p className="text-xs text-center text-slate-400 dark:text-slate-500 px-3">
          📡 Connect a watch — Garmin or Apple — in Settings to add daily readiness scoring.
        </p>
      )}

      {/* Forward-looking risk alerts — only renders when active flags present */}
      {riskFlags.length > 0 && <SummaryRiskFlags flags={riskFlags} />}

      {/* Quick performance snapshot with scale bars */}
      {latestPerf && isSectionVisible('summary.perfSnapshot') && (() => {
        const tsbState = getTSBState(latestPerf.tsb)
        const acwrRisk = getACWRRisk(latestPerf.acwr)
        // CTL labels: coaching convention (Coggan/Allen 2010, TrainingPeaks).
        // Approximate ranges for recreational-to-competitive endurance athletes.
        const fitnessLabel = latestPerf.ctl < 20 ? 'Building'
          : latestPerf.ctl < 40 ? 'Moderate'
          : latestPerf.ctl < 60 ? 'Strong'
          : latestPerf.ctl < 80 ? 'High'
          : 'Elite'
        // ATL labels: relative to CTL (more meaningful than absolute thresholds).
        // ATL > 1.5× CTL indicates acute overload beyond chronic capacity.
        const fatigueLabel = latestPerf.atl > latestPerf.ctl * 1.5 ? 'Very High'
          : latestPerf.atl > latestPerf.ctl ? 'Elevated'
          : latestPerf.atl > latestPerf.ctl * 0.8 ? 'Balanced'
          : 'Low'
        const last7 = performance.slice(-7)
        const ctlSpark = last7.map(p => p.ctl)
        const atlSpark = last7.map(p => p.atl)
        const tsbSpark = last7.map(p => p.tsb)
        const acwrSpark = last7.map(p => p.acwr)
        return (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
            <button
              onClick={() => flags.showAdvancedMetrics && setPerfOpen(!perfOpen)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-slate-700 dark:text-slate-200">Performance Snapshot</p>
                {!perfOpen && (
                  <>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      {fitnessLabel} fitness · {fatigueLabel} fatigue · {latestPerf.tsb >= 5 ? 'Fresh' : latestPerf.tsb >= -10 ? 'Balanced' : latestPerf.tsb >= -25 ? 'Tired' : 'Deep fatigue'}
                      {trainingSignals.damage.severity >= 2 && (
                        <span className="text-amber-600 dark:text-amber-400 font-medium"> · soreness flagged</span>
                      )}
                    </p>
                    <p className="text-[10px] italic text-slate-400 mt-0.5">
                      Chronic load view · 42d / 7d window
                    </p>
                  </>
                )}
                {perfOpen && <p className="text-xs text-slate-400 mt-0.5">Garmin EPOC · 42d / 7d EWMA · doesn't include today's biometrics</p>}
              </div>
              {flags.showAdvancedMetrics && (
                <span className="text-sm text-teal-600 ml-2 shrink-0">{perfOpen ? '▴ Hide' : '▾ Details'}</span>
              )}
            </button>
            {perfOpen && flags.showAdvancedMetrics && (
            <div className="px-4 pb-4 space-y-5">
              {/* Fitness (CTL) — 0-100 scale, 6 equal segments, midpoint at 50 */}
              <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl font-bold text-blue-700">{formatLoadP(latestPerf.ctl, flags.numericPrecision)}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">/ 100</span>
                  </div>
                  <p className="text-xs text-blue-600 font-semibold"><Sparkline data={ctlSpark} color="#2563eb" />{fitnessLabel}</p>
                </div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300"><Term name="ctl" athleteId={athleteId} /> <span className="text-slate-400 font-normal">— 42-day training base</span></p>
                <p className="text-[11px] text-slate-400 mt-0.5 italic">Cardiovascular + musculoskeletal load · EPOC + MIM + DOMS + soreness</p>
                <GaugeBar
                  value={latestPerf.ctl}
                  min={0} max={100}
                  labels={['0', '17', '33', '50', '67', '83', '100']}
                  zones={['Untrained', 'Beginner', 'Recreational', 'Trained', 'Competitive', 'Elite']}
                />
              </div>

              {/* Fatigue (ATL) — flipped: 120→0, high fatigue on left */}
              <div className="bg-red-50 dark:bg-red-950 rounded-lg p-4">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl font-bold text-red-600">{formatLoadP(latestPerf.atl, flags.numericPrecision)}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">vs fitness {formatLoadP(latestPerf.ctl, flags.numericPrecision)}</span>
                  </div>
                  <p className="text-xs text-red-500 font-semibold"><Sparkline data={atlSpark} color="#ef4444" />{fatigueLabel}</p>
                </div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300"><Term name="atl" athleteId={athleteId} /> <span className="text-slate-400 font-normal">— 7-day recent load</span></p>
                <p className="text-[11px] text-slate-400 mt-0.5 italic">Includes DOMS carry-over + perceived soreness from check-in</p>
                <GaugeBar
                  value={100 - latestPerf.atl}
                  min={0} max={100}
                  labels={['100', '83', '67', '50', '33', '17', '0']}
                  zones={['Overload', 'Very High', 'High', 'Moderate', 'Balanced', 'Fresh']}
                  targetLines={[
                    { pos: 100 - latestPerf.ctl * 1.3, color: 'rgba(139,92,246,0.7)', label: '1.3×' },
                    { pos: 100 - latestPerf.ctl * 0.8, color: 'rgba(139,92,246,0.7)', label: '0.8×' },
                  ]}
                />
              </div>

              {/* Recovery Balance (TSB) — -30 to +25 */}
              <div className={`rounded-lg p-4 ${
                tsbState === 'peaked' || tsbState === 'well_rested' ? 'bg-green-50 dark:bg-green-950'
                : tsbState === 'productive' ? 'bg-slate-50 dark:bg-slate-900'
                : 'bg-amber-50 dark:bg-amber-950'
              }`}>
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className={`text-2xl font-bold ${
                      latestPerf.tsb >= 5 ? 'text-green-700'
                      : latestPerf.tsb >= -10 ? 'text-slate-700 dark:text-slate-200'
                      : 'text-amber-700'
                    }`}>{latestPerf.tsb >= 0 ? '+' : ''}{formatLoadP(latestPerf.tsb, flags.numericPrecision)}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">range: -30 to +25</span>
                  </div>
                  <p className={`text-xs font-semibold ${
                    latestPerf.tsb >= 5 ? 'text-green-600'
                    : latestPerf.tsb >= -10 ? 'text-slate-500 dark:text-slate-400'
                    : 'text-amber-600'
                  }`}><Sparkline data={tsbSpark} color="#059669" />{getTSBLabel(tsbState)}</p>
                </div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300"><Term name="tsb" athleteId={athleteId}>Recovery Balance</Term> <span className="text-slate-400 font-normal">— are you fresh or fatigued?</span></p>
                <p className="text-[11px] text-slate-400 mt-0.5 italic">Fitness minus Fatigue · negative = cardio + muscle fatigue exceeds base</p>
                <GaugeBar
                  value={latestPerf.tsb + 30}
                  min={0} max={55}
                  labels={['-30', '-21', '-12', '-2', '+7', '+16', '+25']}
                  zones={['Deep fatigue', 'Overreach', 'Productive', 'Balanced', 'Fresh', 'Race ready']}
                  targetLines={[
                    { pos: -30 + 30, color: 'rgba(59,130,246,0.7)', label: 'Training ▸' },
                    { pos: -10 + 30, color: 'rgba(59,130,246,0.7)', label: '◂' },
                    { pos: 5 + 30, color: 'rgba(5,150,105,0.7)', label: 'Race ▸' },
                    { pos: 25 + 30, color: 'rgba(5,150,105,0.7)', label: '◂' },
                  ]}
                />
              </div>

              {/* ACWR — 5-segment: blue, light blue, green, yellow, red */}
              <div className={`rounded-lg p-4 ${
                acwrRisk === 'sweet_spot' ? 'bg-green-50 dark:bg-green-950'
                : acwrRisk === 'high_risk' ? 'bg-red-50 dark:bg-red-950'
                : 'bg-amber-50 dark:bg-amber-950'
              }`}>
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className={`text-2xl font-bold ${
                      acwrRisk === 'sweet_spot' ? 'text-green-700'
                      : acwrRisk === 'high_risk' ? 'text-red-600'
                      : 'text-amber-600'
                    }`}>{latestPerf.acwr.toFixed(flags.numericPrecision === 'low' ? 1 : 2)}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">sweet spot: 0.8–1.3</span>
                  </div>
                  <p className={`text-xs font-semibold ${
                    acwrRisk === 'sweet_spot' ? 'text-green-600'
                    : acwrRisk === 'high_risk' ? 'text-red-500'
                    : 'text-amber-600'
                  }`}><Sparkline data={acwrSpark} color="#d97706" />{getACWRLabel(acwrRisk)}</p>
                </div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300"><Term name="acwr" athleteId={athleteId}>Load Ratio</Term> <span className="text-slate-400 font-normal">— acute vs chronic workload</span></p>
                <p className="text-[11px] text-slate-400 mt-0.5 italic">How fast you're ramping · includes all load: cardio, strength, DOMS, soreness</p>
                <ACWRGaugeBar value={latestPerf.acwr} />
              </div>
            </div>
            )}
          </div>
        )
      })()}

      {/* What Changed This Week */}
      {weekNarrative.length > 0 && isSectionVisible('summary.whatChanged') && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
          <button
            onClick={() => setNarrativeOpen(!narrativeOpen)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-slate-700 dark:text-slate-200">What Changed This Week</p>
              <p className="text-[10px] italic text-slate-400 mt-0.5">Week-over-week direction</p>
            </div>
            <span className="text-sm text-teal-600 ml-2 shrink-0">{narrativeOpen ? '▴ Hide' : '▾ Show'}</span>
          </button>
          {narrativeOpen && (
            <div className="px-4 pb-4 space-y-1.5">
              {weekNarrative.map((line, i) => (
                <p key={i} className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{line}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 7-day training load */}
      {dailyTrimp.length > 0 && isSectionVisible('summary.trainingLoad') && (
        <TRIMPBreakdown
          dailyTrimp={dailyTrimp}
          sorenessLoadByDate={sorenessLoadByDate}
          rpeByDate={rpeByDate}
          exerciseLoadByDate={exerciseLoadByDate}
          domsCarryByDate={domsCarryByDate}
          performance={performance}
          athleteId={athleteId}
        />
      )}

      {/* Week readiness trend */}
      {weekScores.length > 1 && isSectionVisible('summary.readinessTrend') && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
          <p className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-2">This Week's Readiness</p>
          <div className="flex gap-1">
            {weekScores.slice(-7).map((score, i) => {
              const dotColor =
                score.status === 'PEAK' ? 'bg-indigo-500'
                : score.status === 'GREEN' ? 'bg-green-500'
                : score.status === 'YELLOW' ? 'bg-amber-400'
                : 'bg-red-500'
              return (
                <div key={i} className="flex-1 text-center">
                  <div className={`w-4 h-4 rounded-full ${dotColor} mx-auto mb-1`} />
                  <p className="text-xs text-slate-500 dark:text-slate-400">{score.date.slice(5)}</p>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{score.displayScore}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryRiskFlags({ flags }: { flags: RiskFlag[] }) {
  const alerts = flags.filter(f => f.severity === 'alert')
  const warnings = flags.filter(f => f.severity === 'warning')
  const bgClass = alerts.length > 0
    ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900'
    : 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900'
  const icon = alerts.length > 0 ? '🚨' : '⚠️'
  const title = alerts.length > 0 ? 'Injury Risk Alert' : 'Heads up'
  return (
    <div className={`rounded-xl p-3 border ${bgClass}`}>
      <div className="mb-2">
        <p className="text-sm font-bold text-slate-800 dark:text-white">{icon} {title}</p>
        <p className="text-[10px] italic text-slate-500 dark:text-slate-400">Local muscular damage</p>
      </div>
      <div className="space-y-2">
        {[...alerts, ...warnings].map(f => (
          <div key={f.id} className="bg-white/60 dark:bg-slate-900/40 rounded-lg p-2">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{f.title}</p>
              {f.metric && (
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{f.metric}</span>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug">{f.message}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
