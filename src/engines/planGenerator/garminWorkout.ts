/**
 * Map a personalized `PlannedWorkout` into a flat, app-agnostic payload that
 * the `/api/garmin/workout` endpoint can translate into a Garmin Connect
 * structured workout and schedule on the watch.
 *
 * This module is intentionally side-effect-free (pure functions only) so the
 * mapping can be unit-tested without a network or a Garmin session. The
 * backend owns the translation into garminconnect's typed models; this layer
 * only resolves the app's concrete HR/pace targets into the numbers Garmin
 * needs.
 */
import type { PlannedWorkout, PlannedSegment, PaceTarget } from './types'
import type {
  WorkoutCategory,
  DurationValue,
  DistanceValue,
} from '../../types/training-method'
import type { PlannedDay, WorkoutType } from '../../types'
import { parsePlannedTargets } from '../../utils/targets'

// The step model is the PLATFORM-NEUTRAL intermediate (D5): canonical
// types live in structuredWorkout.ts; the Garmin names below are aliases,
// so this refactor is provably payload-identical (snapshot test) and a
// future Apple WorkoutKit renderer consumes the exact same shapes.
import type {
  StructuredSport,
  StructuredStepType,
  StructuredEndConditionType,
  StructuredTargetType,
  StructuredEndCondition,
  StructuredTarget,
  StructuredStep,
} from './structuredWorkout'

/** Garmin sport bucket. Run-family workouts get full structured fidelity;
 *  strength and cross-training degrade to timed steps (Garmin Connect can't
 *  represent reps via its workout API). */
export type GarminSport = StructuredSport

export type GarminStepType = StructuredStepType

/** `time` → value is seconds; `distance` → value is meters; `lap.button`
 *  means "until the athlete presses lap" (no value). */
export type GarminEndConditionType = StructuredEndConditionType

/** `pace` → low/high in seconds-per-meter; `heart.rate` → low/high in bpm;
 *  `open` → no target (free effort). */
export type GarminTargetType = StructuredTargetType

export type GarminEndCondition = StructuredEndCondition

export type GarminTarget = StructuredTarget

export type GarminStep = StructuredStep

export type GarminWorkoutPayload = import('./structuredWorkout').StructuredWorkout

const METERS_PER_MILE = 1609.344

/** Workout categories that can't be pushed as a watch workout. */
const UNPUSHABLE_CATEGORIES: ReadonlySet<WorkoutCategory> = new Set(['rest'])

/** Map the app's workout category to a Garmin sport bucket. */
export function garminSportForCategory(category: WorkoutCategory): GarminSport {
  switch (category) {
    case 'strength':
      return 'strength'
    case 'cross_training':
      return 'cardio'
    default:
      // easy / long / recovery / tempo / intervals / strides / hills / …
      return 'running'
  }
}

/** True when a planned workout has enough structure to push to Garmin. */
export function isPushableWorkout(workout: PlannedWorkout | undefined): workout is PlannedWorkout {
  if (!workout) return false
  if (UNPUSHABLE_CATEGORIES.has(workout.category)) return false
  return workout.segments.length > 0
}

function durationToSecs(d: DurationValue): number {
  return Math.round(d.unit === 'min' ? d.value * 60 : d.value)
}

function distanceToMeters(d: DistanceValue): number {
  switch (d.unit) {
    case 'mi':
      return Math.round(d.value * METERS_PER_MILE)
    case 'km':
      return Math.round(d.value * 1000)
    default:
      return Math.round(d.value)
  }
}

function paceSecPerMileToSecPerMeter(secPerMile: number): number {
  // Keep a few decimals — Garmin pace targets are sensitive to rounding.
  return Math.round((secPerMile / METERS_PER_MILE) * 1000) / 1000
}

/** Distance takes precedence over time when a segment specifies both, since
 *  distance-bounded reps are the more common prescription. Falls back to a
 *  lap-button step when neither is set. */
function endConditionFor(seg: { duration?: DurationValue; distance?: DistanceValue }): GarminEndCondition {
  if (seg.distance) return { type: 'distance', value: distanceToMeters(seg.distance) }
  if (seg.duration) return { type: 'time', value: durationToSecs(seg.duration) }
  return { type: 'lap.button' }
}

/** Resolve a segment's pace target into a concrete Garmin target. Honors the
 *  target's `preferredMode`, then falls back to whichever range is populated;
 *  RPE-only targets have no machine-readable bound, so they map to `open`. */
function targetFor(pt: PaceTarget | undefined): GarminTarget {
  if (!pt) return { type: 'open' }

  const hasPace = pt.paceSecPerMileLow != null && pt.paceSecPerMileHigh != null
  const hasHr = pt.hrBpmLow != null && pt.hrBpmHigh != null

  const paceTarget = (): GarminTarget => ({
    type: 'pace',
    low: paceSecPerMileToSecPerMeter(pt.paceSecPerMileLow as number),
    high: paceSecPerMileToSecPerMeter(pt.paceSecPerMileHigh as number),
  })
  const hrTarget = (): GarminTarget => ({
    type: 'heart.rate',
    low: pt.hrBpmLow as number,
    high: pt.hrBpmHigh as number,
  })

  if (pt.preferredMode === 'pace' && hasPace) return paceTarget()
  if (pt.preferredMode === 'hr' && hasHr) return hrTarget()
  if (hasPace) return paceTarget()
  if (hasHr) return hrTarget()
  return { type: 'open' }
}

