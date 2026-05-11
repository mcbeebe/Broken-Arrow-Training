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
import type { TrainingMethod, WorkoutCategory, DaySchedule, Workout } from '../../types/training-method'
import type { OnboardingConfig, RaceDistance } from '../../hooks/useOnboarding'
import type { PlannedWorkout, ResolvedPaces, WeekMileage } from './types'
import { resolvePaces, formatZoneString } from './paceTargets'
import {
  chooseTotalWeeks,
  allocatePhaseWeeks,
  buildWeeklyMileage,
  estimateCurrentWeeklyMileage,
  mapToMethodExperience,
} from './weekPlan'
import { pickWeeklyPattern, pickWorkoutForDay, buildPlannedWorkout } from './workouts'

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

function computeZones(maxHR: number): HRZone[] {
  return [
    { zone: 'Z1 – Recovery', hr: `${Math.round(maxHR * 0.55)}–${Math.round(maxHR * 0.65)}`, pct: '55–65%', desc: 'Very easy, full conversation' },
    { zone: 'Z2 – Aerobic',  hr: `${Math.round(maxHR * 0.65)}–${Math.round(maxHR * 0.75)}`, pct: '65–75%', desc: 'Comfortable, sustainable' },
    { zone: 'Z3 – Tempo',    hr: `${Math.round(maxHR * 0.75)}–${Math.round(maxHR * 0.85)}`, pct: '75–85%', desc: 'Comfortably hard' },
    { zone: 'Z4 – Threshold', hr: `${Math.round(maxHR * 0.85)}–${Math.round(maxHR * 0.90)}`, pct: '85–90%', desc: 'Hard. A few words at most' },
    { zone: 'Z5 – VO2 / Max', hr: `${Math.round(maxHR * 0.90)}–${maxHR}`, pct: '90–100%', desc: 'Hard. A word or two at a time' },
  ]
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

function buildAthleteProfile(config: OnboardingConfig, currentWeeklyMileage: number): AthleteProfile {
  const maxHR = config.maxHR ?? Math.max(120, 220 - (config.age ?? 30))
  return {
    name: config.athleteName,
    maxHR,
    currentBase: `~${currentWeeklyMileage} mi/wk`,
    weeklyStructure: `${config.trainingDaysPerWeek} days/week`,
    ftpWatts: config.ftpWatts,
  }
}

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
  const mileage = buildWeeklyMileage(method, totalWeeks, blocks, currentWeeklyMileage)
  const methodExp = mapToMethodExperience(config.experienceLevel)

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
      : (pickWeeklyPattern(method, weekMi.phaseId, config.trainingDaysPerWeek, weekMi.isCutback)?.schedule ?? [])

    const days: PlannedDay[] = []
    for (const daySched of schedule) {
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
    weeks.push({
      num: w + 1,
      dates: `${formatDayLabel(weekStart)} – ${formatDayLabel(addDays(weekStart, 6))}`,
      miles: weekMi.totalMi,
      focus: weekMi.isTaper
        ? 'Taper'
        : weekMi.isCutback
          ? 'Cutback'
          : (phase?.name ?? 'Build'),
      days,
    })
  }

  const athlete = buildAthleteProfile(config, currentWeeklyMileage)
  return {
    athlete,
    weeks,
    zones: computeZones(athlete.maxHR),
    race: buildRaceInfo(config),
  }
}
