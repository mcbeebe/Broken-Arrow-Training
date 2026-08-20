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
  capTaperBlocks,
  TAPER_WEEKS_CAP,
  REFERENCE_PEAK_FLOOR_MI,
  type MileageProgressionAdjust,
} from './weekPlan'
import { pickWeeklyPattern, pickWorkoutForDay, buildPlannedWorkout, scaleWorkoutToTime } from './workouts'
import { MASTERS_AGE_TIERS, MASTERS_RECOVERY_CADENCE, MASTERS_RAMP_CAP, SENIOR_INTENSITY, SENIOR_LONG_RUN_CAP_MULT, DAYS_VOLUME_FACTOR } from '../running/heuristics'
import { invariantRulesFor } from './methodInvariants'
import { bestMethodForDistance, suggestLighterMethod } from './methodSelection'
import { injectExtraDays, isHardStrengthSession } from './extraDays'
import { INJURY_LEADIN_WEEKS } from '../../utils/injuryRamp'
import { assessFeasibility, predictRaceTime } from './feasibility'
import { validatePlan, qaFindingsToAdvisories } from '../planQA/validatePlan'
import { prehabBlockFor, descentCautionFor } from './prehab'
import { effectivePlanStart } from '../../utils/planDates'
import { computeMaxHR } from '../../utils/heartRate'
import { configVertGainFt, raceVertGainFt } from '../../utils/raceVert'
import { applyVertPrescription, isClimbyDensity } from './vertPrescription'
import { applyFuelingToWeek } from '../../utils/fueling'
import { detectHeat, environmentAdvisories, applyHeatBlock } from '../../utils/environmentPrep'
import { heatFactorFor } from '../running/heuristics'
import { SCREENING_COPY } from '../running/screeningCopy'
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
    // R0 — a race-PACE workout is a quality session, not a race. Typing it
    // 'race' made every weekly Higdon/Galloway pace day a *** RACE DAY ***
    // in the PDF and fired false qa_d1_load errors on the long run before
    // it. The real race day is hard-stamped type 'race' in the week loop.
    case 'race_pace':      return 'quality'
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
  // R0 — move only the PRIMARY long run (the last-authored one). Patterns
  // like Pfitzinger's carry a midweek medium-long AND a weekend long; the
  // old `category === 'long'` map moved BOTH onto the preferred weekday,
  // emitting two identical days on the same date. Exactly one occupant of
  // the target weekday swaps back into the long run's original slot.
  const longDays = schedule.filter(d => d.category === 'long')
  const primary = longDays[longDays.length - 1]
  if (!primary || primary.dayOfWeek === desiredDow) return schedule
  const fromDow = primary.dayOfWeek
  let swapped = false
  return schedule.map(d => {
    if (d === primary) return { ...d, dayOfWeek: desiredDow }
    if (d.dayOfWeek === desiredDow && !swapped) {
      swapped = true
      return { ...d, dayOfWeek: fromDow }
    }
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
  weekQualityMi = 0,
): { min: number; max: number } {
  // The pre-race shakeout is a fixed short dose, never a share of the
  // week's mileage budget (P0.4 — v1 sized it like a full easy day and
  // prescribed 66-80 min the day before the race).
  if (daySchedule?.isPreRaceShakeout) return { min: 15, max: 20 }

  const easyDays = schedule.filter(
    d => d.category === 'easy' || d.category === 'recovery',
  )
  if (easyDays.length === 0 || weekMi.totalMi <= 0) return fallback

  // R0 — the easy allocation is what's left of the week AFTER the long run
  // AND the quality sessions. Before this, easy days consumed the full
  // remainder and quality landed on top, so quality-phase weeks overran the
  // ramp-capped target by the entire quality volume (audit root cause A1).
  const longMiTotal = longCategoryMiles(weekMi.longRunMi, Math.max(1, schedule.filter(d => d.category === 'long').length), weekMi.secondaryLongFactor)
  const easyMiTotal = Math.max(0, weekMi.totalMi - longMiTotal - weekQualityMi)
  if (easyMiTotal <= 0) {
    // Quality + long fill the whole budget — keep easy days at the honest
    // minimum dose rather than method-window padding.
    return { min: 15, max: Math.max(20, MIN_EASY_RUN_MIN) }
  }
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
    // week's pattern gave its mileage too few (or too many) easy days.
    // Never regurgitate the method-wide placeholder range (the
    // "Wednesday: 30–90 min" bug). Over the ceiling: cap at the method
    // max — the weekly summary counts the capped session, so the plan
    // stays internally consistent. Under the floor: prescribe the honest
    // short run (min 15 min) instead of padding up to the method
    // minimum — padding inflates low-volume weeks and can make a taper
    // week out-volume the build before it.
    if (minMinutes > fallback.max) return { min: fallback.max, max: fallback.max }
    const shortLo = Math.max(15, Math.min(minMinutes, maxMinutes))
    const shortHi = Math.max(shortLo, Math.min(Math.max(minMinutes, maxMinutes), fallback.max))
    return { min: shortLo, max: shortHi }
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
  gradeAdjFactor = 1,
): { min: number; max: number } {
  const miles = weekMi.longRunMi
  if (miles <= 0) return fallback
  const { fastSec, slowSec } = easyPaceSecBounds(paces)
  // On climby terrain the same miles take longer — displayed duration uses
  // the effort-adjusted pace so "time on feet" is honest (P2).
  const minMinutes = Math.round((miles * fastSec * gradeAdjFactor) / 60)
  const maxMinutes = Math.round((miles * slowSec * gradeAdjFactor) / 60)
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

/** Phase 4 (PRD-108) — slow the aerobic zones by the heat factor. Only
 *  easy/recovery (and their HR-independent pace bounds) adjust; every
 *  quality zone keeps its authored target. */
function applyHeatToAerobicPaces(paces: ResolvedPaces, factor: number): ResolvedPaces {
  const scale = (z?: ResolvedPaces['byZone'][keyof ResolvedPaces['byZone']]) =>
    z && {
      ...z,
      paceSecPerMileLow: z.paceSecPerMileLow != null ? Math.round(z.paceSecPerMileLow * factor) : z.paceSecPerMileLow,
      paceSecPerMileHigh: z.paceSecPerMileHigh != null ? Math.round(z.paceSecPerMileHigh * factor) : z.paceSecPerMileHigh,
    }
  return {
    ...paces,
    byZone: {
      ...paces.byZone,
      ...(paces.byZone.easy ? { easy: scale(paces.byZone.easy) } : {}),
      ...(paces.byZone.recovery ? { recovery: scale(paces.byZone.recovery) } : {}),
    },
  }
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

/** Estimated minutes one segment prescribes (work + its recoveries),
 *  mirroring estimateWorkoutMiles' conventions. */
function segMinutes(seg: PlannedSegment, paces: ResolvedPaces): number {
  const reps = seg.reps && seg.reps > 1 ? seg.reps : 1
  let minutes = 0
  if (seg.duration) {
    minutes += (seg.duration.unit === 'sec' ? seg.duration.value / 60 : seg.duration.value) * reps
  } else if (seg.distance) {
    const mi = seg.distance.value * (MI_PER_UNIT[seg.distance.unit] ?? 1)
    minutes += ((mi * segmentPaceSecPerMile(seg, paces)) / 60) * reps
  }
  if (seg.reps && seg.recovery?.duration) {
    const rec = seg.recovery.duration
    minutes += (rec.unit === 'sec' ? rec.value / 60 : rec.value) * seg.reps
  } else if (seg.reps && seg.recovery?.distance) {
    // Jog recoveries authored as distance (Hansons' mile repeats) take
    // real time too — omitting them made the header undercount the steps
    // (the QA gate's independent estimate counts them).
    const { fastSec, slowSec } = easyPaceSecBounds(paces)
    const mi = seg.recovery.distance.value * (MI_PER_UNIT[seg.recovery.distance.unit] ?? 1)
    minutes += ((mi * (fastSec + slowSec) / 2) / 60) * seg.reps
  }
  return minutes
}

/** Estimated total minutes a workout's steps prescribe. Used to re-derive
 *  an honest header window after a workout is scaled. */
function estimateWorkoutMinutes(pw: PlannedWorkout, paces: ResolvedPaces): number {
  return pw.segments.reduce((s, seg) => s + segMinutes(seg, paces), 0)
}

/**
 * R0 — complete P0.1 for DISTANCE-authored templates. Methods that write
 * easy/long runs as fixed miles ("6 mi easy") ignored the computed session
 * time entirely: scaleWorkoutToTime only rescales flexible minute
 * segments, so the header said 15 min while the steps — and therefore the
 * weekly sum, the QA gate, and the Garmin push — still carried 6 mi. This
 * is why Hansons/Higdon/Galloway weeks summed to ~2× their progression
 * target. Rescale rep-less main distance segments so the steps take the
 * computed session time at the segment's own pace.
 */
function fitDistanceSegmentsToTime(
  pw: PlannedWorkout,
  timeRange: { min: number; max: number },
  paces: ResolvedPaces,
): PlannedWorkout {
  const isMainDist = (s: PlannedSegment) => s.role === 'main' && !!s.distance && !s.reps
  const distSegs = pw.segments.filter(isMainDist)
  if (distSegs.length === 0) return pw
  const fixedMin = pw.segments.filter(s => !isMainDist(s)).reduce((s, seg) => s + segMinutes(seg, paces), 0)
  const currentDistMin = distSegs.reduce((s, seg) => s + segMinutes(seg, paces), 0)
  if (currentDistMin <= 0) return pw
  const target = (timeRange.min + timeRange.max) / 2
  const factor = Math.max(0, target - fixedMin) / currentDistMin
  if (factor > 0.92 && factor < 1.08) return pw
  const segments = pw.segments.map(s => {
    if (!isMainDist(s)) return s
    return {
      ...s,
      distance: { ...s.distance!, value: Math.max(0.5, Math.round(s.distance!.value * factor * 10) / 10) },
    }
  })
  return { ...pw, segments }
}

/**
 * R0 — the categories whose volume must fit inside the week's mileage
 * budget. Everything the week loop schedules as running EXCEPT easy /
 * recovery / long (those are already sized FROM the budget) and strides
 * (a tiny garnish on easy days).
 */
const QUALITY_BUDGET_CATEGORIES: ReadonlySet<WorkoutCategory> = new Set<WorkoutCategory>([
  'tempo', 'cruise_intervals', 'vo2_intervals', 'speed_repetitions',
  'fartlek', 'hills', 'progression', 'time_trial', 'race_pace',
])

/** Minimum honest easy-run dose (minutes) — the floor the budget reserves
 *  per easy day and the duration an easy day falls back to when quality +
 *  long consume the whole week. */
const MIN_EASY_RUN_MIN = 20

/** Phase 1 (PRD-102-F1, pulled forward) — second and subsequent long-
 *  category days are sized at this fraction of the primary long run.
 *  Standard back-to-back practice (and Pfitzinger's medium-long) runs the
 *  second day at 60-75% of the first; sizing both at 100% let a two-long
 *  week put 80% of its volume on the weekend. */
const SECONDARY_LONG_FACTOR = 0.7

/** Total long-category miles for a week: primary at full longRunMi, each
 *  additional long day at the secondary factor. */
function longCategoryMiles(longRunMi: number, longDayCount: number, secondaryFactor = SECONDARY_LONG_FACTOR): number {
  if (longDayCount <= 0) return 0
  return longRunMi * (1 + secondaryFactor * (longDayCount - 1))
}

/**
 * R0 — fit a quality workout inside the week's volume budget by scaling its
 * MAIN work: rep counts come down proportionally (floor 2 so an interval
 * session stays an interval session), rep-less main distance/duration
 * segments scale directly (with floors that keep a real stimulus). Warm-up
 * and cool-down shrink too, on a gentler floor — on a 10 mi/wk athlete a
 * fixed 1.5 mi warm-up + 1 mi cool-down alone can exceed the entire
 * quality budget. The header window is re-derived from the scaled steps
 * so the card, the QA gate, and the Garmin push all agree.
 *
 * This is what makes the weekly ramp REAL: before it, quality templates
 * landed at full method size regardless of the week's ramp-capped target,
 * so every base→build phase boundary was a volume cliff (+36–119% across
 * all nine methods — the audit's root cause A1). A 10 mi/wk athlete now
 * gets 2×1km, not 5×1km, exactly as the methods' own volume invariants
 * intend.
 */
/** PlannedDay types that make a calendar day HARD (PRD-000 §0.E). Hard
 *  strength days are classified separately via isHardStrengthSession. */
const HARD_DAY_TYPES: ReadonlySet<string> = new Set(['quality', 'long', 'race'])

/** DaySchedule categories that make a day HARD at schedule time. */
function isHardCategory(c: WorkoutCategory): boolean {
  return QUALITY_BUDGET_CATEGORIES.has(c) || c === 'long'
}

/** dayOfWeek of the immovable race-day slot in the final week, else null. */
function raceEntryDow(isFinalWeek: boolean, schedule: DaySchedule[]): number | null {
  if (!isFinalWeek) return null
  const race = [...schedule].reverse().find(d => d.category === 'race_pace')
  return race?.dayOfWeek ?? null
}

/**
 * Phase 1 (PRD-103, Mandate #1) — no plan ever schedules three consecutive
 * HARD days. Operates on the week's DaySchedule (pre-workout-pick) with the
 * previous week's closing two days carried in, so cross-week triples are
 * caught. Repair order (product decision): try to SWAP the offending day
 * with the nearest non-hard day whose new position creates no triple; if
 * no legal swap exists, DEMOTE — quality before long, never race day. In
 * race week (hand-authored) only demote-of-quality is permitted so the
 * authored race-day runway is never reordered.
 */
export function repairConsecutiveHard(
  schedule: DaySchedule[],
  prevTail: [boolean, boolean],
  raceDow: number | null,
): DaySchedule[] {
  // Calendar order, not array order: remapLongRunDay (and any other
  // upstream shuffle) may swap dayOfWeek FIELDS without reordering the
  // array, and adjacency only means anything on the calendar.
  const out = schedule.map(d => ({ ...d })).sort((a, b) => a.dayOfWeek - b.dayOfWeek)
  const hard = (i: number): boolean => {
    if (i < 0) return i === -1 ? prevTail[1] : i === -2 ? prevTail[0] : false
    if (i >= out.length) return false
    return isHardCategory(out[i].category)
  }
  const isRace = (i: number) => raceDow != null && out[i]?.dayOfWeek === raceDow
  const demote = (i: number) => {
    out[i] = {
      ...out[i],
      category: 'easy' as WorkoutCategory,
      preferredWorkoutIds: undefined,
      notes: 'Eased — hard days are capped at two in a row.',
    }
  }
  for (let guard = 0; guard < 14; guard++) {
    let tripleAt = -1
    for (let i = 0; i < out.length; i++) {
      if (hard(i) && hard(i - 1) && hard(i - 2)) { tripleAt = i; break }
    }
    if (tripleAt < 0) break
    const i = tripleAt
    const inWeek = [i, i - 1, i - 2].filter(j => j >= 0 && !isRace(j))
    const pick =
      inWeek.find(j => QUALITY_BUDGET_CATEGORIES.has(out[j].category)) ??
      (raceDow == null ? inWeek.find(j => out[j].category === 'long') : undefined)
    if (pick == null) break // nothing legal to fix (race-week edge)
    let swapped = false
    if (raceDow == null) {
      // Post-swap hardness: the picked slot becomes non-hard once its
      // session moves away. Simulating this (instead of the conservative
      // pre-swap view) lets the swap land in slots adjacent to the old
      // position — usually the closest legal home.
      const hardAfter = (x: number) => (x === pick ? false : hard(x))
      for (let dist = 1; dist < out.length && !swapped; dist++) {
        for (const j of [pick + dist, pick - dist]) {
          if (j < 0 || j >= out.length || swapped) continue
          if (hard(j) || isRace(j)) continue
          // The swap target's new neighbors must not form a fresh triple.
          if (hardAfter(j - 1) && hardAfter(j - 2)) continue
          if (hardAfter(j + 1) && hardAfter(j + 2)) continue
          if (hardAfter(j - 1) && hardAfter(j + 1)) continue
          const keepA = out[pick].dayOfWeek
          const keepB = out[j].dayOfWeek
          const tmp = out[pick]
          out[pick] = { ...out[j], dayOfWeek: keepA }
          out[j] = { ...tmp, dayOfWeek: keepB }
          swapped = true
        }
      }
    }
    if (!swapped) demote(pick)
  }
  return out
}

/** Phase 1 (103-F5) — category-aware minimum warm-up minutes. Budget
 *  scaling may shorten a warm-up only to these floors (or the authored
 *  warm-up, whichever is shorter): harder efforts need longer priming. */
const WARMUP_FLOOR_MIN: Partial<Record<WorkoutCategory, number>> = {
  vo2_intervals: 12, speed_repetitions: 12, time_trial: 12,
  tempo: 10, cruise_intervals: 10, hills: 10, race_pace: 10,
  fartlek: 10, progression: 10,
}

function scaleQualityWorkout(pw: PlannedWorkout, factor: number, paces: ResolvedPaces): PlannedWorkout {
  if (factor >= 0.999) return pw
  const f = Math.max(0.4, factor) // never gut the main set below 40% — QA owns the residual
  const wucd = Math.max(0.6, f)  // warm-up/cool-down floor is gentler
  const segments = pw.segments.map(seg => {
    const segF = seg.role === 'main' ? f : wucd
    if (seg.role === 'main' && seg.reps && seg.reps > 1) {
      return { ...seg, reps: Math.max(2, Math.round(seg.reps * f)) }
    }
    if (seg.distance) {
      return { ...seg, distance: { ...seg.distance, value: Math.max(0.5, Math.round(seg.distance.value * segF * 10) / 10) } }
    }
    if (seg.duration) {
      const val = seg.duration.unit === 'sec' ? seg.duration.value / 60 : seg.duration.value
      return { ...seg, duration: { value: Math.max(seg.role === 'main' ? 8 : 5, Math.round(val * segF)), unit: 'min' as const } }
    }
    return seg
  })
  const next: PlannedWorkout = { ...pw, segments }
  // Phase 1 (103-F5) — category-aware warm-up floor: scaling never cuts a
  // warm-up below the intensity's minimum priming (or the authored warm-up,
  // whichever is shorter). A VO2 session on a 9-min warm-up is an injury
  // setup the generic 60% floor allowed.
  const wuFloor = WARMUP_FLOOR_MIN[next.category]
  if (wuFloor != null) {
    const wuMin = (w: PlannedWorkout) =>
      w.segments.filter(seg => seg.role === 'warmup').reduce((t, seg) => t + segMinutes(seg, paces), 0)
    const authoredWu = wuMin(pw)
    const scaledWu = wuMin(next)
    const target = Math.min(wuFloor, authoredWu)
    if (scaledWu > 0 && scaledWu < target) {
      const lift = target / scaledWu
      next.segments = next.segments.map(seg => {
        if (seg.role !== 'warmup') return seg
        if (seg.distance) return { ...seg, distance: { ...seg.distance, value: Math.round(seg.distance.value * lift * 10) / 10 } }
        if (seg.duration) {
          const val = seg.duration.unit === 'sec' ? seg.duration.value / 60 : seg.duration.value
          return { ...seg, duration: { value: Math.round(val * lift), unit: 'min' as const } }
        }
        return seg
      })
    }
  }
  const minutes = estimateWorkoutMinutes(next, paces)
  if (minutes > 0) {
    next.approxDurationMinutes = {
      min: Math.max(10, Math.round(minutes * 0.95)),
      max: Math.max(12, Math.round(minutes * 1.1)),
    }
  }
  return next
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
  gradeAdjFactor = 1,
  weekQualityMi = 0,
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
      ? computeLongRunTime(weekMi, paces, plannedWorkout.approxDurationMinutes, gradeAdjFactor)
      : (category === 'easy' || category === 'recovery') && weekSchedule
        ? computeEasyRunTime(weekSchedule, weekMi, paces, plannedWorkout.approxDurationMinutes, daySchedule, weekQualityMi)
        : plannedWorkout.approxDurationMinutes
  // P0.1 — one duration per session: rescale the workout's flexible steady
  // segments to the computed session time, so the header, the step list,
  // the PDF, and the Garmin push all agree. (v1 shipped "42-50 min"
  // headers over verbatim method-template steps reading "150 min".)
  const sizedWorkout =
    category === 'long' || category === 'easy' || category === 'recovery'
      ? fitDistanceSegmentsToTime(scaleWorkoutToTime(plannedWorkout, timeRange), timeRange, paces)
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
  const enumDist = config.raceDistance ? RACE_DISTANCE_LABELS[config.raceDistance] : { label: '', miles: 0 }
  // Structured exact distance (P2) overrides the enum snap; keep the enum's
  // human label when one exists, else render the exact miles.
  const exactMi = config.raceDistanceMiles && config.raceDistanceMiles > 0 ? config.raceDistanceMiles : 0
  const dist = exactMi > 0
    ? { label: enumDist.label || `${exactMi} mi`, miles: exactMi }
    : enumDist
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
 * R1 — age-graded policy (docs/running-plan-audit.md, phase R1). Two tiers,
 * constants in engines/running/heuristics.ts:
 *  - masters (>=58): recovery week at least every 3rd; weekly ramp capped
 *    at 8% (parity with the Hyrox engine's MASTERS_RECOVERY);
 *  - senior (>=70): additionally one quality session per week, VO2-max
 *    interval slots substitute to threshold work, and the long-run time
 *    cap tightens 15%.
 * Age previously changed NOTHING in the road path — age 30 and age 79
 * produced byte-identical plans (audit finding B1).
 */
interface MastersPolicy {
  isMasters: boolean
  isSenior: boolean
  cutbackEveryNWeeksCap?: number
  maxWeeklyIncreasePctCap?: number
  maxQualityPerWeek: number
  substituteVo2: boolean
  longRunTimeCapMult?: number
}

function mastersPolicyFor(age: number | undefined): MastersPolicy {
  const tiers = MASTERS_AGE_TIERS.value
  const isMasters = age != null && age >= tiers.masters
  const isSenior = age != null && age >= tiers.senior
  return {
    isMasters,
    isSenior,
    ...(isMasters
      ? {
          cutbackEveryNWeeksCap: MASTERS_RECOVERY_CADENCE.value.cadenceWeeks,
          maxWeeklyIncreasePctCap: MASTERS_RAMP_CAP.value,
        }
      : {}),
    maxQualityPerWeek: isSenior ? SENIOR_INTENSITY.value.maxQualityPerWeek : Infinity,
    substituteVo2: isSenior && SENIOR_INTENSITY.value.substituteVo2,
    ...(isSenior ? { longRunTimeCapMult: SENIOR_LONG_RUN_CAP_MULT.value } : {}),
  }
}

/** VO2-max interval categories the senior policy substitutes away. */
const SENIOR_SUBSTITUTE_CATEGORIES: ReadonlySet<WorkoutCategory> = new Set<WorkoutCategory>([
  'vo2_intervals', 'speed_repetitions',
])

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
  today = effectivePlanStart(config.planStartDate, today, config.planStartPinnedIso)
  // ── Fitness anchor & goal (computed up front so paces can use them) ──────
  // currentVdot from a recent-race anchor (null if none). Guard the goal time
  // against the "2:30" mm:ss/h:mm:ss ambiguity before it becomes a VDOT.
  const currentVdot = athleteCurrentVdot(config)
  // Exact distance (P2 structured input) beats the enum snap: a 13.3 mi trail
  // half is 13.3, not 13.1.
  const raceMiles = config.raceDistanceMiles && config.raceDistanceMiles > 0
    ? config.raceDistanceMiles
    : config.raceDistance ? RACE_DISTANCE_LABELS[config.raceDistance].miles : 0
  const goalSeconds = raceMiles > 0 ? sanitizeRaceTimeSeconds(config.goalRaceTimeSeconds, raceMiles) : null
  const rawGoalVdot = goalSeconds != null
    ? vdotFromRace({ distanceMiles: raceMiles, timeSeconds: goalSeconds })
    : null

  // Never silently drop the goal: with a goal time but NO recent result, build
  // paces FROM the goal (an advisory flags they're goal-derived) rather than
  // falling back to RPE/HR with the goal effectively ignored.
  const goalOnly = currentVdot == null && rawGoalVdot != null
  const pacesRaw = goalOnly
    ? resolvePaces(method, config, { vdotOverride: rawGoalVdot! })
    : resolvePaces(method, config)
  // Phase 4 (PRD-108) — heat-adjusted aerobic paces: easy/recovery bands
  // slow by the registry factor for the athlete's typical training heat
  // (quality paces never adjust — hard sessions go effort-first instead).
  // Applied at the source so cards, duration math, the content ceiling,
  // and the structured watch export all agree.
  const heat = heatFactorFor(config.typicalTrainingTempF)
  const paces = heat.factor > 1 ? applyHeatToAerobicPaces(pacesRaw, heat.factor) : pacesRaw

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
  const masters = mastersPolicyFor(config.age)
  // Injury and masters adjustments compose; the more conservative ramp wins.
  // Phase 4 (PRD-109) — health & energy-availability screen: any yes
  // routes to conservative defaults (ramp ≤5%, plyo suppressed, bone-
  // stress impact hold) + a professional-care advisory. The app informs
  // and routes; it never diagnoses (see screeningCopy.ts).
  const screen = config.healthScreen
  const healthFlagged = !!(screen && (screen.boneStressHistory || screen.boneStressRecent || screen.persistentFatigue || screen.missedCycles))
  const boneStress = !!(screen && (screen.boneStressHistory || screen.boneStressRecent))

  const mileageAdjust: MileageProgressionAdjust = {
    ...policy.mileageAdjust,
    ...(masters.maxWeeklyIncreasePctCap != null
      ? {
          maxWeeklyIncreasePctCap: Math.min(
            policy.mileageAdjust.maxWeeklyIncreasePctCap ?? Infinity,
            masters.maxWeeklyIncreasePctCap,
          ),
        }
      : {}),
    ...(masters.cutbackEveryNWeeksCap != null ? { cutbackEveryNWeeksCap: masters.cutbackEveryNWeeksCap } : {}),
  }
  // Health flag composes via the same strictest-cap-wins min() pattern.
  if (healthFlagged) {
    mileageAdjust.maxWeeklyIncreasePctCap = Math.min(mileageAdjust.maxWeeklyIncreasePctCap ?? Infinity, 0.05)
  }
  // R0 — distance-aware taper cap: shrink an over-allocated taper phase and
  // return the weeks to the build, so a compressed 5K plan doesn't spend
  // half its runway tapering (Jim's 7-week block allocated 3 taper weeks).
  const taperCapWeeks = config.raceDistance ? TAPER_WEEKS_CAP[config.raceDistance] : undefined
  const coreBlocksRaw = allocatePhaseWeeks(method, coreWeeks)
  const coreBlocks = taperCapWeeks != null ? capTaperBlocks(coreBlocksRaw, method, taperCapWeeks) : coreBlocksRaw

  // R1 — race climb density drives the climbing/descending prescription. Use a
  // nominal distance for mountain ultras (whose RACE_DISTANCE_LABELS miles is 0)
  // so a structured/described vert still yields a per-mile density. Computed
  // BEFORE weekly mileage so predicted finish time can size the long run (P2).
  const raceForVert = buildRaceInfo(config)
  const raceVertGain = raceVertGainFt(raceForVert)
  const effRaceMiles = raceForVert.distanceMiles > 0 ? raceForVert.distanceMiles : 31
  const vertFtPerMi = raceVertGain > 0 ? raceVertGain / effRaceMiles : 0
  const isClimby = isClimbyDensity(vertFtPerMi)
  // Effort-adjusted pace multiplier for climby terrain: grade makes flat pace
  // meaningless, so displayed long-run durations (and the duration→miles
  // conversion) run ~10% slower per 100 ft/mi of climb density, capped at
  // 1.5×. A deliberately simple GAP-flavored heuristic — course-profile
  // pacing (Minetti) stays the curated-course path.
  const gradeAdjFactor = isClimby ? Math.min(1.5, 1 + vertFtPerMi / 1000) : 1

  // P2 — predicted finish time (minutes) sizes the long run so the biggest
  // training day scales with how long race day will actually take. VDOT
  // prediction when a race anchor exists; else a conservative estimate from
  // easy pace (race effort ≈ 0.95 × easy). Vert adds ~30 s per 100 ft.
  const easyPaceSecMid = paces.byZone.easy?.paceSecPerMileLow != null && paces.byZone.easy?.paceSecPerMileHigh != null
    ? (paces.byZone.easy.paceSecPerMileLow + paces.byZone.easy.paceSecPerMileHigh) / 2
    : null
  const flatFinishSec = raceForVert.distanceMiles > 0
    ? (currentVdot != null
        ? predictRaceTime(currentVdot, raceForVert.distanceMiles)
        : easyPaceSecMid != null
          ? raceForVert.distanceMiles * easyPaceSecMid * 0.95
          : 0)
    : 0
  const predictedFinishMin = flatFinishSec > 0
    ? Math.round(flatFinishSec / 60 + (raceVertGain / 100) * 0.5)
    : 0

  // Total training-day budget (running + strength + cross), capped by the
  // injury policy so 'returning' doesn't get a 7-day-a-week schedule no
  // matter what was clicked in onboarding.
  // R2 — every week keeps at least one FULL rest day, no matter what was
  // clicked: a 7-day request schedules 6 training days (the sweep's elite
  // persona shipped rest-free weeks straight into a QA error).
  const restDayCappedDays = Math.min(config.trainingDaysPerWeek, 6)
  const requestedTotalDays = policy.maxTrainingDaysPerWeek != null
    ? Math.min(restDayCappedDays, policy.maxTrainingDaysPerWeek)
    : restDayCappedDays

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

  // R1 — availability scaling: weekly volume follows running-day frequency
  // (DAYS_VOLUME_FACTOR: 3 days = 0.75x of the 5-day baseline).
  const volumeFactor = DAYS_VOLUME_FACTOR.value[Math.max(3, Math.min(7, runningDaysTarget))] ?? 1

  // R4 — the method's authored easy-day ceiling (max minutes across its
  // easy-run windows), for the content-ceiling peak cap.
  const easyMaxes = method.workouts
    .filter(w => w.category === 'easy')
    .map(w => w.approxDurationMinutes?.max ?? 0)
    .filter(v => v > 0)
  const methodEasyMaxMin = easyMaxes.length > 0 ? Math.max(...easyMaxes) : undefined

  // R2 — the method's machine-checkable invariants (methodInvariants.ts)
  // steer generation itself: long-run caps below, quality-share budget and
  // experience routing further down. The QA gate re-checks the same rules.
  const invRules = invariantRulesFor(method.id)

  const coreMileage = buildWeeklyMileage(method, coreWeeks, coreBlocks, currentWeeklyMileage, mileageAdjust, {
    raceDistance: config.raceDistance,
    maxTaperWeeks: taperCapWeeks,
    volumeFactor,
    longRunTimeCapMult: masters.longRunTimeCapMult,
    // Slow end of the easy zone (sec/mile) — used to translate the long-run
    // time cap into a distance for this athlete.
    easyPaceSecPerMile: paces.byZone.easy?.paceSecPerMileLow,
    predictedFinishMin,
    gradeAdjFactor,
    methodLongRunPctCap: invRules.longRunMaxPctOfWeek,
    methodLongRunAbsCapMi: invRules.longRunMaxMi,
    runningDays: runningDaysTarget,
    // R4 — the method's own easy-day window sharpens the content ceiling.
    easyDayMaxMin: methodEasyMaxMin,
  })
  // Phase 2 (101-F2/F3) — undertrained-arrival honesty: compare the volume
  // the ramp ACTUALLY reaches against the race-readiness floor (enforced
  // for half/marathon, reference for ultras). When caps legitimately stop
  // the build short, the athlete is told — never silently sent to the line
  // under-prepared.
  const readinessFloorMi = config.raceDistance ? REFERENCE_PEAK_FLOOR_MI[config.raceDistance] : undefined
  const lastBuildMi2 = Math.max(0, ...coreMileage.filter(x => !x.isTaper && !x.isCutback).map(x => x.totalMi))
  const arrivalShortfall = readinessFloorMi != null && lastBuildMi2 > 0 && lastBuildMi2 < 0.85 * readinessFloorMi
    ? {
        achieved: lastBuildMi2,
        needed: readinessFloorMi,
        critical: lastBuildMi2 < 0.70 * readinessFloorMi,
        bindingCap: masters.isMasters && (mileageAdjust.maxWeeklyIncreasePctCap ?? 1) <= 0.08
          ? 'the masters ramp cap (8%/week)'
          : policy.mileageAdjust.maxWeeklyIncreasePctCap != null
            ? 'the injury-return ramp'
            : totalWeeks < 14
              ? `the ${totalWeeks}-week runway`
              : 'the volume your training days can hold',
      }
    : null

  // Front-pad steady base weeks for a long runway. The per-week loop reads each
  // week's phase from the mileage row below, so no separate block list is needed.
  const mileage: WeekMileage[] = baseWeeks > 0
    ? [
        ...Array.from({ length: baseWeeks }, (_, i) => ({
          weekIndex: i, weekNumber: i + 1,
          totalMi: coreMileage[0].totalMi, longRunMi: coreMileage[0].longRunMi,
          isCutback: false, isTaper: false, phaseId: coreBlocks[0].phaseId,
        })),
        ...coreMileage.map(w => ({ ...w, weekIndex: w.weekIndex + baseWeeks, weekNumber: w.weekNumber + baseWeeks })),
      ]
    : coreMileage
  // R2 — enforce the methods' authored low-mileage downgrade (Daniels:
  // "<20 mi/wk → downgrade to 'recreational' experience routing"): below
  // the threshold, workout routing caps at 'intermediate' so a low-base
  // athlete gets the gentler menu no matter what level they clicked.
  const rawMethodExp = mapToMethodExperience(config.experienceLevel)
  const lowMileageDowngraded =
    invRules.lowMileageDowngradeMi != null &&
    currentWeeklyMileage < invRules.lowMileageDowngradeMi &&
    (rawMethodExp === 'advanced' || rawMethodExp === 'elite')
  const methodExp = lowMileageDowngraded ? ('intermediate' as const) : rawMethodExp

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
  // Anchor "last build week" to the taper the volume model ACTUALLY applied
  // (distance-capped), not the method's authored duration.
  const taperWeekCount = coreMileage.filter(x => x.isTaper).length
  const lastBuildWeekIndex = Math.max(1, totalWeeks - taperWeekCount - 1)


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

  // R3 — heat preparation fires from the race description (R13 altitude is an
  // advisory only). Fueling (R2) scales with the race's effective distance.
  const raceIsHot = detectHeat(config)

  // P4.3 — injury-area-driven prehab + descent caution.
  const injuryArea = config.injuryStatus && config.injuryStatus !== 'none' ? config.injuryArea : undefined
  const prehabBlock = prehabBlockFor(injuryArea)
  const descentCaution = isClimby && descentCautionFor(injuryArea)

  // P4.1 — zones are estimate-grade when there is no tested anchor: no
  // recent race result and no measured LTHR. Estimate-grade plans get a
  // week-1/2 benchmark scheduled (healthy athletes) and an honest advisory.
  const zonesEstimated = currentVdot == null && config.fitnessAnchor?.type !== 'lthr'

  // R1 — the threshold-flavored category the senior policy substitutes VO2
  // slots to: the first the method actually owns workouts for.
  const methodCategories = new Set(method.workouts.map(wk => wk.category))
  const seniorQualityCategory = (['tempo', 'cruise_intervals', 'progression', 'fartlek'] as WorkoutCategory[])
    .find(c => methodCategories.has(c)) ?? 'tempo'

  const weeks: TrainingWeek[] = []
  // Phase 3 (PRD-106) — method-fit instrumentation: authored quality slots
  // vs budget-driven demotions across normal build weeks. Repeated silent
  // demotion means the athlete bought a method and received generic easy
  // running — counted here, told below.
  const demoStats = { authored: 0, budget: 0, senior: 0, personaCap: 0 }
  // Phase 1 — hardness of the previous week's last two assembled days
  // (strength included), for the never-3-consecutive-hard repair and for
  // interference-aware strength placement across week boundaries.
  let prevTailHard: [boolean, boolean] = [false, false]

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
      : (pickWeeklyPattern(method, weekMi.phaseId, runningDaysTarget, weekMi.isCutback, config.raceDistance)?.schedule ?? [])

    // Injury lead-in: rewrite intensity categories to 'easy' during the
    // first N weeks so a returning athlete doesn't get dropped straight
    // into tempo/intervals. Long runs and recovery runs are left alone.
    // The pinned-workout ids must go too — the picker honors
    // preferredWorkoutIds before category, so leaving them meant a day
    // whose label said easy still carried the full VO2 body (the field
    // report's "intensity stays easy" note over 30-30s).
    const isLeadIn = !isFinalWeek && policy.forceEasyLeadInWeeks > 0 && w < policy.forceEasyLeadInWeeks
    let adjustedSchedule: DaySchedule[] = isLeadIn
      ? schedule.map(d => FORCE_EASY_CATEGORIES.has(d.category)
          ? { ...d, category: 'easy' as WorkoutCategory, preferredWorkoutIds: undefined, leadInEased: true }
          : d)
      : schedule
    // Phase 4 (109-F2) — bone-stress history: hill sprints and impact-
    // heavy categories stay out for the first six weeks; impact returns
    // gradually with the plan's normal progression after that.
    if (boneStress && !isFinalWeek && w < 6) {
      adjustedSchedule = adjustedSchedule.map(d => d.category === 'hills'
        ? { ...d, category: 'easy' as WorkoutCategory, preferredWorkoutIds: undefined, notes: 'Eased — impact work returns gradually with a bone-stress history.' }
        : d)
    }

    // R1 — senior intensity selection (70+): VO2-max interval slots become
    // threshold work. Intensity is preserved (Tanaka & Seals 2008 — the
    // stimulus matters more than the modality), structural cost drops.
    const agedSchedule: DaySchedule[] = masters.substituteVo2 && !isFinalWeek
      ? adjustedSchedule.map(d => SENIOR_SUBSTITUTE_CATEGORIES.has(d.category)
          ? { ...d, category: seniorQualityCategory, preferredWorkoutIds: undefined, seniorEased: true }
          : d)
      : adjustedSchedule

    // Honor the athlete's preferred long-run weekday on normal weeks. Race
    // week is hand-authored (taper.raceWeekSchedule) and left untouched.
    const remapped = (!isFinalWeek && longRunDow != null)
      ? remapLongRunDay(agedSchedule, longRunDow)
      : agedSchedule

    // Phase 1 (PRD-103, Mandate #1) — never three consecutive HARD days.
    // Hard = any quality-budget category or a long run (race day counts
    // too but is immovable). Repair order per product decision: swap the
    // offending day with the nearest non-hard day in the week; when no
    // swap exists, demote QUALITY before LONG, never race day. The
    // previous week's last two days carry across the boundary so a
    // Sat long | Sun quality | Mon quality seam is caught too.
    const weekSchedule = repairConsecutiveHard(remapped, prevTailHard, raceEntryDow(isFinalWeek, remapped))

    // R0 — two-pass day construction. Pass 1 instantiates every workout so
    // the week's QUALITY volume is known before any day is sized; quality
    // then gets scaled into whatever the ramp-capped weekly target leaves
    // after the long run(s) and a minimum easy dose; pass 2 builds the days
    // with easy runs sized from the true remainder. Before this, quality
    // templates landed at full method size on top of the budget, so weekly
    // volume was a step function of each phase's quality-day density (the
    // +36–119% base→build cliffs in the running-plan audit).
    // The race-day entry is the LAST race_pace slot in race week — some
    // methods (Galloway) also schedule a race-PACE workout earlier in race
    // week, which must stay a workout, not a second race card.
    const raceEntry = isFinalWeek
      ? [...weekSchedule].reverse().find(d => d.category === 'race_pace')
      : undefined
    const preparedDays = weekSchedule.map(daySched => {
      const date = addDays(weekStart, daySched.dayOfWeek - 1) // dayOfWeek 1..7 → Mon..Sun
      // Race day is hard-stamped, never resolved. The picker substitutes a
      // race_pace slot away when the method's race workout doesn't clear the
      // athlete's level/mileage gates (field bug: the anchor race day read
      // "Easy · Substituted higdon_easy_run"). Mirrors the Hyrox generator's
      // guaranteed card.
      const isRaceDay = daySched === raceEntry
      const picked = isRaceDay ? null : pickWorkoutForDay(method, daySched, methodExp, weekMi.totalMi, weekMi.weekNumber)
      return {
        date,
        daySched,
        isRaceDay,
        workout: picked?.workout ?? null,
        pw: picked ? buildPlannedWorkout(method, picked.workout, weekPaces, picked.reason) : null,
        reason: [
          picked?.reason,
          daySched.seniorEased ? 'Masters: intervals swapped for threshold work — intensity stays, recovery cost drops' : undefined,
        ].filter(Boolean).join(' · ') || undefined,
      }
    })

    let weekQualityMi = 0
    {
      // Phase 2 (102-F2/F4) — multi-long weeks (Pfitzinger's midweek
      // medium-long, Koop's back-to-back weekend) earn their second long
      // day: weekly target ≥30 mi, never in taper, and only for ultra
      // distances or Pfitzinger's authored medium-long. Even then the
      // COMBINED long-category share is capped at 65% of the week — the
      // secondary day shrinks first, and if it would fall below a real
      // long-day dose (45% of the primary), the week runs a single long.
      const longDays = preparedDays.filter(p => p.daySched.category === 'long')
      const isUltraDistance = ['50k', '50_mile', '100k', '100_mile', 'mountain_ultra'].includes(config.raceDistance ?? '')
      let multiLongOk = false
      if (longDays.length > 1) {
        const eligible = weekMi.totalMi >= 30 && !weekMi.isTaper && (isUltraDistance || method.id === 'pfitzinger')
        if (eligible && weekMi.longRunMi > 0) {
          const n = longDays.length
          const maxCombined = 0.65 * weekMi.totalMi
          const uncapped = weekMi.longRunMi * (1 + SECONDARY_LONG_FACTOR * (n - 1))
          const secondary = uncapped <= maxCombined
            ? SECONDARY_LONG_FACTOR
            : (maxCombined - weekMi.longRunMi) / ((n - 1) * weekMi.longRunMi)
          if (secondary >= 0.45) {
            weekMi.secondaryLongFactor = Math.round(Math.min(SECONDARY_LONG_FACTOR, secondary) * 100) / 100
            multiLongOk = true
          }
        }
      }
      if (longDays.length > 1 && !multiLongOk) {
        for (const extra of longDays.slice(0, -1)) {
          extra.daySched = { ...extra.daySched, category: 'easy' as WorkoutCategory, preferredWorkoutIds: undefined }
          const repick = pickWorkoutForDay(method, extra.daySched, methodExp, weekMi.totalMi)
          extra.workout = repick?.workout ?? null
          extra.pw = repick ? buildPlannedWorkout(method, repick.workout, weekPaces, repick.reason) : null
          extra.reason = 'Eased — one long run per week at this volume'
        }
      }
      // Race day itself never participates (hard-stamped card); race-week
      // QUALITY does — the hand-authored "short tempo" slots carried the
      // method's full-size template (Hansons: an 8 mi MP tempo five days
      // before a 5K).
      let qualityDays = preparedDays.filter(
        p => !p.isRaceDay && p.pw && QUALITY_BUDGET_CATEGORIES.has(p.daySched.category),
      )
      const countsForFit = !weekMi.isCutback && !weekMi.isTaper && !isFinalWeek
      if (countsForFit) demoStats.authored += qualityDays.length
      if (qualityDays.length > 0) {
        const { fastSec, slowSec } = easyPaceSecBounds(weekPaces)
        const minEasyMi = (MIN_EASY_RUN_MIN * 60) / ((fastSec + slowSec) / 2)
        // The budget re-derives from live day categories — every demotion
        // adds an easy day (reserving its minimum dose) and can remove a
        // long day, so a stale snapshot would mis-size everything after it.
        // R2 — the method's authored quality share caps the budget too:
        // an 80/20 week must not spend 45% of its miles on quality just
        // because the long run left room (the sweep's Elena/Frank cases).
        const qualityShareCapMi = weekMi.totalMi * invRules.qualityMaxPctOfWeek
        const budget = () => {
          const easyCount = preparedDays.filter(p => p.daySched.category === 'easy' || p.daySched.category === 'recovery').length
          const longMi = longCategoryMiles(weekMi.longRunMi, preparedDays.filter(p => p.daySched.category === 'long').length, weekMi.secondaryLongFactor)
          return Math.min(Math.max(0, weekMi.totalMi - longMi - easyCount * minEasyMi), qualityShareCapMi)
        }

        // Fit quality into the budget. Scaling can only shed so much (rep
        // floors, warm-up/cool-down floors) — when even maximally-scaled
        // sessions overflow the budget, DEMOTE quality days to easy runs,
        // last-scheduled first (the method's signature session leads the
        // week). Cutback weeks may demote every quality day (a cutback is
        // for absorbing training, not adding it); normal weeks keep at
        // least one.
        const scaledTotal = (f: number) =>
          qualityDays.reduce((s, p) => s + estimateWorkoutMiles(scaleQualityWorkout(p.pw!, f, weekPaces), weekPaces), 0)
        const demoteToEasy = (p: (typeof preparedDays)[number], reason: string) => {
          p.daySched = { ...p.daySched, category: 'easy' as WorkoutCategory, preferredWorkoutIds: undefined }
          const repick = pickWorkoutForDay(method, p.daySched, methodExp, weekMi.totalMi)
          p.workout = repick?.workout ?? null
          p.pw = repick ? buildPlannedWorkout(method, repick.workout, weekPaces, repick.reason) : null
          p.reason = reason
        }
        // R1 — senior cap: one quality session per week at 70+.
        while (qualityDays.length > masters.maxQualityPerWeek) {
          demoteToEasy(qualityDays[qualityDays.length - 1], 'Eased — masters plans hold one quality session per week')
          qualityDays = qualityDays.slice(0, -1)
          if (countsForFit) demoStats.senior += 1
        }
        // Phase 2 (104-F5) — persona quality caps: a first-timer holds one
        // quality session per week for the first six weeks (then two); a
        // beginner holds two. Strides and benchmarks don't count.
        const personaQualityCap = config.experienceLevel === 'first_timer'
          ? (weekMi.weekNumber <= 6 ? 1 : 2)
          : config.experienceLevel === 'beginner' ? 2 : Infinity
        while (qualityDays.length > personaQualityCap) {
          demoteToEasy(qualityDays[qualityDays.length - 1], 'Eased — quality builds gradually at this experience level')
          qualityDays = qualityDays.slice(0, -1)
          if (countsForFit) demoStats.personaCap += 1
        }
        const keepFloor = weekMi.isCutback ? 0 : 1
        while (qualityDays.length > keepFloor) {
          const b = budget()
          const raw = qualityDays.reduce((s, p) => s + estimateWorkoutMiles(p.pw!, weekPaces), 0)
          if (raw <= b) break
          if (scaledTotal(Math.max(0.4, b / raw)) <= b * 1.1) break
          demoteToEasy(qualityDays[qualityDays.length - 1], 'Eased — this week’s volume budget fits one quality session')
          qualityDays = qualityDays.slice(0, -1)
          if (countsForFit) demoStats.budget += 1
        }
        const finalBudget = budget()
        const qualityMiRaw = qualityDays.reduce((s, p) => s + estimateWorkoutMiles(p.pw!, weekPaces), 0)
        if (qualityMiRaw > finalBudget && qualityMiRaw > 0) {
          for (const p of qualityDays) {
            p.pw = scaleQualityWorkout(p.pw!, finalBudget / qualityMiRaw, weekPaces)
          }
        }
        weekQualityMi = qualityDays.reduce((s, p) => s + (p.pw ? estimateWorkoutMiles(p.pw, weekPaces) : 0), 0)
      }
      // When the minimum honest content (long + fitted quality + a 20-min
      // floor per easy day) still exceeds the week's target, the right move
      // is MORE REST, not method-window padding — convert trailing easy
      // days to rest, keeping at least two easy runs. Bites mostly in
      // tapers and in dense 6-run-day patterns handed to low-volume
      // athletes (Hansons for a masters beginner).
      if (!isFinalWeek) {
        const { fastSec, slowSec } = easyPaceSecBounds(weekPaces)
        // Phase 1 (103-F4) — taper preserves run FREQUENCY (Bosquet 2007:
        // cut volume, keep intensity and frequency): before deleting a run
        // day, taper easy runs may shrink to a 15-min floor. Conversion
        // fires only when even those floors overflow the target.
        const convFloorMin = weekMi.isTaper ? 15 : MIN_EASY_RUN_MIN
        const minEasyMi = (convFloorMin * 60) / ((fastSec + slowSec) / 2)
        for (;;) {
          const easies = preparedDays.filter(p => p.daySched.category === 'easy' || p.daySched.category === 'recovery')
          const longMi = longCategoryMiles(weekMi.longRunMi, preparedDays.filter(p => p.daySched.category === 'long').length, weekMi.secondaryLongFactor)
          const floorMi = longMi + weekQualityMi + easies.length * minEasyMi
          if (easies.length <= 2 || floorMi <= weekMi.totalMi * 1.2) break
          const drop = easies[easies.length - 1]
          drop.daySched = {
            ...drop.daySched,
            category: 'rest' as WorkoutCategory,
            preferredWorkoutIds: undefined,
            notes: weekMi.isTaper ? 'Taper — extra rest day.' : 'Volume budget — extra rest day.',
          }
          drop.workout = null
          drop.pw = null
          drop.reason = undefined
        }
      }
    }
    // Demotions above may have changed day categories — downstream easy-run
    // sizing must see the week as it will actually run.
    const finalSchedule = preparedDays.map(p => p.daySched)

    // Phase 1 (102-F1) — the LAST long day on the calendar is the primary;
    // any earlier long day (Pfitzinger's medium-long, Koop's B2B day 1)
    // builds at the secondary factor of the primary distance.
    const primaryLongDow = Math.max(
      0, ...preparedDays.filter(p => p.daySched.category === 'long').map(p => p.daySched.dayOfWeek))
    const secondaryLongMi = Math.round(weekMi.longRunMi * (weekMi.secondaryLongFactor ?? SECONDARY_LONG_FACTOR) * 10) / 10
    const days: PlannedDay[] = preparedDays.map(p => {
      if (p.isRaceDay) {
        return {
          day: formatDayLabel(p.date),
          type: 'race' as WorkoutType,
          workout: `RACE DAY — ${config.raceName || raceForVert.name || 'Race'}`,
          detail: 'Race day. Nothing new — rehearsed gear, fueling, and pacing only. Start controlled and run your plan.',
          zone: '—',
          route: config.raceName || 'Race venue',
          time: '—',
        }
      }
      const isSecondaryLong = p.daySched.category === 'long' && p.daySched.dayOfWeek !== primaryLongDow
      const dayWeekMi = isSecondaryLong ? { ...weekMi, longRunMi: secondaryLongMi } : weekMi
      const built = buildPlannedDay(
        p.date, p.daySched, weekPaces, dayWeekMi, p.workout, p.pw, p.reason,
        finalSchedule, config.equipmentAccess, gradeAdjFactor, weekQualityMi,
      )
      // Phase 4 (108-F2) — in serious heat, hard sessions run by effort:
      // chasing pace numbers in 85°F is how quality days break athletes.
      const heated = heat.effortFirst && QUALITY_BUDGET_CATEGORIES.has(p.daySched.category)
        ? { ...built, detail: `${built.detail} · Heat: run this by effort (RPE) — pace is secondary today.` }
        : built
      return p.daySched.leadInEased ? { ...heated, leadInEased: true } : heated
    })
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
    const hardDayFlags = days.map(d => HARD_DAY_TYPES.has(d.type))
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
          { maxExtras: weekMaxExtras, hardDayFlags, prevTailHard },
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
      descentCaution,
    })
    // P4.3 — injury-area prehab: the targeted block lands on every
    // strength/cross day; a week with neither gets it after the first
    // easy run. Collected since day one, acted on since P4.
    if (prehabBlock) {
      let applied = false
      withVert = withVert.map(d => {
        if (d.type === 'strength' || d.type === 'cross') {
          applied = true
          return { ...d, detail: d.detail ? `${d.detail} · ${prehabBlock}` : prehabBlock }
        }
        return d
      })
      if (!applied) {
        const idx = withVert.findIndex(d => d.type === 'run')
        if (idx >= 0) {
          withVert = withVert.map((d, i) =>
            i === idx ? { ...d, detail: `${d.detail} · After the run: ${prehabBlock}` } : d)
        }
      }
    }
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

    // Carry this week's closing hardness into next week's repair pass —
    // strength days count when this week's scheme is heavy/plyo.
    const hardStrengthWeek = isHardStrengthSession(weekMi.phaseId, weekMi.isTaper, config)
    const closing = withVert.slice(-2).map(d =>
      HARD_DAY_TYPES.has(d.type) || (d.type === 'strength' && hardStrengthWeek))
    prevTailHard = [closing.length > 1 ? closing[0] : false, closing[closing.length - 1] ?? false]
  }

  const effectiveDaysPerWeek = runningDaysTarget + extrasCap
  const athlete = buildAthleteProfile(config, currentWeeklyMileage, effectiveDaysPerWeek)
  const advisories = [...assessFeasibility(config, today, method), ...environmentAdvisories(config)]
  // R2 — suitability gate: generating a method for a distance it rates
  // NOT_SUITED is never silent. The plan still generates (the athlete may
  // insist), but the advisory is critical and names the strongest fit.
  if (config.raceDistance) {
    const rating = method.applicability?.byDistance?.[config.raceDistance]
    if (rating === 'NOT_SUITED') {
      const alt = bestMethodForDistance(config.raceDistance)
      advisories.push({
        id: 'method_not_suited',
        severity: 'critical',
        title: `${method.name} isn't designed for this race distance`,
        detail: `${method.name} rates itself "not designed" for this distance — its structure was authored for other race lengths, so key sessions may not fit your goal.`,
        suggestion: alt.id !== method.id ? `Switch to ${alt.name} — the strongest fit for this distance.` : undefined,
      })
    }
  }
  // Phase 4 (108-F3) — race-day heat pacing: quantify the expected
  // slowdown instead of just saying "it'll be hot" (Ely 2007: penalty
  // grows with time-on-course — slower runners lose more).
  if (raceIsHot) {
    const slowBand = predictedFinishMin >= 180 ? '4–8%' : predictedFinishMin >= 90 ? '3–6%' : '2–4%'
    advisories.push({
      id: 'race_heat_pacing',
      severity: 'caution',
      title: 'Plan a slower race pace for the heat',
      detail: `This race reads hot. Expect roughly ${slowBand} slower than your fitness predicts in cool conditions — the penalty grows the longer you're on course. Start at the adjusted pace, not your cool-weather number; heat debt taken in the first third is never repaid.`,
    })
  }
  if (heat.factor > 1) {
    advisories.push({
      id: 'training_heat_adjusted',
      severity: 'info',
      title: 'Easy paces adjusted for your training heat',
      detail: `Easy and recovery pace bands run ~${Math.round((heat.factor - 1) * 100)}% slower for training around ${config.typicalTrainingTempF}°F — same effort, honest numbers.${heat.advise ? ` Above 90°F: ${heat.advise}.` : ''}`,
    })
  }
  if (healthFlagged) {
    advisories.push({
      id: 'health_flag',
      severity: 'caution',
      title: SCREENING_COPY.healthFlagTitle,
      detail: SCREENING_COPY.healthFlagDetail + (boneStress ? ` ${SCREENING_COPY.boneStressDetail}` : ''),
    })
    const longRace = ['marathon', '50k', '50_mile', '100k', '100_mile', 'mountain_ultra'].includes(config.raceDistance ?? '')
    if (screen?.boneStressRecent && longRace) {
      advisories.push({
        id: 'bone_stress_distance_risk',
        severity: 'critical',
        title: SCREENING_COPY.boneRecentUltraTitle,
        detail: SCREENING_COPY.boneRecentUltraDetail,
      })
    }
  }
  if (arrivalShortfall) {
    const pct = Math.round((arrivalShortfall.achieved / arrivalShortfall.needed) * 100)
    // 101-F3 — concrete remedies, computed from this config: the weeks a
    // safe ramp needs to reach the floor, and/or a distance whose floor
    // the achieved volume already supports.
    const effRamp = Math.min(mileageAdjust.maxWeeklyIncreasePctCap ?? 0.1, 0.1)
    const startMi = Math.max(1, coreMileage[0]?.totalMi ?? currentWeeklyMileage)
    const weeksToFloor = Math.ceil(Math.log(arrivalShortfall.needed / startMi) / Math.log(1 + effRamp)) + (taperCapWeeks ?? 2)
    const fitsDistance = (['half_marathon', '10k'] as const).find(d =>
      d === '10k' || arrivalShortfall.achieved >= 0.85 * (REFERENCE_PEAK_FLOOR_MI[d] ?? Infinity))
    advisories.push({
      id: 'peak_unreachable',
      severity: arrivalShortfall.critical ? 'critical' : 'caution',
      title: 'This build arrives under race-ready volume',
      detail: `The plan peaks at ~${Math.round(arrivalShortfall.achieved)} mi/week against the ~${arrivalShortfall.needed} mi/week this distance asks for (${pct}%). The binding constraint is ${arrivalShortfall.bindingCap} — the ramp stays safe, so the gap is told, not hidden.`,
      suggestion: `Two honest options: pick a race ~${Math.max(2, weeksToFloor - totalWeeks)} weeks later so the safe ramp can reach ${arrivalShortfall.needed} mi/week, or race ${fitsDistance === 'half_marathon' ? 'a half marathon' : 'a shorter distance'} that your current build already supports.`,
    })
  }
  // Phase 3 (106-F2) — method-fit feedback: when the weekly budget demotes
  // more than 35% of the method's authored quality across build weeks, say
  // so once and name a lighter-structure alternative.
  if (demoStats.authored >= 6 && demoStats.budget / demoStats.authored > 0.35) {
    const alt = config.raceDistance
      ? suggestLighterMethod(config.raceDistance, runningDaysTarget, method.id)
      : null
    advisories.push({
      id: 'method_volume_mismatch',
      severity: 'caution',
      title: `${method.name}'s workload doesn't fit your volume`,
      detail: `${demoStats.budget} of ${demoStats.authored} authored quality sessions had to be eased to easy runs because your weekly volume can't hold them — you'd be following ${method.name}'s name, not its training.`,
      suggestion: alt ? `Switch to ${alt.name} — its quality load fits your mileage and days.` : undefined,
    })
  }
  if (lowMileageDowngraded) {
    advisories.push({
      id: 'low_mileage_downgrade',
      severity: 'info',
      title: 'Workout menu eased for your current mileage',
      detail: `${method.name} routes athletes under ${invRules.lowMileageDowngradeMi} mi/week to its gentler workout menu (the method's own rule) — the advanced sessions return as your base grows.`,
    })
  }
  // R1 — say what the age tier changed, in plain language.
  if (masters.isMasters) {
    advisories.push({
      id: 'masters_adjustments',
      severity: 'info',
      title: masters.isSenior ? 'Masters adjustments (70+)' : 'Masters adjustments',
      detail: masters.isSenior
        ? `At ${config.age}, this plan recovers every ${MASTERS_RECOVERY_CADENCE.value.cadenceWeeks}rd week, caps weekly growth at ${Math.round(MASTERS_RAMP_CAP.value * 100)}%, holds one quality session per week, swaps VO2-max intervals for threshold work, and keeps the long run shorter. Intensity stays — masters athletes keep adapting; the schedule just protects recovery.`
        : `At ${config.age}, this plan recovers every ${MASTERS_RECOVERY_CADENCE.value.cadenceWeeks}rd week and caps weekly growth at ${Math.round(MASTERS_RAMP_CAP.value * 100)}% — recovery capacity, not trainability, is what changes with age.`,
    })
  }
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
  // P4.1 — schedule the calibration benchmark when zones are estimates.
  // Healthy athletes get a 20-min field test in week 1 (week 2 when week 1
  // is a partial); an injury lead-in defers it with an honest advisory —
  // nobody time-trials while easing back.
  let benchmarkPlaced = false
  const placeBenchmarkInWeek = (targetWeek: TrainingWeek): boolean => {
    let idx = targetWeek.days.findIndex(d => d.type === 'quality')
    if (idx < 0) idx = targetWeek.days.findIndex(d => d.type === 'run' && !/strides/i.test(d.workout))
    if (idx < 0) idx = targetWeek.days.findIndex(d => d.type === 'run')
    if (idx >= 0) {
      const ant = paces.byZone.lactate_threshold
      targetWeek.days[idx] = {
        day: targetWeek.days[idx].day,
        type: 'quality',
        workout: 'BENCHMARK: 20-min time trial',
        detail:
          'Flat course, even effort — the hardest pace you could hold for an hour. ' +
          'Your average HR over the final 15 min ≈ threshold HR; average pace ≈ threshold pace. ' +
          'Enter both in Settings afterward — every zone in this plan calibrates from this test.',
        zone: ant ? formatZoneString(ant) : '—',
        route: 'Flat, measured',
        time: '45-50 min',
        plannedWorkout: {
          workoutId: 'benchmark_20min_tt',
          methodId: method.id,
          name: 'BENCHMARK: 20-min time trial',
          category: 'time_trial',
          primaryZone: 'lactate_threshold',
          segments: [
            { role: 'warmup', description: 'Easy warmup + 4×20s strides', duration: { value: 15, unit: 'min' }, paceZone: 'easy' },
            { role: 'main', description: '20-MIN TIME TRIAL — flat, even effort; record avg pace + avg HR', duration: { value: 20, unit: 'min' }, paceZone: 'lactate_threshold' },
            { role: 'cooldown', description: 'Very easy cooldown', duration: { value: 12, unit: 'min' }, paceZone: 'recovery' },
          ],
          approxDurationMinutes: { min: 45, max: 50 },
          purpose: 'Calibrate threshold pace and HR — the anchor every zone derives from.',
          cues: ['Even effort beats a fast start: the first 5 minutes should feel too easy.'],
        },
      }
      // The benchmark may have replaced the week's drill-stamped run —
      // restamp the first remaining easy run so the drill tip survives.
      if (!targetWeek.days.some(d => d.isDrillDay)) {
        const drillIdx = targetWeek.days.findIndex(d => d.type === 'run')
        if (drillIdx >= 0) targetWeek.days[drillIdx] = { ...targetWeek.days[drillIdx], isDrillDay: true }
      }
      return true
    }
    return false
  }
  if (zonesEstimated && policy.forceEasyLeadInWeeks === 0 && weeks.length > 1) {
    const targetWeek = weeks[0].days.filter(d => d.type !== 'rest').length >= 3 ? weeks[0] : weeks[1]
    benchmarkPlaced = placeBenchmarkInWeek(targetWeek)
  }

  // Phase 3 (PRD-107) — anchor freshness. A race anchor with no date (all
  // legacy configs) or one older than ~12 weeks may no longer describe the
  // athlete: say so, and schedule the SAME 20-min benchmark mid-plan (at
  // the first phase boundary) so the paces revalidate — before this, only
  // unanchored athletes ever got the calibration test.
  const raceAnchor = config.fitnessAnchor && /^race_/.test(config.fitnessAnchor.type)
  const anchorAgeWeeks = raceAnchor && config.fitnessAnchor?.dateIso
    ? Math.round((Date.parse(`${today}T12:00:00`) - Date.parse(`${config.fitnessAnchor.dateIso.slice(0, 10)}T12:00:00`)) / (7 * 24 * 3600 * 1000))
    : null
  if (raceAnchor && anchorAgeWeeks != null && anchorAgeWeeks > 12) {
    advisories.push({
      id: 'anchor_stale',
      severity: anchorAgeWeeks > 26 ? 'caution' : 'info',
      title: 'Your anchor race is getting old',
      detail: `Every pace in this plan derives from a race ~${anchorAgeWeeks} weeks ago — fitness has likely moved since (either direction). The mid-plan benchmark revalidates them; enter the result in Settings and the plan updates.`,
    })
  }
  const anchorNeedsRevalidation = raceAnchor && (anchorAgeWeeks == null || anchorAgeWeeks > 12)
  if (!zonesEstimated && anchorNeedsRevalidation && policy.forceEasyLeadInWeeks === 0 && totalWeeks >= 8) {
    // First week of the second phase — the base→build boundary.
    const firstPhase = weeks[0] ? mileage[0]?.phaseId : undefined
    const boundaryIdx = mileage.findIndex(m => m.phaseId !== firstPhase)
    const target = boundaryIdx > 0 && boundaryIdx < weeks.length - 2 ? weeks[boundaryIdx] : weeks[2]
    if (target && !target.days.some(d => /BENCHMARK/i.test(d.workout))) {
      benchmarkPlaced = placeBenchmarkInWeek(target) || benchmarkPlaced
    }
  }
  if (zonesEstimated) {
    advisories.push({
      id: 'zones_estimated',
      severity: benchmarkPlaced ? 'info' : 'caution',
      title: 'Zones are estimates until you test',
      detail: benchmarkPlaced
        ? 'Your paces and HR zones are derived from your self-reported easy pace and age, not a test. The week-1 benchmark time trial calibrates them — enter the result in Settings and the plan updates.'
        : 'Your paces and HR zones are derived from your self-reported easy pace and age, not a test. Once you are training normally again, run a 20-min time trial (flat, even effort) and enter the result in Settings to calibrate them.',
    })
  }
  if (descentCaution) {
    advisories.push({
      id: 'descent_caution',
      severity: 'caution',
      title: 'Descent work is the variable to cut first',
      detail: `With your ${config.injuryArea === 'knee' ? 'knee' : 'lower-leg'} history, eccentric downhill loading is the highest-risk stimulus in this plan. Downhill sessions run on a reduced cadence with capped reps — if symptoms appear, drop the descent sessions before anything else, and see a physiotherapist if pain is sharp, localized, or worsening.`,
    })
  }

  // P1 — the plan QA gate. Every generated plan is linted before it
  // ships; findings surface as advisories (errors → critical) so a
  // defective plan is never silently handed to the athlete, and CI runs
  // the same validator over the golden personas so a regression fails
  // the build first.
  const zones = computeZones(athlete.maxHR, paces, method)
  const qa = validatePlan({ weeks, zones, race: raceForVert, predictedFinishMin, zonesEstimated: zonesEstimated && policy.forceEasyLeadInWeeks === 0, injuryArea, methodId: method.id, effectiveExperience: methodExp, age: config.age })
  advisories.push(...qaFindingsToAdvisories(qa))

  return {
    athlete,
    weeks,
    zones,
    race: raceForVert,
    methodId: method.id,
    ...(advisories.length > 0 ? { advisories } : {}),
  }
}
