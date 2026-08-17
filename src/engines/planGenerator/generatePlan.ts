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
import type { PlannedSegment, PlannedWorkout, ResolvedPaces, WeekMileage } from './types'
import { resolvePaces, formatZoneString, athleteCurrentVdot, blendGoalPaces, isDisplayablePace } from './paceTargets'
import { sanitizeRaceTimeSeconds, vdotFromRace } from './vdot'
import {
  chooseTotalWeeks,
  allocatePhaseWeeks,
  buildWeeklyMileage,
  estimateCurrentWeeklyMileage,
  mapToMethodExperience,
  type MileageProgressionAdjust,
} from './weekPlan'
import { pickWeeklyPattern, pickWorkoutForDay, buildPlannedWorkout, scaleWorkoutToTime } from './workouts'
import { injectExtraDays } from './extraDays'
import { INJURY_LEADIN_WEEKS } from '../../utils/injuryRamp'
import { assessFeasibility } from './feasibility'
import { effectivePlanStart } from '../../utils/planDates'
import { computeMaxHR } from '../../utils/heartRate'
import { configVertGainFt, raceVertGainFt } from '../../utils/raceVert'
import { applyVertPrescription, isClimbyDensity } from './vertPrescription'
import { applyFuelingToWeek } from '../../utils/fueling'
import { detectHeat, environmentAdvisories, applyHeatBlock } from '../../utils/environmentPrep'
import { applyPredictorRehearsal, applyPowerHike, applyTimeOnFeet } from './trailSessions'

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

/** Whole days from `aIso` to `bIso` (negative if b is before a). */
function daysBetween(aIso: string, bIso: string): number {
  return Math.round(
    (new Date(bIso + 'T12:00:00').getTime() - new Date(aIso + 'T12:00:00').getTime()) / 86400000,
  )
}

/**
 * The Monday on or before a given date. Weeks are anchored to Monday so the
 * schedule's `dayOfWeek` (1..7 = Mon..Sun) maps onto real weekdays — without
 * this, anchoring directly to the race date (often a Sat/Sun) shifted every
 * day by the race weekday, landing e.g. a Saturday long run on Friday.
 */
function mondayOnOrBefore(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const jsDow = d.getDay()          // 0=Sun … 6=Sat
  const sinceMonday = (jsDow + 6) % 7 // 0=Mon … 6=Sun
  return addDays(dateStr, -sinceMonday)
}

/** Map the onboarding `longRunDay` label onto a schedule dayOfWeek (1=Mon…7=Sun). */
const LONG_RUN_DOW: Record<string, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
}

/**
 * Move the week's long run onto the athlete's preferred weekday by swapping
 * the `dayOfWeek` of the `long` day with whatever currently occupies the
 * desired weekday. Hard/easy spacing within the rest of the week is preserved
 * (only the two affected slots trade places). Returns a new array — never
 * mutates the method's shared schedule objects.
 */
function remapLongRunDay(schedule: DaySchedule[], desiredDow: number): DaySchedule[] {
  const longDay = schedule.find(d => d.category === 'long')
  if (!longDay || longDay.dayOfWeek === desiredDow) return schedule
  const longDow = longDay.dayOfWeek
  return schedule.map(d => {
    if (d.category === 'long') return { ...d, dayOfWeek: desiredDow }
    if (d.dayOfWeek === desiredDow) return { ...d, dayOfWeek: longDow }
    return d
  })
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return `${days[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`
}

/** Weekday index 1..7 (Mon..Sun) of an ISO date — the schedule convention. */
function mondayIndexOf(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00')
  return ((d.getDay() + 6) % 7) + 1
}

/**
 * Align the method's hand-authored race-week schedule to the race's actual
 * weekday. Every method pins race day at dayOfWeek 7 (Sunday), so a Saturday
 * race got its 🏆 card a day late — on the same date the season's post-race
 * recovery block starts, which then overwrote it (the field P0 where race
 * day showed "Post-race rest"). The whole schedule shifts by one offset so
 * pre-race days keep their relative spacing; entries pushed past race day
 * are dropped (post-race belongs to the recovery block), and entries pushed
 * before Monday fall off the front.
 */
/** Categories that are fine close to a race. Everything else counts as
 *  quality that must not sit within two days of the start line. */
const RACE_SAFE_CATEGORIES = new Set<string>(['easy', 'recovery', 'rest', 'cross_training', 'strength', 'race_pace', 'strides'])

