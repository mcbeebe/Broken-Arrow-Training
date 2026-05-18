/**
 * Plan-generator orchestrator — turns a `TrainingMethod` + `OnboardingConfig`
 * into a fully-populated `TrainingPlan` (the legacy shape used by the existing
 * UI), with a structured `PlannedWorkout` attached to every running day.
 *
 * This coexists with `generateHyroxPlan`: trail/road flows call this; Hyrox
 * and General-Fitness flows continue to use `generateHyroxPlan`.
 */
import type {
  TrainingPlan,
  TrainingWeek,
  PlannedDay,
  AthleteProfile,
  RaceInfo,
  HRZone,
  WorkoutType,
} from '../../types'
import type {
  TrainingMethod,
  WorkoutCategory,
  DaySchedule,
  Workout,
  CanonicalPaceZone,
} from '../../types/training-method'
import type { OnboardingConfig, RaceDistance, InjuryStatus } from '../../hooks/useOnboarding'
import type { PlannedWorkout, ResolvedPaces, WeekMileage } from './types'
import { resolvePaces, formatZoneString } from './paceTargets'
import {
  chooseTotalWeeks,
  allocatePhaseWeeks,
  buildWeeklyMileage,
  estimateCurrentWeeklyMileage,
  mapToMethodExperience,
  type MileageProgressionAdjust,
} from './weekPlan'
import { pickWeeklyPattern, pickWorkoutForDay, buildPlannedWorkout } from './workouts'
import { injectExtraDays } from './extraDays'

const DAY_OF_WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

const RACE_DISTANCE_LABELS: Record<RaceDistance, { label: string; miles: number }> = {
  '5k': { label: '5K', miles: 3.1 },
  '10k': { label: '10K', miles: 6.2 },
  half_marathon: { label: 'Half Marathon', miles: 13.1 },
  marathon: { label: 'Marathon', miles: 26.2 },
  '50k': { label: '50K', miles: 31.1 },
  '50_mile': { label: '50 Mile', miles: 50 },
  '100k': { label: '100K', miles: 62.1 },
  '100_mile': { label: '100 Mile', miles: 100 },
  mountain_ultra: { label: 'Mountain Ultra', miles: 0 },
}

/** Map a method's WorkoutCategory onto the legacy WorkoutType the UI consumes. */
function categoryToType(c: WorkoutCategory): WorkoutType {
  switch (c) {
    case 'rest':           return 'rest'
    case 'cross_training': return 'cross'
    case 'strength':       return 'strength'
    case 'long':           return 'long'
    case 'race_pace':      return 'race'
    case 'easy':
    case 'recovery':
    case 'strides':        return 'run'
    case 'tempo':
    case 'cruise_intervals':
    case 'vo2_intervals':
    case 'speed_repetitions':
    case 'fartlek':
    case 'hills':
    case 'progression':
    case 'time_trial':     return 'quality'
  }
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return `${days[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`
}

function maxHrPercentZones(maxHR: number): HRZone[] {
  return [
    { zone: 'Z1 – Recovery', hr: `${Math.round(maxHR * 0.55)}–${Math.round(maxHR * 0.65)}`, pct: '55–65%', desc: 'Very easy, full conversation' },
    { zone: 'Z2 – Aerobic',  hr: `${Math.round(maxHR * 0.65)}–${Math.round(maxHR * 0.75)}`, pct: '65–75%', desc: 'Comfortable, sustainable' },
    { zone: 'Z3 – Tempo',    hr: `${Math.round(maxHR * 0.75)}–${Math.round(maxHR * 0.85)}`, pct: '75–85%', desc: 'Comfortably hard' },
    { zone: 'Z4 – Threshold', hr: `${Math.round(maxHR * 0.85)}–${Math.round(maxHR * 0.90)}`, pct: '85–90%', desc: 'Hard. A few words at most' },
    { zone: 'Z5 – VO2 / Max', hr: `${Math.round(maxHR * 0.90)}–${maxHR}`, pct: '90–100%', desc: 'Hard. A word or two at a time' },
  ]
}

/**
 * Build the 5 zones Settings displays so they agree with the per-day workout
 * text in the plan. The per-day text comes from each method's pace-zone
 * `hrRange` × LTHR (see paceTargets.ts → formatZoneString). Computing
 * Settings off the same source means a user who sees "Zone 2 · 149-164 bpm"
 * on a workout sees the matching 149-164 in Settings → HR Zones.
 *
 * Falls back to the legacy maxHR-percentage formula when the method doesn't
 * declare per-zone hrRanges (e.g. legacy / RPE-only methods).
 */
