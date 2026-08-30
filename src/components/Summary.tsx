import { useMemo, useState } from 'react'
import type { ReadinessScore, GarminHealthData, CoachRecommendation, PerformanceMetrics, DailyTRIMP, PlannedDay, HRZone, CoachSnapshot, RaceInfo, ActualWorkout } from '../types'
import type { RiskFlag } from '../utils/readiness'
import type { SorenessLevel } from '../hooks/useSoreness'
import TodayBriefing from './TodayBriefing'
import TodayNarrativeCard from './TodayNarrativeCard'
import WorkoutModal from './WorkoutModal'
import ManualLog from './ManualLog'
import RaceReadinessDetailModal from './RaceReadinessDetailModal'
import { buildRaceReadinessDetail, computeRaceReadiness, type ReadinessAssignment } from '../utils/raceReadiness'
import { weeksUntilRace } from '../utils/raceCountdown'
import { buildTrainingSignals } from '../utils/trainingSignals'
import { buildWeekNarrative } from '../utils/weekNarrative'
import PlanAtAGlance from './PlanAtAGlance'
import InsightNote from './primitives/InsightNote'
import type { PlanAdvisory } from '../types'
import { useDisplayPreferences } from '../hooks/useDisplayPreferences'
import { findTrimpRecord } from '../utils/trimp'
import { localDateStr } from '../utils/format'

interface SummaryProps {
  athleteId: string
  todayScore: ReadinessScore | null
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
  coachEnabled?: boolean
  todayPlannedWorkout?: PlannedDay | null
  /** Hour (0–23) at/after which the Tomorrow's-workout preview card shows.
   *  Athlete-configurable (Settings → Proactive coaching); default 8 PM. */
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

// ACWR gauge: 6 equal segments, 1.0 centered in green
// blue → light blue → green → green → yellow → red

// Inline 7-day sparkline rendered as a tiny SVG
// ─── What Changed This Week narrative ─────────────────────────

export default function Summary({
  athleteId,
  todayScore,
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
  coachEnabled,
  todayPlannedWorkout,
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
  const { isSectionVisible } = useDisplayPreferences(athleteId)
  const latestPerf = performance.length > 0 ? performance[performance.length - 1] : null
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
      {/* Plan-at-a-glance fills Today with useful, engaging context when
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
      {/* Today's session detail — opened from the Verdict card's ticket and
          from Adjust. The CTA button that used to sit here is gone: the
          ticket on the Verdict card is the same session, and rendering it
          twice was the pile this redesign exists to remove. The modal
          itself stays — it is the door, not the duplicate. */}
      {showTodayModal && todayPlannedWorkout && (
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