function remapRaceWeekSchedule(schedule: DaySchedule[], raceDow: number): DaySchedule[] {
  const raceEntry = [...schedule].reverse().find(d => d.category === 'race_pace')
    ?? schedule[schedule.length - 1]
  if (!raceEntry) return schedule
  const shift = raceDow - raceEntry.dayOfWeek
  const mapped = schedule
    .map(d => ({ ...d, dayOfWeek: d.dayOfWeek + shift }))
    .filter(d => d.dayOfWeek >= 1 && d.dayOfWeek <= raceDow)
  // The shift preserves each day's distance-to-race but can delete the
  // authored week's leading rest and leave the wrong content near the
  // start line (P0.4). Enforce the taper's intent by proximity:
  //   D-1  → rest, or an easy day hard-capped as a shakeout;
  //   D-2  → no quality — downgrade to a short easy day.
  return mapped.map(d => {
    const daysBefore = raceDow - d.dayOfWeek
    if (daysBefore === 1) {
      if (d.category === 'easy' || d.category === 'recovery') {
        return { ...d, volumeModifier: 'short' as const, isPreRaceShakeout: true }
      }
      if (d.category !== 'rest') {
        return {
          dayOfWeek: d.dayOfWeek,
          category: 'rest' as const,
          notes: 'Rest — race tomorrow. Legs stay fresh.',
        }
      }
      return d
    }
    if (daysBefore === 2 && !RACE_SAFE_CATEGORIES.has(d.category)) {
      return {
        dayOfWeek: d.dayOfWeek,
        category: 'easy' as const,
        volumeModifier: 'short' as const,
        notes: 'Very easy — no quality this close to race day.',
      }
    }
    return d
  })
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
        // Derive the % label from the actual bpm range so the percentage
        // is honest with the number — previously the bpm came from the
        // method's %LTHR definition while the % label was a hard-coded
        // %HRmax band, which contradicted each other (e.g. Z2 said
        // "65–75%" but showed 149–164 = ~75–82% of a 200 max HR).
        const pctLow = Math.round((target.hrBpmLow / maxHR) * 100)
        const pctHigh = Math.round((target.hrBpmHigh / maxHR) * 100)
        resolved = {
          zone: slot.label,
          hr: `${target.hrBpmLow}–${target.hrBpmHigh}`,
          pct: `${pctLow}–${pctHigh}%`,
          desc: slot.desc,
        }
        break
      }
    }
    out.push(resolved ?? fallback[i])
  }
  return makeZonesContiguous(out, maxHR)
}

/**
 * P0.6 — zone bands must tile the HR spectrum with no gaps or overlaps.
 * Method JSONs define each zone independently (%LTHR bands), and
 * non-adjacent bands leave dead zones — Roche SWAP's aerobic_threshold
 * tops out at 0.88×LTHR while lactate_threshold starts at 0.92×LTHR, so
 * 155–162 bpm belonged to NO zone: getZoneForHR returned null and the
 * compliance grader couldn't classify time spent there. Close each gap
 * by extending the lower zone's ceiling to meet the next floor (a steady
 * effort just above AeT reads as tempo, not threshold), and trim
 * overlaps the same way. The % labels are re-derived from the adjusted
 * bpm so they stay honest.
 */
