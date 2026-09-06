import { useState, useRef, useEffect, useMemo } from 'react'
import type { TrainingWeek, PlannedDay, ActualWorkout, HRZone, ReadinessScore, PerformanceMetrics, CoachSnapshot, RaceInfo, DailyTRIMP, Season, TrainingPlan, PlanAdvisory } from '../types'
import { findTrimpRecord } from '../utils/trimp'
import type { WeekCompliance } from '../hooks/useCompliance'
import type { InjuryStatus, StrengthExperience, OnboardingConfig } from '../hooks/useOnboarding'
import type { TrainingMethod } from '../types/training-method'
import { getWorkoutStyle, adaptBg } from '../utils/styles'
import { buildWeatherChipForDate } from '../utils/weatherChip'
import { dayIsoInWeek, todayDateString, isoFromLocalDate } from '../utils/planDates'
import { formatWeekMilesChip, formatWeekMilesHeader } from '../utils/format'
import { BLOCK_STYLE } from '../utils/blockStyles'
import { pushWeekToGarmin, collectPushableDays } from '../utils/garminRepush'
import { isGarminConnected, GarminAuthError, GARMIN_SIGN_IN_REQUIRED } from '../utils/garmin'
import { isGymBasedDay } from '../utils/matching'
import { isSimDay } from '../utils/simSession'
import { weeksWithPriorLogs } from '../utils/strengthHistory'
import HyroxProjectionCard from './HyroxProjectionCard'
import { loadDraft } from '../utils/liveSession'
import LiveSessionPlayer from './LiveSessionPlayer'
import DayCard from './DayCard'
import RacePacingCard from './RacePacingCard'
import type { RacePacingPlan } from '../engines/racePacing'
import WorkoutModal from './WorkoutModal'
import ManualLog from './ManualLog'
import WorkoutEditor, { type WorkoutEdits } from './WorkoutEditor'
import MissedDaySheet from './MissedDaySheet'
import { moveOutcomeFor } from '../engines/planGenerator/replan'
import type { ReplanKind } from '../engines/planGenerator/replanLog'
import { weekCompliance, shouldSuggestRegeneration } from '../engines/planGenerator/replan'
import RaceNarrative from './RaceNarrative'
import RaceElevationProfile from './RaceElevationProfile'
import SeasonOverview from './SeasonOverview'
import RaceCard from './RaceCard'
import PlanNotesPanel from './PlanNotesPanel'
import TravelModePanel from './TravelModePanel'
import type { TravelWindow, TravelDeclaration } from '../engines/planGenerator/travelMode'
import SeasonRacesCard from './SeasonRacesCard'
import StrengthBenchmarkSheet from './StrengthBenchmarkSheet'
import type { StrengthCapacity } from '../engines/strength/benchmark'
import { capacitySummary, isStale } from '../engines/strength/benchmark'