const Z_SLOTS: { label: string; pct: string; desc: string; primary: CanonicalPaceZone; alternates: CanonicalPaceZone[] }[] = [
  { label: 'Z1 – Recovery',  pct: '55–65%',  desc: 'Very easy, full conversation',         primary: 'recovery',           alternates: [] },
  { label: 'Z2 – Aerobic',   pct: '65–75%',  desc: 'Comfortable, sustainable',             primary: 'easy',               alternates: [] },
  { label: 'Z3 – Tempo',     pct: '75–85%',  desc: 'Comfortably hard',                     primary: 'aerobic_threshold',  alternates: ['marathon_pace'] },
  { label: 'Z4 – Threshold', pct: '85–90%',  desc: 'Hard. A few words at most',            primary: 'lactate_threshold',  alternates: ['critical_velocity'] },
  { label: 'Z5 – VO2 / Max', pct: '90–100%', desc: 'Hard. A word or two at a time',        primary: 'vo2max',             alternates: ['speed'] },
]

function computeZones(
  maxHR: number,
  paces?: ResolvedPaces,
  method?: TrainingMethod,
): HRZone[] {
  if (!paces || !method) return maxHrPercentZones(maxHR)
  const fallback = maxHrPercentZones(maxHR)
  const out: HRZone[] = []
  for (let i = 0; i < Z_SLOTS.length; i++) {
    const slot = Z_SLOTS[i]
    const candidates = [slot.primary, ...slot.alternates]
    let resolved: HRZone | null = null
    for (const c of candidates) {
      const target = paces.byZone[c]
      if (target && target.hrBpmLow != null && target.hrBpmHigh != null) {
        resolved = { zone: slot.label, hr: `${target.hrBpmLow}–${target.hrBpmHigh}`, pct: slot.pct, desc: slot.desc }
        break
      }
    }
    out.push(resolved ?? fallback[i])
  }
  return out
}

function buildDetailString(pw: PlannedWorkout, paces: ResolvedPaces, weekMi: WeekMileage): string {
  const parts: string[] = []
  if (pw.category === 'long') {
    parts.push(`Long run ~${weekMi.longRunMi} mi`)
  }
  const target = paces.byZone[pw.primaryZone]
  if (target) {
    parts.push(formatZoneString(target))
  }
  // Surface the first cue if present
  if (pw.cues.length > 0) parts.push(pw.cues[0])
  return parts.join(' · ')
}

function buildPlannedDay(
  date: string,
  daySchedule: DaySchedule,
  paces: ResolvedPaces,
  weekMi: WeekMileage,
  workout: Workout | null,
  plannedWorkout: PlannedWorkout | null,
  substitutionNote?: string,
): PlannedDay {
  const type = categoryToType(daySchedule.category)
  if (!workout || !plannedWorkout) {
    // Rest / cross / strength row
    return {
      day: formatDayLabel(date),
      type,
      workout: daySchedule.category === 'rest' ? 'Rest' : daySchedule.category === 'cross_training' ? 'Cross-training' : 'Strength',
      detail: daySchedule.notes ?? '',
      zone: '—',
      route: '',
      time: '',
    }
  }

  const target = paces.byZone[plannedWorkout.primaryZone]
  return {
    day: formatDayLabel(date),
    type,
    workout: plannedWorkout.displayName ?? plannedWorkout.name,
    detail: buildDetailString(plannedWorkout, paces, weekMi)
      + (substitutionNote ? ` · ${substitutionNote}` : ''),
    zone: target ? formatZoneString(target) : '—',
    route: '',
    time: `${plannedWorkout.approxDurationMinutes.min}-${plannedWorkout.approxDurationMinutes.max} min`,
    plannedWorkout,
  }
}

function buildRaceInfo(config: OnboardingConfig): RaceInfo {
  const dist = config.raceDistance ? RACE_DISTANCE_LABELS[config.raceDistance] : { label: '', miles: 0 }
  return {
    name: config.raceName || 'Goal Race',
    date: config.raceDate || '',
    startTime: '',
    distance: dist.label,
    distanceMiles: dist.miles,
    elevation: '',
    elevationRange: '',
    course: '',
    cutoff: '',
    landmarks: [],
    gear: [],
    nutrition: '',
  }
}

function buildAthleteProfile(
  config: OnboardingConfig,
  currentWeeklyMileage: number,
  effectiveDaysPerWeek: number,
): AthleteProfile {
  const maxHR = config.maxHR ?? Math.max(120, 220 - (config.age ?? 30))
  return {
    name: config.athleteName,
    maxHR,
    currentBase: `~${currentWeeklyMileage} mi/wk`,
    weeklyStructure: `${effectiveDaysPerWeek} days/week`,
    ftpWatts: config.ftpWatts,
  }
}