function mapSegment(seg: PlannedSegment): GarminStep {
  const stepType: GarminStepType =
    seg.role === 'warmup' ? 'warmup' : seg.role === 'cooldown' ? 'cooldown' : 'interval'

  const base: GarminStep = {
    stepType,
    endCondition: endConditionFor(seg),
    target: targetFor(seg.paceTarget),
    description: seg.description || undefined,
  }

  // A main segment with reps becomes a repeat group: the work interval, plus
  // a recovery step when the segment defines one.
  if (seg.role === 'main' && seg.reps && seg.reps > 1) {
    const steps: GarminStep[] = [base]
    if (seg.recovery) {
      steps.push({
        stepType: 'recovery',
        endCondition: endConditionFor(seg.recovery),
        target: { type: 'open' },
        description: seg.recovery.type,
      })
    }
    return {
      stepType: 'interval',
      endCondition: { type: 'lap.button' },
      target: { type: 'open' },
      repeat: { count: seg.reps, steps },
    }
  }

  return base
}

/**
 * Convert a `PlannedWorkout` into a `GarminWorkoutPayload` scheduled on
 * `isoDate`. Pure — no I/O. Callers should gate on `isPushableWorkout` first.
 */
export function plannedWorkoutToGarminPayload(
  workout: PlannedWorkout,
  isoDate: string,
): GarminWorkoutPayload {
  const steps = workout.segments.map(mapSegment)

  // Defensive: a workout with segments that produced nothing still gets one
  // open step so the upload is a valid (if unstructured) Garmin workout.
  if (steps.length === 0) {
    steps.push({
      stepType: 'interval',
      endCondition: { type: 'lap.button' },
      target: { type: 'open' },
      description: workout.purpose || workout.name,
    })
  }

  const { min, max } = workout.approxDurationMinutes
  const estimatedDurationSecs = Math.round(((min + max) / 2) * 60)

  return {
    name: workout.displayName || workout.name,
    sport: garminSportForCategory(workout.category),
    scheduleDate: isoDate,
    estimatedDurationSecs,
    steps,
  }
}

// ─── Legacy (text-plan) fallback ───────────────────────────────────
// Hand-authored plans store workouts as free-text (`zone`/`detail`/`time`)
// without a structured `plannedWorkout`. We still want those athletes to push
// to their watch, so we parse the same numeric targets the compliance engine
// uses (parsePlannedTargets) into a single-step Garmin workout.

/** WorkoutType → Garmin sport. Types absent from the map (rest, travel) aren't
 *  pushable. */
const LEGACY_SPORT: Partial<Record<WorkoutType, GarminSport>> = {
  run: 'running',
  quality: 'running',
  long: 'running',
  race: 'running',
  limited: 'running',
  strength: 'strength',
  cross: 'cardio',
}

/**
 * Build a Garmin payload from a legacy text-plan day. Returns null when the
 * day isn't pushable — a non-workout type (rest/travel), or no distance or
 * duration to anchor a step (nothing concrete to send the watch).
 */
export function legacyDayToGarminPayload(
  day: PlannedDay,
  isoDate: string,
): GarminWorkoutPayload | null {
  const sport = LEGACY_SPORT[day.type]
  if (!sport) return null

  const t = parsePlannedTargets(day)

  let endCondition: GarminEndCondition
  if (t.distanceMi != null && t.distanceMi > 0) {
    endCondition = { type: 'distance', value: Math.round(t.distanceMi * METERS_PER_MILE) }
  } else if (t.durationMin != null && t.durationMin > 0) {
    endCondition = { type: 'time', value: Math.round(t.durationMin * 60) }
  } else {
    return null
  }

  const target: GarminTarget =
    t.hrLow != null && t.hrHigh != null
      ? { type: 'heart.rate', low: t.hrLow, high: t.hrHigh }
      : { type: 'open' }

  const estimatedDurationSecs =
    t.durationMin != null && t.durationMin > 0 ? Math.round(t.durationMin * 60) : undefined

  return {
    name: day.workout || 'Workout',
    sport,
    scheduleDate: isoDate,
    estimatedDurationSecs,
    steps: [
      {
        stepType: 'interval',
        endCondition,
        target,
        description: day.detail || undefined,
      },
    ],
  }
}

/**
 * Resolve a Garmin payload for any planned day: the structured `plannedWorkout`
 * when present (full fidelity), otherwise the legacy text-plan fallback.
 * Returns null when the day can't be pushed. This is the single entry point the
 * UI should use.
 */
export function buildGarminPayloadForDay(
  day: PlannedDay,
  isoDate: string,
): GarminWorkoutPayload | null {
  if (isPushableWorkout(day.plannedWorkout)) {
    return plannedWorkoutToGarminPayload(day.plannedWorkout, isoDate)
  }
  return legacyDayToGarminPayload(day, isoDate)
}