/** "10/24" from an ISO date (noon-anchored — never a day off). */
function fmtIsoShort(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** Whole days from today to an ISO date (0 floor). */
function daysUntilIso(iso: string): number {
  const ms = new Date(`${iso}T12:00:00`).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

interface WeeklyPlanProps {
  weeks: TrainingWeek[]
  /** P14: the plan's honest advisories, which used to stack on Today. */
  planNotes?: PlanAdvisory[]
  /** Bumped by Today's notes row so the panel opens on arrival. */
  planNotesOpenRequest?: number
  /** The season's MAIN GOAL race (from the explicit capture). Shown as a
   *  persistent one-liner on weeks that build toward a DIFFERENT race, so
   *  a stepping-stone block still answers "what is all this for". */
  primaryRace?: { name: string; dateIso: string } | null
  zones?: HRZone[]
  manualLog?: {
    logWorkout: (dayLabel: string, data: ActualWorkout, dayIso?: string | null) => void
    removeLog?: (dayLabel: string, dayIso?: string | null) => void
    /** The raw ISO-keyed log map — lets strength history include logs
     *  from previous plans (they survive rebuilds; plan days don't). */
    logs?: Record<string, ActualWorkout>
  }
  daySwap?: {
    swapDays: (weekNum: number, fromIndex: number, toIndex: number) => void
    resetWeek: (weekNum: number) => void
    hasSwaps: (weekNum: number) => boolean
  }
  planEdit?: {
    editDay: (weekNum: number, dayIndex: number, updates: WorkoutEdits) => void
    revertDay: (weekNum: number, dayIndex: number) => void
    hasEdit: (weekNum: number, dayIndex: number) => boolean
  }
  /** Travel mode — declare a trip once and let the plan adapt around it as
   *  one undoable batch. Absent for read-only surfaces (the panel simply
   *  doesn't render). */
  travel?: {
    windows: TravelWindow[]
    onActivate: (decl: TravelDeclaration) => void
    onDeactivate: (window: TravelWindow) => void
  }
  /** P12 — toggle a day's lock (pin). Absent on read-only surfaces (the
   *  lock affordance doesn't render). Takes the day's ISO date. */
  onToggleLock?: (dateIso: string) => void
  /** Phase 5 (PRD-110) — missed-workout replanning. Absent for read-only
   *  surfaces; the "Missed?" affordance simply doesn't render. */
  replan?: {
    apply: (kind: ReplanKind, dateIso: string) => void
    undoFor: (dateIso: string) => void
    hasReplan: (dateIso: string) => boolean
  }
  /** Rebuild the remainder of the plan from where the athlete actually is
   *  (Rule 3). Wired to the redo-onboarding flow, which already carries
   *  the previous answers and history-derived mileage. */
  onRebuildPlan?: () => void
  weekReadiness?: ReadinessScore[]
  athleteId?: string
  coachEnabled?: boolean
  latestPerf?: PerformanceMetrics | null
  coachSnapshot?: CoachSnapshot | null
  onAskCoach?: (seed: string) => void
  /** Share a workout journal note with the coach in the background. Used by
   *  the inline journal on the workout modal and to auto-seed a coach turn
   *  when the log editor's notes change. */
  onShareNote?: (day: PlannedDay, note: string) => void | Promise<void>
  race?: RaceInfo
  compliance?: WeekCompliance[]
  dailyTrimp?: DailyTRIMP[]
  /** Athlete's injury status — drives the return-from-injury ramp note on
   *  workout cards. */
  injuryStatus?: InjuryStatus
  /** Athlete's lifting background — calibrates default strength loads shown
   *  in the workout modal. */
  strengthLevel?: StrengthExperience
  /** G6 — per-segment pace bands + fueling checkpoints for curated courses.
   *  Null for unmatched courses (the guard: no card renders). */
  racePacing?: RacePacingPlan | null
  /** Full season — the Race tab narrative names the main goal and this
   *  race's role for multi-race athletes. */
  season?: Season | null
  /** Race-readiness gauge for the countdown card (moved off Today). */
  raceReadiness?: React.ComponentProps<typeof RaceCard>['readiness']
  /** The athlete's stated goal, shown with the season race list. */
  primaryGoalText?: string
  /** The whole plan + its method/config — the Season sub-view explains the
   *  block structure and (folded) the methodology behind it. Absent for
   *  hand-authored seed plans, which simply don't offer the tab. */
  plan?: TrainingPlan
  method?: TrainingMethod
  onboardingConfig?: OnboardingConfig
  /** One-shot deep link from another tab ("See the whole season →").
   *  WeeklyPlan owns its own view state, so the parent asks rather than
   *  controls. Pass a FRESH object per request — identity is what marks a
   *  request as new, so tapping the link twice works even though the mode
   *  didn't change, and the athlete's own toggles are never fought by a
   *  stale value. */
  requestView?: { mode: 'list' | 'calendar' | 'race' | 'season' } | null
  /** Re-weight the plan around a proven weak station (Phase 3b): writes
   *  config.weakStation non-destructively so the generator's existing
   *  weak-station bias picks it up on the next derive. Wired from App's
   *  onboarding instance — the one the plan actually derives from. */
  onReweightPlan?: (station: string) => void
  /** Measured strength capacity + the writer for a benchmark session.
   *  Absent = the benchmark day still renders, it just can't be logged
   *  (seed athletes, or a plan opened before the feature existed). */
  strength?: {
    capacity: StrengthCapacity | null
    save: (c: StrengthCapacity) => void
    /** 'hyrox' picks up the race-specific tests; 'general' skips them. */
    kind: 'hyrox' | 'general'
  }
}


export default function WeeklyPlan({
  weeks, primaryRace,
  planNotes = [],
  planNotesOpenRequest = 0,
  zones,
  manualLog,
  daySwap,
  planEdit,
  travel,
  onToggleLock,
  replan,
  onRebuildPlan,
  weekReadiness = [],
  athleteId,
  coachEnabled,
  latestPerf,
  coachSnapshot,
  onAskCoach,
  onShareNote,
  race,
  compliance,
  dailyTrimp,
  injuryStatus,
  strengthLevel,
  racePacing,
  season,
  raceReadiness,
  primaryGoalText,
  plan,
  method,
  onboardingConfig,
  requestView,
  onReweightPlan,
  strength,
}: WeeklyPlanProps) {
  const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'race' | 'season'>('list')
  const [activeWeek, setActiveWeek] = useState(0)
  // The modal carries the tapped day's OWNING week — the calendar renders
  // days from every week, so deriving the week from the pager index sent
  // a November tap to the modal as "Wk 3" (wrong coaching phase, wrong
  // race context, an August drills tip, wrong readiness/TRIMP lookups).
  const [modalDay, setModalDay] = useState<{ day: PlannedDay; week: TrainingWeek } | null>(null)
  const [logDay, setLogDay] = useState<PlannedDay | null>(null)
  // Live-session player (Phase 2): open for a specific day, or with no
  // day to resume a crash-saved draft. Recomputing the draft flag when
  // the player closes keeps the resume banner honest.
  const [liveOpen, setLiveOpen] = useState<{ day?: PlannedDay; iso?: string } | null>(null)
  const hasLiveDraft = useMemo(
    () => liveOpen == null && loadDraft(athleteId) != null,
    [athleteId, liveOpen],
  )
  // Strength history that survives plan rebuilds (synthetic week 0 of
  // prior-plan logs) — feeds progression/ghost-fill in the log editor,
  // the live player, and the workout modal. Rendering still uses `weeks`.
  const historyWeeks = useMemo(
    () => weeksWithPriorLogs(weeks, manualLog?.logs),
    [weeks, manualLog?.logs],
  )
  const [editDay, setEditDay] = useState<{ day: PlannedDay; index: number } | null>(null)
  const [missedDay, setMissedDay] = useState<{ day: PlannedDay; iso: string } | null>(null)
  const [benchmarkOpen, setBenchmarkOpen] = useState(false)
  const [swapSource, setSwapSource] = useState<number | null>(null)
  const [calMonth, setCalMonth] = useState(() => {
    // Start on current month
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  // Adjust state during render when the request prop changes — React's
  // documented pattern for deriving state from props, and cheaper than an
  // effect (no second commit, no flash of the previous view).
  const [seenRequest, setSeenRequest] = useState(requestView)
  if (requestView !== seenRequest) {
    setSeenRequest(requestView)
    if (requestView) setViewMode(requestView.mode)
  }

  const scrollRef = useRef<HTMLDivElement>(null)
  const week = weeks[activeWeek]

  // ── Send-week-to-watch (G2a): batch push every pushable future day of
  // the visible week. Offered only when Garmin is connected and the week
  // still has something sendable; per-day buttons on the cards remain.
  const [weekPushStatus, setWeekPushStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [weekPushMsg, setWeekPushMsg] = useState<string | null>(null)
  const weekPushableCount = useMemo(
    () => (week ? collectPushableDays([week]).length : 0),
    [week],
  )
  const canPushWeek = weekPushableCount > 0 && isGarminConnected(athleteId)

  // ── Phase 5 (110-F5): the two-consecutive-short-weeks signal. Read off
  // the weeks that have actually FINISHED — a week in progress is short
  // by definition and must never trigger the suggestion. Two in a row
  // under 70% means the plan no longer describes this athlete's life,
  // and rebuilding from where they are beats limping through a plan
  // written for someone else.
  const suggestRebuild = useMemo(() => {
    if (!onRebuildPlan || !compliance) return false
    const today = todayDateString()
    const finished = weeks
      .filter(w => {
        if (!w.startIso) return false
        const end = new Date(`${w.startIso}T12:00:00`)
        end.setDate(end.getDate() + w.days.length)
        return isoFromLocalDate(end) <= today
      })
      .map(w => compliance.find(c => c.weekNum === w.num))
      .filter((c): c is WeekCompliance => !!c && c.plannedMiles > 0)
    return shouldSuggestRegeneration(finished.map(c => weekCompliance(c.plannedMiles, c.actualMiles)))
  }, [weeks, compliance, onRebuildPlan])

  async function handlePushWeek() {
    if (!week) return
    setWeekPushStatus('sending')
    setWeekPushMsg(null)
    try {
      const result = await pushWeekToGarmin(week, athleteId)
      if (result.failed === 0) {
        setWeekPushStatus('sent')
        setWeekPushMsg(`${result.sent} workout${result.sent === 1 ? '' : 's'} sent — syncs to your watch on next Garmin sync.`)
      } else {
        setWeekPushStatus('error')
        setWeekPushMsg(`${result.sent} sent, ${result.failed} failed — ${result.errors[0] ?? 'try again.'}`)
      }
    } catch (err) {
      setWeekPushStatus('error')
      // An app-session 401 must keep its message: "reconnect in Settings"
      // would send the athlete to retype a Garmin password that was never
      // the problem.
      setWeekPushMsg(
        err instanceof GarminAuthError
          ? (err.message === GARMIN_SIGN_IN_REQUIRED
              ? GARMIN_SIGN_IN_REQUIRED
              : 'Garmin disconnected — reconnect in Settings, then try again.')
          : err instanceof Error ? err.message : 'Could not send week to watch.',
      )
    }
  }

  // Reset the push status when the athlete flips to another week.
  useEffect(() => {
    setWeekPushStatus('idle')
    setWeekPushMsg(null)
  }, [activeWeek])

  // Build a date→PlannedDay lookup for the calendar
  const daysByDate = useMemo(() => {
    const map = new Map<string, PlannedDay>()
    for (const w of weeks) {
      for (const d of w.days) {
        const iso = dayIsoInWeek(d.day, w, todayDateString())
        if (iso) map.set(iso, d)
      }
    }
    return map
  }, [weeks])

  // Season strip segments: consecutive weeks sharing the same target race +
  // block kind collapse into one tappable chip ("Build → Hyrox - Anaheim").
  // Anchor weeks (no seasonRace stamp) form the leading segment.
  const seasonSegments = useMemo(() => {
    const segs: { label: string; title: string; bg: string; firstIndex: number; count: number }[] = []
    weeks.forEach((w, i) => {
      const sr = w.seasonRace
      const label = sr ? `${BLOCK_STYLE[sr.blockKind].label} → ${sr.name}` : 'Race plan'
      const bg = sr ? BLOCK_STYLE[sr.blockKind].bg : 'bg-slate-700'
      const title = sr ? `${BLOCK_STYLE[sr.blockKind].label} block toward ${sr.name}` : 'Your main race build'
      const prev = segs[segs.length - 1]
      if (prev && prev.label === label) prev.count++
      else segs.push({ label, title, bg, firstIndex: i, count: 1 })
    })
    return segs
  }, [weeks])

  useEffect(() => {
    if (scrollRef.current) {
      const activeBtn = scrollRef.current.children[activeWeek] as HTMLElement
      activeBtn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [activeWeek])

  // Resolve the week a tapped day actually belongs to (identity match —
  // the calendar and list both render days straight from `weeks`), falling
  // back to the pager week for defensive safety.
  function openDayModal(d: PlannedDay) {
    const owning = weeks.find(w => w.days.includes(d)) ?? week
    setModalDay({ day: d, week: owning })
  }

  // Tap-to-swap: first tap selects source, second tap selects target
  function handleSwapTap(index: number) {
    // A pinned day is fixed — it can't be a swap source or a swap target.
    if (week.days[index]?.locked) return
    if (swapSource === null) {
      setSwapSource(index)
    } else if (swapSource === index) {
      // Tapped same card — cancel
      setSwapSource(null)
    } else {
      // Swap and clear
      daySwap?.swapDays(week.num, swapSource, index)
      setSwapSource(null)
    }
  }

  const showResetButton = daySwap?.hasSwaps(week.num)
  const isSwapMode = swapSource !== null

  // Build a map of date -> ReadinessScore for DayCard matching
  const readinessByDate = new Map<string, ReadinessScore>()
  for (const score of weekReadiness) {
    readinessByDate.set(score.date, score)
  }

  return (
    <div className="pb-6">
      {/* View toggle: List / Calendar */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'list' ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            List
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'calendar' ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Calendar
          </button>
          {plan && (
            <button
              onClick={() => setViewMode('season')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'season' ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Season
            </button>
          )}
          {race && (
            <button
              onClick={() => setViewMode('race')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'race' ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              🏔 Race
            </button>
          )}
        </div>
        {viewMode === 'calendar' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCalMonth(prev => {
                const d = new Date(prev.year, prev.month - 1, 1)
                return { year: d.getFullYear(), month: d.getMonth() }
              })}
              className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 px-1"
            >‹</button>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 min-w-[100px] text-center">
              {new Date(calMonth.year, calMonth.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={() => setCalMonth(prev => {
                const d = new Date(prev.year, prev.month + 1, 1)
                return { year: d.getFullYear(), month: d.getMonth() }
              })}
              className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 px-1"
            >›</button>
          </div>
        )}
      </div>

      {/* P14: the plan's notes live here, next to the weeks they describe,
          rather than opening Today with seven caveats every morning. */}
      {planNotes.length > 0 && (
        <div className="px-3 pt-3">
          <PlanNotesPanel notes={planNotes} openRequest={planNotesOpenRequest} />
        </div>
      )}

      {/* Travel mode — consume the trip the athlete told us about at
          onboarding, and let them declare new ones, next to the weeks it
          reshapes. */}
      {travel && (
        <div className="px-3 pt-3">
          <TravelModePanel
            weeks={weeks}
            note={onboardingConfig?.scheduleConstraintsNote}
            windows={travel.windows}
            todayIso={todayDateString()}
            onActivate={travel.onActivate}
            onDeactivate={travel.onDeactivate}
          />
        </div>
      )}

      {/* ── Calendar view ── */}
      {viewMode === 'calendar' && (
        <CalendarGrid
          year={calMonth.year}
          month={calMonth.month}
          daysByDate={daysByDate}
          readinessByDate={readinessByDate}
          onDayTap={d => openDayModal(d)}
        />
      )}

      {/* ── List view (existing) ── */}
      {viewMode === 'list' && (
      <>
      {/* Season strip — one segment per block of consecutive weeks aimed at
          the same race/block. Rendered only for multi-race seasons; tapping
          a segment jumps to its first week. */}
      {seasonSegments.length > 1 && (
        <div className="flex overflow-x-auto gap-1 px-3 pt-2 bg-white dark:bg-slate-800">
          {seasonSegments.map(seg => (
            <button
              key={`${seg.label}-${seg.firstIndex}`}
              onClick={() => setActiveWeek(seg.firstIndex)}
              className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium text-white ${seg.bg} ${
                activeWeek >= seg.firstIndex && activeWeek < seg.firstIndex + seg.count ? '' : 'opacity-50'
              }`}
              title={seg.title}
            >
              {seg.label}
            </button>
          ))}
        </div>
      )}
      {/* Week selector */}
      <div ref={scrollRef} className="flex overflow-x-auto gap-1.5 px-3 py-3 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
        {weeks.map((w, i) => (
          <button
            key={w.num}
            onClick={() => setActiveWeek(i)}
            className={`shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              activeWeek === i
                ? 'bg-slate-800 text-white shadow-md'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            <div>Wk {w.num}</div>
            <div className="text-[10px] opacity-75">
              {formatWeekMilesChip(w.miles)}
            </div>
          </button>
        ))}
      </div>

      {/* Swap mode banner */}
      {isSwapMode && (
        <div className="bg-teal-600 text-white px-4 py-2 flex items-center justify-between">
          <p className="text-sm font-medium">
            Swapping {week.days[swapSource!]?.day} — tap another day to swap
          </p>
          <button
            onClick={() => setSwapSource(null)}
            className="text-xs bg-teal-700 hover:bg-teal-800 px-2 py-1 rounded-lg"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Block boundary strip — the selected week starts a NEW season block
          (or hands off from the anchor build). */}
      {week.seasonRace && weeks[activeWeek - 1] &&
        (weeks[activeWeek - 1].seasonRace?.blockKind !== week.seasonRace.blockKind ||
         weeks[activeWeek - 1].seasonRace?.name !== week.seasonRace.name) && (
        <div className="mx-4 mt-3 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs text-slate-600 dark:text-slate-300">
          <span className={`inline-block px-1.5 py-0.5 rounded text-white text-[10px] font-semibold mr-1.5 ${BLOCK_STYLE[week.seasonRace.blockKind].bg}`}>
            {BLOCK_STYLE[week.seasonRace.blockKind].label}
          </span>
          New block — {BLOCK_STYLE[week.seasonRace.blockKind].label.toLowerCase()} toward {week.seasonRace.name}
        </div>
      )}

      {/* ── Strength benchmark banner ──
          Shows when this week hosts a benchmark session (log it) or when
          an existing benchmark has gone stale (re-test it). The loads in
          every strength card downstream are only as good as this. */}
      {strength && (
        week?.days.some(d => /STRENGTH BENCHMARK/i.test(d.workout)) ||
        // Not every plan can spare a strength slot for the test (a week
        // with one strength day keeps it), so the prompt also stands on
        // its own whenever nothing has been measured or it has gone
        // stale. The benchmark is always loggable, scheduled or not.
        !strength.capacity ||
        isStale(strength.capacity, todayDateString())
      ) && (
        <div className="mx-4 mt-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            {!strength.capacity
              ? 'Your loads are still estimates'
              : isStale(strength.capacity, todayDateString())
                ? 'Time to re-test'
                : 'Re-test week'}
          </p>
          <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1">
            {strength.capacity
              ? 'Same tests as last time, so the numbers are comparable. Your loads re-prescribe the moment you log them.'
              : 'Until you log a benchmark, every strength load in your plan is an estimate from a one-question self-report. This replaces the guess with your actual numbers.'}
          </p>
          <button
            onClick={() => setBenchmarkOpen(true)}
            className="mt-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200 underline underline-offset-2"
          >
            {strength.capacity ? 'Log the re-test →' : 'Log my benchmark →'}
          </button>
        </div>
      )}

      {strength?.capacity && !isStale(strength.capacity, todayDateString()) &&
        !week?.days.some(d => /STRENGTH BENCHMARK/i.test(d.workout)) && (
        <div className="mx-4 mt-3 text-xs text-slate-500 dark:text-slate-400">
          {capacitySummary(strength.capacity, todayDateString())}
        </div>
      )}

      {benchmarkOpen && strength && (
        <StrengthBenchmarkSheet
          kind={strength.kind}
          previous={strength.capacity}
          todayIso={todayDateString()}
          onSave={strength.save}
          onClose={() => setBenchmarkOpen(false)}
        />
      )}

      {/* ── Rebuild suggestion (110-F5) ── */}
      {suggestRebuild && (
        <div className="mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            The last two weeks came in well under plan
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
            That's information, not a verdict — but the rest of this plan was written for the athlete you were before
            those weeks. Rebuilding restarts from where you actually are now; nothing gets made up, and your race date
            doesn't move.
          </p>
          <button
            onClick={onRebuildPlan}
            className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
          >
            Rebuild the rest of my plan
          </button>
        </div>
      )}

      {/* Week header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-slate-800 dark:text-white">Week {week.num}</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">{week.dates}</span>
              <span className="text-sm font-semibold text-teal-600">{formatWeekMilesHeader(week.miles)}</span>
            </div>
            {week.seasonRace && (
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-1">
                → {week.seasonRace.name} · {fmtIsoShort(week.seasonRace.dateIso)} · {daysUntilIso(week.seasonRace.dateIso)} days
              </p>
            )}
            {week.seasonRace && primaryRace && primaryRace.name !== week.seasonRace.name &&
              daysUntilIso(primaryRace.dateIso) > 0 && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                Main goal: {primaryRace.name} · {daysUntilIso(primaryRace.dateIso)} days
              </p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{week.focus}</p>
            {/* Completed vs planned — only once the week has something to
                report, so a future week never reads as "0 mi done". */}
            {(() => {
              const comp = compliance?.find(c => c.weekNum === week.num)
              if (!comp || comp.plannedMiles <= 0) return null
              const started = comp.actualMiles > 0 || (!!week.startIso && week.startIso <= todayDateString())
              if (!started) return null
              const pct = Math.round(weekCompliance(comp.plannedMiles, comp.actualMiles) * 100)
              return (
                <p className="text-xs mt-1 font-medium text-slate-600 dark:text-slate-300">
                  {comp.actualMiles.toFixed(1)} of {comp.plannedMiles.toFixed(1)} mi done
                  <span className={`ml-1.5 ${pct >= 85 ? 'text-emerald-600' : pct >= 70 ? 'text-slate-500' : 'text-amber-600'}`}>
                    · {pct}%
                  </span>
                </p>
              )
            })()}
          </div>
          <div className="flex items-center gap-2">
            {canPushWeek && (
              <button
                onClick={handlePushWeek}
                disabled={weekPushStatus === 'sending'}
                className="text-xs text-teal-700 hover:text-teal-900 font-medium px-2 py-1 rounded-lg border border-teal-200 hover:bg-teal-50 transition-colors disabled:opacity-50"
                title={`Send this week's ${weekPushableCount} remaining workout${weekPushableCount === 1 ? '' : 's'} to your Garmin watch`}
              >
                {weekPushStatus === 'sending' ? 'Sending…'
                  : weekPushStatus === 'sent' ? '✓ Week on watch'
                  : '⌚ Send week to watch'}
              </button>
            )}
            {showResetButton && (
              <button
                onClick={() => daySwap?.resetWeek(week.num)}
                className="text-xs text-amber-600 hover:text-amber-800 font-medium px-2 py-1 rounded-lg border border-amber-200 hover:bg-amber-50 transition-colors"
              >
                ↩ Reset
              </button>
            )}
          </div>
        </div>
        {weekPushMsg && (
          <p className={`text-xs mt-1 ${weekPushStatus === 'error' ? 'text-red-600' : 'text-teal-700'}`}>
            {weekPushMsg}
          </p>
        )}
      </div>

      {/* Live session in progress — resume banner (survives app kills) */}
      {hasLiveDraft && manualLog && (
        <div className="px-3 mb-2">
          <button
            onClick={() => setLiveOpen({})}
            className="w-full flex items-center gap-2.5 bg-purple-50 dark:bg-slate-800 border border-purple-200 dark:border-purple-900 rounded-xl px-3.5 py-3 text-left"
          >
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="flex-1 text-sm font-semibold text-purple-800 dark:text-purple-300">
              Workout in progress — tap to resume
            </span>
            <span className="text-xs font-medium text-purple-500">Resume</span>
          </button>
        </div>
      )}

      {/* Day cards */}
      <div className="px-3 space-y-2">
        {week.days.map((d, i) => {
          // Match readiness to day by parsing day label to date
          const dayDateMatch = dayIsoInWeek(d.day, week, todayDateString())
          const readiness = dayDateMatch ? readinessByDate.get(dayDateMatch) : undefined
          const trimpRecord = findTrimpRecord(dailyTrimp, dayDateMatch, d.actual?.name)
          // Look up the home-location forecast for this day. Prefer
          // the hourly resolution at the athlete's training time when
          // available (within ~7 days) — falls back to daily aggregate
          // for days beyond the hourly horizon. Returns null when
          // outside the 14-day daily window entirely.
          const weatherChip = buildWeatherChipForDate(
            coachSnapshot?.weatherForecast,
            dayDateMatch,
            coachSnapshot?.weatherForecast?.preferredHour ?? null,
          )

          return (
            <div
              key={`${week.num}-${i}`}
              className={`transition-all rounded-xl ${
                swapSource === i ? 'ring-2 ring-teal-500 ring-offset-2 scale-[0.98]' : ''
              } ${
                isSwapMode && swapSource !== i ? 'ring-1 ring-teal-300 ring-offset-1' : ''
              }`}
            >
              <DayCard
                day={d}
                weekNum={week.num}
                onTap={isSwapMode ? () => handleSwapTap(i) : () => openDayModal(d)}
                onLog={manualLog ? () => setLogDay(d) : undefined}
                onStartLive={
                  // Live logging: today's strength / gym-circuit /
                  // simulation day with nothing logged yet. Everything
                  // else keeps the plain log editor.
                  manualLog && !d.actual &&
                  dayDateMatch === todayDateString() &&
                  (d.type === 'strength' || (d.type === 'cross' && isGymBasedDay(d)) || isSimDay(d))
                    ? () => setLiveOpen({ day: d, iso: dayDateMatch ?? undefined })
                    : undefined
                }
                onSwap={daySwap && !d.locked ? () => handleSwapTap(i) : undefined}
                onEdit={planEdit ? () => setEditDay({ day: d, index: i }) : undefined}
                locked={d.locked}
                onToggleLock={onToggleLock && dayDateMatch ? () => onToggleLock(dayDateMatch) : undefined}
                onMissed={
                  // Only for days that already happened, had something
                  // planned, and weren't logged — a replan on a future day
                  // would be guessing, and on a logged day, wrong. A pinned
                  // day is fixed, so it offers no "Missed?"/move affordance.
                  replan && dayDateMatch && dayDateMatch < todayDateString() &&
                  d.type !== 'rest' && d.type !== 'race' && !d.actual && !d.locked
                    ? () => setMissedDay({ day: d, iso: dayDateMatch })
                    : undefined
                }
                hasReplan={!!dayDateMatch && !!replan?.hasReplan(dayDateMatch)}
                hasEdit={planEdit?.hasEdit(week.num, i)}
                isSwapSelected={swapSource === i}
                isSwapTarget={isSwapMode && swapSource !== i && !d.locked}
                readiness={readiness}
                coachEnabled={coachEnabled}
                isToday={dayDateMatch === todayDateString()}
                isPast={!!dayDateMatch && dayDateMatch < todayDateString()}
                athleteId={athleteId}
                coachSnapshot={coachSnapshot}
                onAskCoach={onAskCoach}
                trimpRecord={trimpRecord}
                weatherChip={weatherChip}
                injuryStatus={injuryStatus}
                isoDate={dayDateMatch ?? undefined}
              />
            </div>
          )
        })}
      </div>

      </>
      )}

      {/* ── Race prep view ── */}
      {viewMode === 'season' && (
        <div className="px-3 pt-3 space-y-3">
          {/* The countdown card and the season race list used to open Today.
              The countdown now lives once in Today's header; the detail
              belongs here, with the rest of the season. */}
          {race && <RaceCard race={race} readiness={raceReadiness} />}
          {season && <SeasonRacesCard season={season} primaryGoalText={primaryGoalText} />}
        </div>
      )}
      {viewMode === 'season' && plan && (
        <SeasonOverview
          plan={plan}
          season={season}
          method={method}
          config={onboardingConfig}
          zones={zones}
        />
      )}

      {viewMode === 'race' && race && (
        <div className="px-3 pt-3">
          {racePacing && <RacePacingCard plan={racePacing} />}
          {/* Phase 4 — projected finish from sims + benchmarks + run
               fitness. Hyrox plans only; renders nothing without any
               personal evidence. */}
          {onboardingConfig?.raceType === 'hyrox' && (
            <HyroxProjectionCard weeks={weeks} config={onboardingConfig} capacity={strength?.capacity} />
          )}
          <RaceNarrative
            race={race}
            weekNum={week.num}
            totalWeeks={weeks.length}
            weeks={weeks}
            compliance={compliance}
            perf={latestPerf}
            season={season}
          />

          {/* Elevation profile */}
          <div className="mt-3">
            <RaceElevationProfile race={race} />
          </div>

          {/* Course landmarks */}
          {race.landmarks && race.landmarks.length > 0 && (
            <div className="mt-3 bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Course Landmarks</p>
              <div className="space-y-2">
                {race.landmarks.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-xs font-mono text-teal-600 shrink-0 w-14 pt-0.5">{l.segment}</span>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{l.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gear checklist */}
          {race.gear && race.gear.length > 0 && (
            <div className="mt-3 bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Gear Checklist</p>
              <div className="space-y-1">
                {race.gear.map((g, i) => (
                  <p key={i} className="text-xs text-slate-600 dark:text-slate-300">
                    {g.required ? '✅' : '📋'} {g.item}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Nutrition */}
          {race.nutrition && (
            <div className="mt-3 bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Nutrition Strategy</p>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{race.nutrition}</p>
            </div>
          )}
        </div>
      )}

      {/* Workout detail modal (shared by all views) */}
      {modalDay && (
        <WorkoutModal
          day={modalDay.day}
          weekNum={modalDay.week.num}
          strengthCapacity={strength?.capacity}
          onClose={() => setModalDay(null)}
          onLog={manualLog ? () => { setLogDay(modalDay.day); setModalDay(null) } : undefined}
          onStartLive={(() => {
            // Same eligibility as the day-card pill: today's strength /
            // gym-circuit day with nothing logged yet.
            const d = modalDay.day
            const iso = dayIsoInWeek(d.day, modalDay.week, todayDateString())
            const eligible = manualLog && !d.actual && iso === todayDateString() &&
              (d.type === 'strength' || (d.type === 'cross' && isGymBasedDay(d)) || isSimDay(d))
            return eligible
              ? () => { setLiveOpen({ day: d, iso: iso ?? undefined }); setModalDay(null) }
              : undefined
          })()}
          onSaveNote={manualLog && modalDay.day.actual ? async (note) => {
            manualLog.logWorkout(modalDay.day.day, { ...modalDay.day.actual!, notes: note }, dayIsoInWeek(modalDay.day.day, modalDay.week, todayDateString()))
            await onShareNote?.(modalDay.day, note)
          } : undefined}
          zones={zones}
          athleteId={athleteId}
          coachEnabled={coachEnabled}
          weeks={historyWeeks}
          readiness={(() => {
            const d = dayIsoInWeek(modalDay.day.day, modalDay.week, todayDateString())
            return d ? readinessByDate.get(d) : undefined
          })()}
          latestPerf={latestPerf}
          coachSnapshot={coachSnapshot}
          onAskCoach={onAskCoach}
          strengthLevel={strengthLevel}
          trimpRecord={(() => {
            const d = dayIsoInWeek(modalDay.day.day, modalDay.week, todayDateString())
            return findTrimpRecord(dailyTrimp, d, modalDay.day.actual?.name)
          })()}
          onReweightPlan={onReweightPlan}
          currentWeakStation={onboardingConfig?.weakStation}
          onClaimSecondary={manualLog ? (sec) => {
            // Claim a demoted activity as today's workout: log it so the day
            // resolves and its biometrics attach. The stored source stays as
            // recorded (strava/garmin/apple) so the rich data still renders;
            // applyLogsToWeeks then drops it from the secondaries list by id.
            manualLog.logWorkout(modalDay.day.day, sec, dayIsoInWeek(modalDay.day.day, modalDay.week, todayDateString()))
            setModalDay(null)
          } : undefined}
        />
      )}

      {/* Live-session player (Phase 2) */}
      {liveOpen && manualLog && (
        <LiveSessionPlayer
          planned={liveOpen.day}
          dayLabel={liveOpen.day?.day ?? 'Today'}
          dayIso={liveOpen.iso}
          athleteId={athleteId}
          allWeeks={historyWeeks}
          calibration={{ level: strengthLevel, capacity: strength?.capacity }}
          hyrox={{
            division: onboardingConfig?.hyroxDivision,
            sex: onboardingConfig?.sex === 'female' ? 'female' : 'male',
          }}
          onSave={(workout, meta) => {
            manualLog.logWorkout(meta.dayLabel, workout, meta.dayIso)
            if (workout.notes?.trim() && liveOpen.day) onShareNote?.(liveOpen.day, workout.notes)
          }}
          onClose={() => setLiveOpen(null)}
        />
      )}

      {/* Manual log modal */}
      {logDay && manualLog && (() => {
        const logIso = dayIsoInWeek(logDay.day, week, todayDateString())
        const hasManualEntry = Boolean(
          manualLog.logs && ((logIso && manualLog.logs[logIso]) || manualLog.logs[logDay.day]),
        )
        return (
        <ManualLog
          dayLabel={logDay.day}
          existing={logDay.actual}
          planned={logDay}
          weekNum={week.num}
          allWeeks={historyWeeks}
          strengthLevel={strengthLevel}
          strengthCapacity={strength?.capacity}
          hasManualEntry={hasManualEntry}
          onRemove={manualLog.removeLog ? () => {
            manualLog.removeLog!(logDay.day, logIso)
            setLogDay(null)
          } : undefined}
          onSave={(data) => {
            manualLog.logWorkout(logDay.day, data, dayIsoInWeek(logDay.day, week, todayDateString()))
            // Auto-seed the coach with the journal note when it changed, so
            // typing in the log editor reaches the coach just like the
            // inline journal does.
            if (data.notes?.trim()) onShareNote?.(logDay, data.notes)
            setLogDay(null)
          }}
          onClose={() => setLogDay(null)}
        />
        )
      })()}

      {/* Manual workout editor (planned prescription) */}
      {editDay && planEdit && (
        <WorkoutEditor
          day={editDay.day}
          weekNum={week.num}
          hasOverride={planEdit.hasEdit(week.num, editDay.index)}
          onSave={(updates) => {
            planEdit.editDay(week.num, editDay.index, updates)
            setEditDay(null)
          }}
          onRevert={() => {
            planEdit.revertDay(week.num, editDay.index)
            setEditDay(null)
          }}
          onClose={() => setEditDay(null)}
        />
      )}

      {/* Missed-workout replanning (PRD-110) */}
      {missedDay && replan && (
        <MissedDaySheet
          day={missedDay.day}
          hasReplan={replan.hasReplan(missedDay.iso)}
          moveOutcome={moveOutcomeFor(weeks, missedDay.iso)}
          onChoose={(kind: ReplanKind) => replan.apply(kind, missedDay.iso)}
          onUndo={() => replan.undoFor(missedDay.iso)}
          onClose={() => setMissedDay(null)}
        />
      )}
    </div>
  )
}

// ─── Calendar Grid ──────────────────────────────────────────────

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function CalendarGrid({
  year, month, daysByDate, readinessByDate, onDayTap,
}: {
  year: number
  month: number
  daysByDate: Map<string, PlannedDay>
  readinessByDate: Map<string, ReadinessScore>
  onDayTap: (d: PlannedDay) => void
}) {
  const today = todayDateString()

  // Build the grid: first, find what day-of-week the month starts on (Mon=0)
  const firstOfMonth = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // getDay(): 0=Sun → shift to Mon=0
  const startDow = (firstOfMonth.getDay() + 6) % 7

  // Build cells: leading blanks + days of month
  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  // Trailing blanks to fill the last row
  while (cells.length % 7 !== 0) cells.push(null)
  const numRows = cells.length / 7

  return (
    // Flex column that fills remaining viewport height below the header/toggle.
    // Approx 11rem budget is taken by the app header, tab bar, and view toggle.
    <div className="flex flex-col px-3 pt-2 pb-3 gap-1" style={{ height: 'calc(100vh - 11rem)' }}>
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 shrink-0">
        {DAY_HEADERS.map(d => (
          <div key={d} className="text-center text-sm font-semibold text-slate-500 dark:text-slate-400 py-1">{d}</div>
        ))}
      </div>
      {/* Day cells — equal-height rows that stretch to fill remaining height.
          Typography and detail scale with viewport: mobile stays compact,
          sm+ shows more detail (zone, distance), md+ shows the full workout
          description line. */}
      <div
        className="grid grid-cols-7 gap-1 sm:gap-1.5 flex-1 min-h-0"
        style={{ gridTemplateRows: `repeat(${numRows}, minmax(0, 1fr))` }}
      >
        {cells.map((dayNum, i) => {
          if (dayNum === null) return <div key={`blank-${i}`} />
          const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
          const planned = daysByDate.get(iso)
          const isToday = iso === today
          const readiness = readinessByDate.get(iso)

          if (!planned) {
            return (
              <div key={iso} className={`rounded-lg p-1.5 sm:p-2 ${isToday ? 'ring-2 ring-teal-500' : 'bg-slate-50 dark:bg-slate-900'}`}>
                <span className="text-base sm:text-lg text-slate-300">{dayNum}</span>
              </div>
            )
          }

          const style = getWorkoutStyle(planned.type, planned.workout)
          const isDone = !!planned.actual
          const bg = adaptBg(isDone ? '#D1FAE5' : style.bg)

          const dotColor = readiness?.status === 'PEAK' ? 'bg-indigo-500'
            : readiness?.status === 'YELLOW' ? 'bg-amber-400'
            : readiness?.status === 'RED' ? 'bg-red-500'
            : null

          // Distance + zone for larger breakpoints
          const milesMatch = planned.zone?.match(/([\d.]+)\s*mi/i)
          const miles = milesMatch ? milesMatch[1] : null
          const zoneMatch = planned.zone?.match(/Z\d(?:–\d)?/i)
          const zoneShort = zoneMatch ? zoneMatch[0] : null

          return (
            <button
              key={iso}
              onClick={() => onDayTap(planned)}
              className={`rounded-lg p-1.5 sm:p-2 text-left transition-all active:scale-95 overflow-hidden flex flex-col ${
                isToday ? 'ring-2 ring-teal-500 ring-offset-1' : ''
              }`}
              style={{ backgroundColor: bg, borderLeft: `3px solid ${style.border}` }}
            >
              <div className="flex items-center justify-between shrink-0">
                <span className={`text-base sm:text-lg font-bold ${isToday ? 'text-teal-700' : 'text-slate-700 dark:text-slate-200'}`}>{dayNum}</span>
                {dotColor && <span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${dotColor}`} />}
              </div>
              <div className="flex items-center gap-1 mt-0.5 shrink-0">
                <span className="text-lg sm:text-xl leading-none">{style.label}</span>
                {isDone && <span className="text-xs sm:text-sm text-emerald-700 font-bold">✓</span>}
              </div>
              {/* Workout title — clamped tighter on mobile, more on larger screens */}
              <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-white mt-1 line-clamp-2 sm:line-clamp-2 leading-tight">
                {planned.workout}
              </p>
              {/* Distance + zone — shown from sm up (tablet+) */}
              {(miles || zoneShort) && (
                <p className="hidden sm:block text-xs text-slate-600 dark:text-slate-300 mt-1 leading-tight">
                  {miles && <span>{miles} mi</span>}
                  {miles && zoneShort && <span> · </span>}
                  {zoneShort && <span>{zoneShort}</span>}
                </p>
              )}
              {/* Full description — shown from md up (desktop). Space is
                  tight; 2-3 lines clamped to prevent cell stretch. */}
              {planned.detail && (
                <p className="hidden md:block text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-3 leading-snug flex-1 min-h-0">
                  {planned.detail}
                </p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