/**
 * Injury-aware policy adjustments applied during plan generation.
 *
 * Conservative defaults for 'returning' (recovering from injury):
 *   - Cap requested training days at 4/week
 *   - Reduce starting mileage by 20% (× 0.8 on startMileagePctOfPeak)
 *   - Cap weekly ramp at 5% (vs typical method default of ~10%)
 *   - Force easy-substitution for quality workouts in the first 2 weeks
 *
 * For 'current' (currently injured):
 *   - Cap at 3 days/week
 *   - Reduce starting mileage by 30%
 *   - Cap weekly ramp at 3%
 *   - Force easy-substitution for the first 4 weeks
 */
interface InjuryPolicy {
  maxTrainingDaysPerWeek: number | null
  mileageAdjust: MileageProgressionAdjust
  /** Number of leading weeks where quality / non-easy categories are
   *  rewritten to easy runs, to ramp intensity gently after layoff. */
  forceEasyLeadInWeeks: number
}

function injuryPolicyFor(status: InjuryStatus | undefined): InjuryPolicy {
  switch (status) {
    case 'returning':
      return {
        maxTrainingDaysPerWeek: 4,
        mileageAdjust: { startPctMultiplier: 0.8, maxWeeklyIncreasePctCap: 0.05 },
        forceEasyLeadInWeeks: 2,
      }
    case 'current':
      return {
        maxTrainingDaysPerWeek: 3,
        mileageAdjust: { startPctMultiplier: 0.7, maxWeeklyIncreasePctCap: 0.03 },
        forceEasyLeadInWeeks: 4,
      }
    case 'none':
    case undefined:
    default:
      return {
        maxTrainingDaysPerWeek: null,
        mileageAdjust: {},
        forceEasyLeadInWeeks: 0,
      }
  }
}

/**
 * Categories that should be rewritten to 'easy' during the injury lead-in.
 * Running-only — never touches strength/cross/rest/long.
 */
const FORCE_EASY_CATEGORIES: ReadonlySet<WorkoutCategory> = new Set<WorkoutCategory>([
  'tempo',
  'cruise_intervals',
  'vo2_intervals',
  'speed_repetitions',
  'fartlek',
  'hills',
  'progression',
  'time_trial',
])

/**
 * Generate a personalized TrainingPlan from a TrainingMethod + Onboarding inputs.
 *
 * Inputs assumed valid: `config.raceDistance` should be set (the caller —
 * MethodSelection — is trail/road-only). If absent, the engine still produces
 * a plan using the method's defaultPlanWeeks; raceInfo will just have empty
 * race fields.
 */