function makeZonesContiguous(zones: HRZone[], maxHR: number): HRZone[] {
  const parse = (hr: string): { low: number; high: number } | null => {
    const m = hr.match(/(\d+)\s*[–-]\s*(\d+)/)
    return m ? { low: parseInt(m[1], 10), high: parseInt(m[2], 10) } : null
  }
  const out = zones.map(z => ({ ...z }))
  for (let i = 0; i < out.length - 1; i++) {
    const cur = parse(out[i].hr)
    const next = parse(out[i + 1].hr)
    if (!cur || !next) continue
    if (cur.high !== next.low - 1) {
      const newHigh = next.low - 1
      if (newHigh <= cur.low) continue // malformed bands — leave untouched
      out[i] = {
        ...out[i],
        hr: `${cur.low}–${newHigh}`,
        pct: `${Math.round((cur.low / maxHR) * 100)}–${Math.round((newHigh / maxHR) * 100)}%`,
      }
    }
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

/**
 * Compute a per-week duration window for an easy or recovery run.
 *
 * The method-level `approxDurationMinutes` is a method-wide range like
 * 30–90 min — useful as a guardrail but useless to a runner trying to
 * plan an actual workout. This helper narrows the window using:
 *
 *   - This week's running volume (totalMi) minus the long run, split
 *     evenly across the easy / recovery days in the week's pattern.
 *   - The athlete's easy-zone pace (when known) to translate miles → minutes.
 *
 * The result naturally ramps with the mileage progression — early weeks
 * show shorter easy runs, peak weeks show longer ones — and stays inside
 * the method's stated bounds so we never recommend something the method
 * explicitly avoids.
 */
/** Relative size of an easy day within its week, per the method author's
 *  `volumeModifier` (previously declared in the JSONs but never read —
 *  which is how a race-week "short shakeout" got sized like a full easy
 *  day). Unset days weigh 1. */
const VOLUME_MODIFIER_WEIGHT: Record<string, number> = { short: 0.6, medium: 1, long: 1.4 }

function modifierWeight(d: DaySchedule): number {
  return VOLUME_MODIFIER_WEIGHT[d.volumeModifier ?? 'medium'] ?? 1
}

function computeEasyRunTime(
  schedule: DaySchedule[],
  weekMi: WeekMileage,
  paces: ResolvedPaces,
  fallback: { min: number; max: number },
  daySchedule?: DaySchedule,
): { min: number; max: number } {
  // The pre-race shakeout is a fixed short dose, never a share of the
  // week's mileage budget (P0.4 — v1 sized it like a full easy day and
  // prescribed 66-80 min the day before the race).
  if (daySchedule?.isPreRaceShakeout) return { min: 15, max: 20 }

  const easyDays = schedule.filter(
    d => d.category === 'easy' || d.category === 'recovery',
  )
  if (easyDays.length === 0 || weekMi.totalMi <= 0) return fallback

  const easyMiTotal = Math.max(0, weekMi.totalMi - weekMi.longRunMi)
  // Split the week's easy miles across easy days weighted by the authored
  // volumeModifier, so a "short" day is genuinely shorter than its
  // siblings instead of an even N-way split.
  const totalWeight = easyDays.reduce((s, d) => s + modifierWeight(d), 0)
  const share = daySchedule
    ? modifierWeight(daySchedule) / totalWeight
    : 1 / easyDays.length
  const milesPerEasy = easyMiTotal * share
  if (milesPerEasy <= 0) return fallback

  const { fastSec, slowSec } = easyPaceSecBounds(paces)
  const minMinutes = Math.round((milesPerEasy * fastSec) / 60)
  const maxMinutes = Math.round((milesPerEasy * slowSec) / 60)

  // Clamp inside the method's stated window so we never advertise a
  // duration the method's authors explicitly designed against.
  const lo = Math.max(fallback.min, Math.min(minMinutes, maxMinutes))
  const hi = Math.min(fallback.max, Math.max(minMinutes, maxMinutes))
  if (hi < lo) {
    // The computed window falls entirely outside the method's bounds — the
    // week's pattern gave its mileage too few (or too many) easy days. Pin
    // to the nearest bound rather than regurgitating the method-wide
    // placeholder range (the "Wednesday: 30–90 min" bug): the session is
    // capped at what the method allows, and the weekly summary counts the
    // capped session, so the plan stays internally consistent.
    return minMinutes > fallback.max
      ? { min: fallback.max, max: fallback.max }
      : { min: fallback.min, max: fallback.min }
  }
  return { min: lo, max: hi }
}

/**
 * Easy / long-run pace bounds (sec/mile) for translating miles → minutes.
 * The slower (higher) bound gives the longer time; the faster bound the
 * shorter. Guards against implausible (corrupt) pace data and falls back to a
 * typical recreational easy pace when no usable anchor exists.
 */
function easyPaceSecBounds(paces: ResolvedPaces): { fastSec: number; slowSec: number } {
  const easy = paces.byZone.easy
  if (isDisplayablePace(easy?.paceSecPerMileLow, easy?.paceSecPerMileHigh)) {
    return { fastSec: easy!.paceSecPerMileHigh!, slowSec: easy!.paceSecPerMileLow! }
  }
  return { fastSec: 540, slowSec: 600 } // 9:00–10:00/mi
}

/**
 * Per-week duration window for the long run, from the week's actual long-run
 * distance × easy/long pace — so the card shows e.g. "~150–175 min" for a
 * 13 mi long run instead of the method-wide 60–360 placeholder. Clamped into
 * the method's stated window. Mirrors `computeEasyRunTime` but keys off
 * `longRunMi` (the long run is one effort, not split across easy days).
 */
function computeLongRunTime(
  weekMi: WeekMileage,
  paces: ResolvedPaces,
  fallback: { min: number; max: number },
): { min: number; max: number } {
  const miles = weekMi.longRunMi
  if (miles <= 0) return fallback
  const { fastSec, slowSec } = easyPaceSecBounds(paces)
  const minMinutes = Math.round((miles * fastSec) / 60)
  const maxMinutes = Math.round((miles * slowSec) / 60)
  if (minMinutes <= 0) return fallback
  // Unlike easy runs we do NOT floor at the method's stated minimum: an early
  // 4-mi long run is legitimately ~45 min, and flooring it to the method's
  // 60-min "typical long run" min (then failing the lo<=hi check) is exactly
  // what produced the useless 60–360 placeholder. Only cap the upper bound so
  // a big ultra long run never exceeds the method's max.
  const lo = Math.min(minMinutes, maxMinutes)
  const hi = Math.min(fallback.max, Math.max(minMinutes, maxMinutes))
  return { min: lo, max: Math.max(lo, hi) }
}

const MI_PER_UNIT: Record<string, number> = { mi: 1, km: 0.621371, m: 0.000621371 }

/** Midpoint pace (sec/mile) for a segment: its own target when displayable,
 *  else the athlete's easy band, else a 9:35 default. */
function segmentPaceSecPerMile(seg: PlannedSegment, paces: ResolvedPaces): number {
  const t = seg.paceTarget
  if (isDisplayablePace(t?.paceSecPerMileLow, t?.paceSecPerMileHigh)) {
    return (t!.paceSecPerMileLow! + t!.paceSecPerMileHigh!) / 2
  }
  const { fastSec, slowSec } = easyPaceSecBounds(paces)
  return (fastSec + slowSec) / 2
}

/** Estimated running miles a workout actually prescribes — distance segments
 *  verbatim, duration segments via their pace target, timed recoveries at
 *  easy pace. */
function estimateWorkoutMiles(pw: PlannedWorkout, paces: ResolvedPaces): number {
  let miles = 0
  for (const seg of pw.segments) {
    const reps = seg.reps ?? 1
    if (seg.distance) {
      miles += seg.distance.value * (MI_PER_UNIT[seg.distance.unit] ?? 1) * reps
    } else if (seg.duration) {
      const minutes = (seg.duration.unit === 'sec' ? seg.duration.value / 60 : seg.duration.value) * reps
      miles += minutes / (segmentPaceSecPerMile(seg, paces) / 60)
    }
    if (seg.reps && seg.recovery?.duration) {
      const rec = seg.recovery.duration
      const recMinutes = (rec.unit === 'sec' ? rec.value / 60 : rec.value) * seg.reps
      const { fastSec, slowSec } = easyPaceSecBounds(paces)
      miles += recMinutes / ((fastSec + slowSec) / 2 / 60)
    }
  }
  return miles
}

/**
 * P0.2 — the weekly total the athlete sees is the SUM of what the week's
 * sessions actually prescribe, quality work included. (v1 displayed the
 * top-down planning target, which only easy + long runs consume — so
 * every AnT / interval / hill session was invisible in the totals and
 * "24.2 mi" peak weeks really carried ~38 mi of running.)
 */
function summedWeekRunMiles(days: PlannedDay[], paces: ResolvedPaces): number {
  const total = days.reduce(
    (sum, d) => sum + (d.plannedWorkout ? estimateWorkoutMiles(d.plannedWorkout, paces) : 0),
    0,
  )
  return Math.round(total * 10) / 10
}

/**
 * Suggest a venue / route hint based on the workout category and the
 * equipment the athlete said they have access to during onboarding. Pure
 * UI hint — empty string when no useful suggestion can be made.
 */
function venueHintFor(
  category: WorkoutCategory,
  equipment: readonly string[] | undefined,
): string {
  if (!equipment || equipment.length === 0) return ''
  const has = (e: string) => equipment.includes(e)
  switch (category) {
    case 'speed_repetitions':
    case 'vo2_intervals':
      return has('track') ? 'Track preferred' : has('treadmill') ? 'Treadmill or measured loop' : 'Flat measured loop'
    case 'hills':
      return has('hills') ? 'Hill route' : has('treadmill') ? 'Treadmill incline' : 'Hilly section if available'
    case 'long':
      return has('trails') ? 'Trails preferred' : ''
    default:
      return ''
  }
}

function buildPlannedDay(
  date: string,
  daySchedule: DaySchedule,
  paces: ResolvedPaces,
  weekMi: WeekMileage,
  workout: Workout | null,
  plannedWorkout: PlannedWorkout | null,
  substitutionNote?: string,
  weekSchedule?: DaySchedule[],
  equipment?: readonly string[],
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
  // Personalize the displayed duration for easy / recovery runs so each
  // week shows a tighter, mileage-aware range instead of the method's
  // wide method-level window (e.g. 30–90 min). Quality workouts keep
  // the method's range because their structure (intervals, recovery,
  // etc.) is what determines the duration, not weekly mileage.
  const category = plannedWorkout.category
  // Personalize the displayed duration from the week's actual volume:
  //  - long runs → from this week's long-run distance × easy/long pace
  //  - easy / recovery → from the week's easy miles split across easy days
  // Quality workouts keep the method's range (their structure sets the time).
  const timeRange =
    category === 'long'
      ? computeLongRunTime(weekMi, paces, plannedWorkout.approxDurationMinutes)
      : (category === 'easy' || category === 'recovery') && weekSchedule
        ? computeEasyRunTime(weekSchedule, weekMi, paces, plannedWorkout.approxDurationMinutes, daySchedule)
        : plannedWorkout.approxDurationMinutes
  // P0.1 — one duration per session: rescale the workout's flexible steady
  // segments to the computed session time, so the header, the step list,
  // the PDF, and the Garmin push all agree. (v1 shipped "42-50 min"
  // headers over verbatim method-template steps reading "150 min".)
  const sizedWorkout =
    category === 'long' || category === 'easy' || category === 'recovery'
      ? scaleWorkoutToTime(plannedWorkout, timeRange)
      : plannedWorkout
  return {
    day: formatDayLabel(date),
    type,
    workout: sizedWorkout.displayName ?? sizedWorkout.name,
    detail: buildDetailString(sizedWorkout, paces, weekMi)
      + (substitutionNote ? ` · ${substitutionNote}` : ''),
    zone: target ? formatZoneString(target) : '—',
    route: venueHintFor(category, equipment),
    time: timeRange.min === timeRange.max ? `${timeRange.min} min` : `${timeRange.min}-${timeRange.max} min`,
    plannedWorkout: sizedWorkout,
  }
}

function buildRaceInfo(config: OnboardingConfig): RaceInfo {
  const dist = config.raceDistance ? RACE_DISTANCE_LABELS[config.raceDistance] : { label: '', miles: 0 }
  // Structured race vert — from the onboarding field or parsed from the free-text
  // description — so the plan can prescribe climbing/descending work (R1).
  const vertFt = configVertGainFt(config)
  return {
    name: config.raceName || 'Goal Race',
    date: config.raceDate || '',
    startTime: '',
    distance: dist.label,
    distanceMiles: dist.miles,
    elevation: vertFt > 0 ? `${vertFt} ft` : '',
    ...(vertFt > 0 ? { elevationGainFt: vertFt } : {}),
    elevationRange: '',
    course: '',
    cutoff: '',
    landmarks: [],
    gear: [],
    nutrition: '',
    description: config.raceDescription,
  }
}

function buildAthleteProfile(
  config: OnboardingConfig,
  currentWeeklyMileage: number,
  effectiveDaysPerWeek: number,
): AthleteProfile {
  const maxHR = computeMaxHR(config)
  return {
    name: config.athleteName,
    maxHR,
    currentBase: `~${currentWeeklyMileage} mi/wk`,
    weeklyStructure: `${effectiveDaysPerWeek} days/week`,
    ftpWatts: config.ftpWatts,
    equipmentAccess: config.equipmentAccess,
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
        // Returning (cleared, easing back): keep the start at/below current and
        // ramp gently, but not so gently the build never reaches race-ready
        // volume. 8%/wk (vs the 5% used for actively-injured) lets an 18-week
        // half build from ~current up to a real race peak + near-race-distance
        // long run by taper, while still honoring the every-N-week cutbacks.
        mileageAdjust: { startPctMultiplier: 0.8, maxWeeklyIncreasePctCap: 0.08 },
        forceEasyLeadInWeeks: INJURY_LEADIN_WEEKS.returning,
      }
    case 'current':
      return {
        maxTrainingDaysPerWeek: 3,
        mileageAdjust: { startPctMultiplier: 0.7, maxWeeklyIncreasePctCap: 0.03 },
        forceEasyLeadInWeeks: INJURY_LEADIN_WEEKS.current,
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
  // Athlete-chosen plan start: everything downstream that reasons from
  // "today" (runway clamp, base-week fill, feasibility) reasons from the
  // start date instead. Clamped one-way — a past start never back-dates.
  today = effectivePlanStart(config.planStartDate, today)
  // ── Fitness anchor & goal (computed up front so paces can use them) ──────
  // currentVdot from a recent-race anchor (null if none). Guard the goal time
  // against the "2:30" mm:ss/h:mm:ss ambiguity before it becomes a VDOT.
  const currentVdot = athleteCurrentVdot(config)
  const raceMiles = config.raceDistance ? RACE_DISTANCE_LABELS[config.raceDistance].miles : 0
  const goalSeconds = raceMiles > 0 ? sanitizeRaceTimeSeconds(config.goalRaceTimeSeconds, raceMiles) : null
  const rawGoalVdot = goalSeconds != null
    ? vdotFromRace({ distanceMiles: raceMiles, timeSeconds: goalSeconds })
    : null

  // Never silently drop the goal: with a goal time but NO recent result, build
  // paces FROM the goal (an advisory flags they're goal-derived) rather than
  // falling back to RPE/HR with the goal effectively ignored.
  const goalOnly = currentVdot == null && rawGoalVdot != null
  const paces = goalOnly
    ? resolvePaces(method, config, { vdotOverride: rawGoalVdot! })
    : resolvePaces(method, config)

  // Runway guard: snap to the method's supported lengths, then clamp so the
  // back-counted calendar can never start before today (a race closer than the
  // method minimum compresses into the weeks actually available).
  const snappedWeeks = chooseTotalWeeks(method, config.raceDate || undefined, today)
  let coreWeeks = snappedWeeks
  let baseWeeks = 0
  if (config.raceDate) {
    const weeksAvailable = Math.floor(daysBetween(mondayOnOrBefore(today), mondayOnOrBefore(config.raceDate)) / 7) + 1
    if (weeksAvailable < coreWeeks) {
      coreWeeks = Math.max(1, weeksAvailable) // P0-1 short runway: compress, never back-date
    } else {
      // P2-8 long runway: fill the gap with foundation base weeks (capped) so the
      // plan starts ~today, not weeks in the future. The −1 absorbs the calendar's
      // "start this week" allowance, so an exactly-right runway adds no base weeks.
      baseWeeks = Math.min(Math.max(0, weeksAvailable - 1 - coreWeeks), 16)
    }
  }
  const totalWeeks = coreWeeks + baseWeeks
  const currentWeeklyMileage = estimateCurrentWeeklyMileage(config)
  const policy = injuryPolicyFor(config.injuryStatus)
  const coreBlocks = allocatePhaseWeeks(method, coreWeeks)
  const coreMileage = buildWeeklyMileage(method, coreWeeks, coreBlocks, currentWeeklyMileage, policy.mileageAdjust, {
    raceDistance: config.raceDistance,
    // Slow end of the easy zone (sec/mile) — used to translate the long-run
    // time cap into a distance for this athlete.
    easyPaceSecPerMile: paces.byZone.easy?.paceSecPerMileLow,
  })
  // Front-pad steady base weeks for a long runway. The per-week loop reads each
  // week's phase from the mileage row below, so no separate block list is needed.
  const mileage = baseWeeks > 0
    ? [
        ...Array.from({ length: baseWeeks }, (_, i) => ({
          weekIndex: i, weekNumber: i + 1,
          totalMi: coreMileage[0].totalMi, longRunMi: coreMileage[0].longRunMi,
          isCutback: false, isTaper: false, phaseId: coreBlocks[0].phaseId,
        })),
        ...coreMileage.map(w => ({ ...w, weekIndex: w.weekIndex + baseWeeks, weekNumber: w.weekNumber + baseWeeks })),
      ]
    : coreMileage
  const methodExp = mapToMethodExperience(config.experienceLevel)

  // Preferred long-run weekday (1=Mon…7=Sun), when the athlete chose one.
  const longRunDow = config.longRunDay
    ? LONG_RUN_DOW[config.longRunDay.trim().toLowerCase()]
    : undefined

  // Goal-pace personalization: when BOTH a current anchor and a goal exist and
  // the goal is a stretch, sharpen quality paces from current → goal across the
  // block, capped at ~8% VDOT (the most a focused block tends to yield).
  const goalIsStretch = rawGoalVdot != null && currentVdot != null && rawGoalVdot > currentVdot
  const goalPaces = goalIsStretch
    ? resolvePaces(method, config, { vdotOverride: Math.min(rawGoalVdot!, currentVdot! * 1.08) })
    : null
  const lastBuildWeekIndex = Math.max(1, totalWeeks - method.taper.durationWeeks - 1)

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
  // Prefer the explicit per-week count when set; fall back to "1 if any
  // modalities are selected" so older configs without crossTrainingDaysPerWeek
  // still schedule a cross session (legacy behavior).
  const explicitCrossDays = config.crossTrainingDaysPerWeek
  const legacyCrossDays = (config.crossTrainingModes && config.crossTrainingModes.length > 0) ? 1 : 0
  const wantCross = explicitCrossDays != null ? explicitCrossDays : legacyCrossDays
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

  // Strength + cross-training fit inside the athlete's TOTAL day budget.
  // Onboarding sells trainingDaysPerWeek as a total ("Includes runs,
  // strength, and cross-training"), so extras only get whatever the
  // running pattern left of that total (the field bug: a 5-day athlete
  // with 3 extras got 4 runs + 3 extras = 7-day weeks with no rest).
  // Two floors survive the budget:
  //   - the method's running minimum (patterns below it don't exist);
  //   - ONE extra slot when extras were explicitly requested — silently
  //     dropping the strength day the athlete just clicked was its own
  //     field bug. When that floor forces the week past the requested
  //     total, we say so in a plan advisory instead of hiding it.
  // When the budget can't fit every requested extra, injectExtraDays
  // alternates which kind gets the scarce slot week to week.
  const extrasBudget = Math.max(0, requestedTotalDays - runningDaysTarget)
  const extrasFloor = extrasRequested > 0 ? 1 : 0
  const extrasInWeekCap = Math.max(0, 7 - runningDaysTarget)
  const extrasCap = Math.min(extrasRequested, Math.max(extrasBudget, extrasFloor), extrasInWeekCap)

  const raceDateAnchor = config.raceDate || addDays(today, totalWeeks * 7)
  // Anchor every week to the Monday of race week, then count back. This puts
  // the race on its true weekday in the final week and makes dayOfWeek 1..7
  // line up with Mon..Sun in every prior week (fixing the off-by-one that
  // pushed long runs a day early).
  const raceMonday = mondayOnOrBefore(raceDateAnchor)

  // R1 — race climb density drives the climbing/descending prescription. Use a
  // nominal distance for mountain ultras (whose RACE_DISTANCE_LABELS miles is 0)
  // so a structured/described vert still yields a per-mile density.
  const raceForVert = buildRaceInfo(config)
  const raceVertGain = raceVertGainFt(raceForVert)
  const effRaceMiles = raceForVert.distanceMiles > 0 ? raceForVert.distanceMiles : 31
  const vertFtPerMi = raceVertGain > 0 ? raceVertGain / effRaceMiles : 0
  const isClimby = isClimbyDensity(vertFtPerMi)

  // R3 — heat preparation fires from the race description (R13 altitude is an
  // advisory only). Fueling (R2) scales with the race's effective distance.
  const raceIsHot = detectHeat(config)

  const weeks: TrainingWeek[] = []

  for (let w = 0; w < totalWeeks; w++) {
    const weekMi = mileage[w]
    const weekStart = addDays(raceMonday, -(totalWeeks - 1 - w) * 7)
    // Per-week pace targets: blend current → goal fitness for quality zones as
    // the build progresses (falls back to current-fitness paces when no goal).
    const weekPaces = goalPaces
      ? blendGoalPaces(paces, goalPaces, Math.min(1, w / lastBuildWeekIndex))
      : paces

    const isFinalWeek = w === totalWeeks - 1
    // Race week uses the method's raceWeekSchedule, remapped so the race
    // entry lands on the race's actual weekday (methods author it as
    // Sunday; the race may be any day). No configured race date → schedule
    // as authored (open-ended plans keep their Sunday convention).
    const schedule: DaySchedule[] = isFinalWeek && method.taper.raceWeekSchedule.length > 0
      ? (config.raceDate
          ? remapRaceWeekSchedule(method.taper.raceWeekSchedule, mondayIndexOf(config.raceDate))
          : method.taper.raceWeekSchedule)
      : (pickWeeklyPattern(method, weekMi.phaseId, runningDaysTarget, weekMi.isCutback)?.schedule ?? [])

    // Injury lead-in: rewrite intensity categories to 'easy' during the
    // first N weeks so a returning athlete doesn't get dropped straight
    // into tempo/intervals. Long runs and recovery runs are left alone.
    // The pinned-workout ids must go too — the picker honors
    // preferredWorkoutIds before category, so leaving them meant a day
    // whose label said easy still carried the full VO2 body (the field
    // report's "intensity stays easy" note over 30-30s).
    const isLeadIn = !isFinalWeek && policy.forceEasyLeadInWeeks > 0 && w < policy.forceEasyLeadInWeeks
    const adjustedSchedule: DaySchedule[] = isLeadIn
      ? schedule.map(d => FORCE_EASY_CATEGORIES.has(d.category)
          ? { ...d, category: 'easy' as WorkoutCategory, preferredWorkoutIds: undefined, leadInEased: true }
          : d)
      : schedule

    // Honor the athlete's preferred long-run weekday on normal weeks. Race
    // week is hand-authored (taper.raceWeekSchedule) and left untouched.
    const weekSchedule = (!isFinalWeek && longRunDow != null)
      ? remapLongRunDay(adjustedSchedule, longRunDow)
      : adjustedSchedule

    const days: PlannedDay[] = []
    for (const daySched of weekSchedule) {
      const dayOffset = (daySched.dayOfWeek - 1)  // dayOfWeek 1..7 → Mon..Sun
      const date = addDays(weekStart, dayOffset)
      // Race day is hard-stamped, never resolved. The picker substitutes a
      // race_pace slot away when the method's race workout doesn't clear the
      // athlete's level/mileage gates (field bug: the anchor race day read
      // "Easy · Substituted higdon_easy_run"). Mirrors the Hyrox generator's
      // guaranteed card.
      if (isFinalWeek && daySched.category === 'race_pace') {
        days.push({
          day: formatDayLabel(date),
          type: 'race',
          workout: `RACE DAY — ${config.raceName || raceForVert.name || 'Race'}`,
          detail: 'Race day. Nothing new — rehearsed gear, fueling, and pacing only. Start controlled and run your plan.',
          zone: '—',
          route: config.raceName || 'Race venue',
          time: '—',
        })
        continue
      }
      const picked = pickWorkoutForDay(method, daySched, methodExp, weekMi.totalMi)
      const built = picked
        ? buildPlannedDay(date, daySched, weekPaces, weekMi, picked.workout,
            buildPlannedWorkout(method, picked.workout, weekPaces, picked.reason),
            picked.reason, weekSchedule, config.equipmentAccess)
        : buildPlannedDay(date, daySched, weekPaces, weekMi, null, null, undefined, weekSchedule, config.equipmentAccess)
      days.push(daySched.leadInEased ? { ...built, leadInEased: true } : built)
    }
    // Sort by dayOfWeek (Mon..Sun) — schedule is already in order but be defensive
    days.sort((a, b) => DAY_OF_WEEK_LABELS.indexOf(a.day.split(' ')[0] as (typeof DAY_OF_WEEK_LABELS)[number])
                       - DAY_OF_WEEK_LABELS.indexOf(b.day.split(' ')[0] as (typeof DAY_OF_WEEK_LABELS)[number]))

    const phase = method.phases.find(p => p.id === weekMi.phaseId)

    // Slot user-selected strength + cross-training onto rest days, capped
    // by the total-days budget so we never exceed `trainingDaysPerWeek`.
    // Race week skips injection — its schedule is hand-authored in the
    // method's taper.raceWeekSchedule and shouldn't be edited.
    // Per-week extras budget: a cutback/recovery (or 6-day) pattern can run
    // MORE days than the plan-level target — those weeks skip their extra
    // rather than overshoot the athlete's total. The allowance is the
    // requested total, +1 only when the method's running minimum makes
    // overshoot unavoidable plan-wide (the advisory case) — so weeks never
    // exceed the requested total by more than one day, ever.
    const weekRunDays = days.filter(d => d.type !== 'rest').length
    const overshootUnavoidable = runningDaysTarget + Math.min(extrasFloor, extrasCap) > requestedTotalDays
    const weekAllowance = requestedTotalDays + (overshootUnavoidable ? 1 : 0)
    const weekMaxExtras = Math.min(extrasCap, Math.max(0, weekAllowance - weekRunDays))
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
          { maxExtras: weekMaxExtras },
        )
    // Stamp the week's drill day (first easy run) so the UI can surface the
    // running-drills + Myrtl tip on the right day without a hard-coded date map.
    const drillIdx = withExtras.findIndex(d => d.type === 'run')
    if (drillIdx >= 0) withExtras[drillIdx] = { ...withExtras[drillIdx], isDrillDay: true }

    // R1 — emit weekly vert targets on the long run + schedule downhill / quad-
    // seasoning sessions through build/peak (flat races pass through unchanged).
    let withVert = applyVertPrescription(withExtras, {
      vertFtPerMile: vertFtPerMi,
      isClimby,
      longRunMi: weekMi.longRunMi,
      isTaper: weekMi.isTaper,
      weekIndex: w,
      peakWeekIndex: lastBuildWeekIndex,
    })
    // R2 — fueling targets on long runs (rehearsal 4–6 wk out); R3 — heat block
    // on an easy day in the final ~2 weeks. weeksToRace counts back from race week.
    const weeksToRace = totalWeeks - (w + 1)
    withVert = applyFuelingToWeek(withVert, effRaceMiles, weeksToRace, {
      longRunMi: weekMi.longRunMi,
      easyPaceMinPerMile: weekPaces.byZone.easy?.paceSecPerMileLow != null
        ? weekPaces.byZone.easy.paceSecPerMileLow / 60
        : undefined,
    })
    withVert = applyHeatBlock(withVert, raceIsHot, weeksToRace)
    // R4 — dress-rehearsal predictor 4–6 wk out; R7 — power-hiking on climby races.
    withVert = applyPredictorRehearsal(withVert, effRaceMiles, weeksToRace)
    withVert = applyPowerHike(withVert, isClimby, weekMi.isTaper)
    withVert = applyTimeOnFeet(withVert, config.raceType === 'trail') // R14 — trail-first framing

    // The final week ends AT race day — after the race-week remap there are
    // no plan days past it, and the header must not advertise a Sunday the
    // week no longer contains.
    const weekEndOffset = isFinalWeek && config.raceDate
      ? mondayIndexOf(config.raceDate) - 1
      : 6
    weeks.push({
      num: w + 1,
      startIso: weekStart,
      dates: `${formatDayLabel(weekStart)} – ${formatDayLabel(addDays(weekStart, weekEndOffset))}`,
      miles: summedWeekRunMiles(withVert, weekPaces),
      targetMi: weekMi.totalMi,
      focus: weekMi.isTaper
        ? 'Taper'
        : weekMi.isCutback
          ? 'Cutback'
          : (phase?.name ?? 'Build'),
      days: withVert,
    })
  }

  const effectiveDaysPerWeek = runningDaysTarget + extrasCap
  const athlete = buildAthleteProfile(config, currentWeeklyMileage, effectiveDaysPerWeek)
  const advisories = [...assessFeasibility(config, today, method), ...environmentAdvisories(config)]
  // Honesty over silence: when the method's running floor + the one
  // guaranteed extra can't fit the requested total, tell the athlete why
  // the header shows a bigger number than they picked.
  if (effectiveDaysPerWeek > requestedTotalDays) {
    advisories.push({
      id: 'days_over_request',
      severity: 'info',
      title: 'One more day than requested',
      detail: `${method.name} needs at least ${runningDaysTarget} running days, and you asked for strength/cross-training too — so weeks run ${effectiveDaysPerWeek} days instead of ${requestedTotalDays}. Pick a lower-mileage method or drop the extras to get back to ${requestedTotalDays}.`,
    })
  }
  return {
    athlete,
    weeks,
    zones: computeZones(athlete.maxHR, paces, method),
    race: raceForVert,
    ...(advisories.length > 0 ? { advisories } : {}),
  }
}