export function generatePlanFromMethod(
  method: TrainingMethod,
  config: OnboardingConfig,
  today: string = new Date().toISOString().slice(0, 10),
): TrainingPlan {
  const paces = resolvePaces(method, config)
  const totalWeeks = chooseTotalWeeks(method, config.raceDate || undefined, today)
  const blocks = allocatePhaseWeeks(method, totalWeeks)
  const currentWeeklyMileage = estimateCurrentWeeklyMileage(config)
  const policy = injuryPolicyFor(config.injuryStatus)
  const mileage = buildWeeklyMileage(method, totalWeeks, blocks, currentWeeklyMileage, policy.mileageAdjust)
  const methodExp = mapToMethodExperience(config.experienceLevel)

  // Total training-day budget (running + strength + cross), capped by the
  // injury policy so 'returning' doesn't get a 7-day-a-week schedule no
  // matter what was clicked in onboarding.
  const requestedTotalDays = policy.maxTrainingDaysPerWeek != null
    ? Math.min(config.trainingDaysPerWeek, policy.maxTrainingDaysPerWeek)
    : config.trainingDaysPerWeek

  // Reserve slots for strength + cross-training. The remainder is what
  // we ask the running pattern for, so the pattern's rest days line up
  // with the requested extras instead of being padded on top.
  const wantStrength = Math.max(0, config.strengthDaysPerWeek ?? 0)
  const wantCross = (config.crossTrainingModes && config.crossTrainingModes.length > 0) ? 1 : 0
  const extrasRequested = wantStrength + wantCross

  // Clamp running days to what the method actually offers (derived from its
  // weeklyPatterns). If the user wants very few total days we still respect
  // the method's minimum running days and trim the extras, rather than
  // pretending a 1-day-per-week pattern exists.
  const patternDays = method.weeklyPatterns.map(p => p.daysPerWeek)
  const minRunDays = patternDays.length > 0 ? Math.min(...patternDays) : 3
  const maxRunDays = patternDays.length > 0 ? Math.max(...patternDays) : 7
  const desiredRunDays = requestedTotalDays - extrasRequested
  const runningDaysTarget = Math.max(minRunDays, Math.min(maxRunDays, desiredRunDays))

  // Strength + cross-training the user explicitly asked for. We honor the
  // full request even when the method's running minimum pushed
  // `runningDaysTarget` above `requestedTotalDays - extrasRequested` — the
  // alternative is silently dropping a strength day the user just clicked,
  // which was confusing in practice. The only hard cap is the calendar:
  // never schedule more than 7 active days in a week.
  const extrasInWeekCap = Math.max(0, 7 - runningDaysTarget)
  const extrasCap = Math.min(extrasRequested, extrasInWeekCap)

  const raceDateAnchor = config.raceDate || addDays(today, totalWeeks * 7)
  const weeks: TrainingWeek[] = []

  for (let w = 0; w < totalWeeks; w++) {
    const weekMi = mileage[w]
    const weeksOut = totalWeeks - w
    const weekStart = addDays(raceDateAnchor, -weeksOut * 7)

    const isFinalWeek = w === totalWeeks - 1
    // Race week uses the method's raceWeekSchedule directly
    const schedule: DaySchedule[] = isFinalWeek && method.taper.raceWeekSchedule.length > 0
      ? method.taper.raceWeekSchedule
      : (pickWeeklyPattern(method, weekMi.phaseId, runningDaysTarget, weekMi.isCutback)?.schedule ?? [])

    // Injury lead-in: rewrite intensity categories to 'easy' during the
    // first N weeks so a returning athlete doesn't get dropped straight
    // into tempo/intervals. Long runs and recovery runs are left alone.
    const isLeadIn = !isFinalWeek && policy.forceEasyLeadInWeeks > 0 && w < policy.forceEasyLeadInWeeks
    const adjustedSchedule: DaySchedule[] = isLeadIn
      ? schedule.map(d => FORCE_EASY_CATEGORIES.has(d.category) ? { ...d, category: 'easy' as WorkoutCategory } : d)
      : schedule

    const days: PlannedDay[] = []
    for (const daySched of adjustedSchedule) {
      const dayOffset = (daySched.dayOfWeek - 1)  // dayOfWeek 1..7 → Mon..Sun
      const date = addDays(weekStart, dayOffset)
      const picked = pickWorkoutForDay(method, daySched, methodExp, weekMi.totalMi)
      if (!picked) {
        days.push(buildPlannedDay(date, daySched, paces, weekMi, null, null))
      } else {
        const pw = buildPlannedWorkout(method, picked.workout, paces, picked.reason)
        days.push(buildPlannedDay(date, daySched, paces, weekMi, picked.workout, pw, picked.reason))
      }
    }
    // Sort by dayOfWeek (Mon..Sun) — schedule is already in order but be defensive
    days.sort((a, b) => DAY_OF_WEEK_LABELS.indexOf(a.day.split(' ')[0] as (typeof DAY_OF_WEEK_LABELS)[number])
                       - DAY_OF_WEEK_LABELS.indexOf(b.day.split(' ')[0] as (typeof DAY_OF_WEEK_LABELS)[number]))

    const phase = method.phases.find(p => p.id === weekMi.phaseId)

    // Slot user-selected strength + cross-training onto rest days, capped
    // by the total-days budget so we never exceed `trainingDaysPerWeek`.
    // Race week skips injection — its schedule is hand-authored in the
    // method's taper.raceWeekSchedule and shouldn't be edited.
    const withExtras = isFinalWeek
      ? days
      : injectExtraDays(
          days,
          config,
          method,
          phase,
          {
            isTaper: weekMi.isTaper,
            phaseId: weekMi.phaseId,
            weekNumber: weekMi.weekNumber,
          },
          { maxExtras: extrasCap },
        )
    weeks.push({
      num: w + 1,
      dates: `${formatDayLabel(weekStart)} – ${formatDayLabel(addDays(weekStart, 6))}`,
      miles: weekMi.totalMi,
      focus: weekMi.isTaper
        ? 'Taper'
        : weekMi.isCutback
          ? 'Cutback'
          : (phase?.name ?? 'Build'),
      days: withExtras,
    })
  }

  const effectiveDaysPerWeek = runningDaysTarget + extrasCap
  const athlete = buildAthleteProfile(config, currentWeeklyMileage, effectiveDaysPerWeek)
  return {
    athlete,
    weeks,
    zones: computeZones(athlete.maxHR, paces, method),
    race: buildRaceInfo(config),
  }
}
