/**
 * PlannedWorkout → Garmin payload mapping tests.
 *
 * Verifies the pure mapping that feeds /api/garmin/workout: step typing,
 * reps → repeat groups, pace-vs-HR target selection, distance-vs-time end
 * conditions, sport dispatch, and the rest/empty guards.
 */
import { describe, it, expect } from 'vitest'
import {
  plannedWorkoutToGarminPayload,
  garminSportForCategory,
  isPushableWorkout,
} from '../../../engines/planGenerator/garminWorkout'
import type { PlannedWorkout, PlannedSegment, PaceTarget } from '../../../engines/planGenerator/types'
import type { WorkoutCategory, CanonicalPaceZone } from '../../../types/training-method'

const METERS_PER_MILE = 1609.344

function paceTarget(overrides: Partial<PaceTarget> = {}): PaceTarget {
  return {
    zone: 'easy',
    displayName: 'Easy',
    preferredMode: 'pace',
    ...overrides,
  }
}

function workout(overrides: Partial<PlannedWorkout> = {}): PlannedWorkout {
  return {
    workoutId: 'w1',
    methodId: 'daniels',
    name: 'Test Workout',
    category: 'easy' as WorkoutCategory,
    primaryZone: 'easy' as CanonicalPaceZone,
    segments: [],
    approxDurationMinutes: { min: 40, max: 60 },
    purpose: 'aerobic base',
    cues: [],
    ...overrides,
  }
}

describe('garminSportForCategory', () => {
  it('maps strength and cross-training to their buckets, everything else to running', () => {
    expect(garminSportForCategory('strength')).toBe('strength')
    expect(garminSportForCategory('cross_training')).toBe('cardio')
    expect(garminSportForCategory('easy')).toBe('running')
    expect(garminSportForCategory('vo2_intervals')).toBe('running')
    expect(garminSportForCategory('long')).toBe('running')
  })
})

describe('isPushableWorkout', () => {
  it('rejects undefined, rest, and segment-less workouts', () => {
    expect(isPushableWorkout(undefined)).toBe(false)
    expect(isPushableWorkout(workout({ category: 'rest', segments: [{ role: 'main', description: 'x' }] }))).toBe(false)
    expect(isPushableWorkout(workout({ segments: [] }))).toBe(false)
  })

  it('accepts a normal workout with segments', () => {
    expect(isPushableWorkout(workout({ segments: [{ role: 'main', description: 'run' }] }))).toBe(true)
  })
})

describe('plannedWorkoutToGarminPayload', () => {
  it('maps warmup/main/cooldown roles to Garmin step types and schedules the date', () => {
    const segments: PlannedSegment[] = [
      { role: 'warmup', description: 'easy jog', duration: { value: 10, unit: 'min' } },
      { role: 'main', description: 'steady', duration: { value: 30, unit: 'min' } },
      { role: 'cooldown', description: 'easy', duration: { value: 5, unit: 'min' } },
    ]
    const payload = plannedWorkoutToGarminPayload(workout({ segments }), '2026-06-03')

    expect(payload.scheduleDate).toBe('2026-06-03')
    expect(payload.sport).toBe('running')
    expect(payload.steps.map(s => s.stepType)).toEqual(['warmup', 'interval', 'cooldown'])
    // 10 min warmup → 600s time end condition
    expect(payload.steps[0].endCondition).toEqual({ type: 'time', value: 600 })
    // estimated duration = midpoint of approx range (40,60) → 50 min
    expect(payload.estimatedDurationSecs).toBe(50 * 60)
  })

  it('uses displayName when present, else name', () => {
    expect(plannedWorkoutToGarminPayload(workout({ name: 'A', displayName: 'B', segments: [{ role: 'main', description: 'x' }] }), '2026-06-03').name).toBe('B')
    expect(plannedWorkoutToGarminPayload(workout({ name: 'A', segments: [{ role: 'main', description: 'x' }] }), '2026-06-03').name).toBe('A')
  })

  it('wraps a repeated main segment in a repeat group with a recovery step', () => {
    const segments: PlannedSegment[] = [
      {
        role: 'main',
        description: '5x1km',
        reps: 5,
        distance: { value: 1, unit: 'km' },
        paceTarget: paceTarget({ paceSecPerMileLow: 360, paceSecPerMileHigh: 380 }),
        recovery: { type: 'jog', duration: { value: 90, unit: 'sec' } },
      },
    ]
    const payload = plannedWorkoutToGarminPayload(workout({ category: 'vo2_intervals', segments }), '2026-06-03')

    const group = payload.steps[0]
    expect(group.repeat?.count).toBe(5)
    expect(group.repeat?.steps).toHaveLength(2)

    const [work, rest] = group.repeat!.steps
    expect(work.stepType).toBe('interval')
    expect(work.endCondition).toEqual({ type: 'distance', value: 1000 })
    expect(work.target.type).toBe('pace')
    // 360 sec/mi → sec/m
    expect(work.target.low).toBeCloseTo(360 / METERS_PER_MILE, 3)

    expect(rest.stepType).toBe('recovery')
    expect(rest.endCondition).toEqual({ type: 'time', value: 90 })
    expect(rest.target).toEqual({ type: 'open' })
  })

  it('does not wrap a single-rep main segment in a repeat group', () => {
    const segments: PlannedSegment[] = [
      { role: 'main', description: 'tempo', reps: 1, duration: { value: 20, unit: 'min' } },
    ]
    const payload = plannedWorkoutToGarminPayload(workout({ segments }), '2026-06-03')
    expect(payload.steps[0].repeat).toBeUndefined()
    expect(payload.steps[0].stepType).toBe('interval')
  })

  it('selects HR target when preferredMode is hr', () => {
    const segments: PlannedSegment[] = [
      {
        role: 'main',
        description: 'aerobic',
        duration: { value: 40, unit: 'min' },
        paceTarget: paceTarget({ preferredMode: 'hr', hrBpmLow: 140, hrBpmHigh: 155 }),
      },
    ]
    const payload = plannedWorkoutToGarminPayload(workout({ segments }), '2026-06-03')
    expect(payload.steps[0].target).toEqual({ type: 'heart.rate', low: 140, high: 155 })
  })

  it('falls back to HR when pace is preferred but only HR bounds exist', () => {
    const segments: PlannedSegment[] = [
      {
        role: 'main',
        description: 'aerobic',
        duration: { value: 40, unit: 'min' },
        paceTarget: paceTarget({ preferredMode: 'pace', hrBpmLow: 140, hrBpmHigh: 155 }),
      },
    ]
    const payload = plannedWorkoutToGarminPayload(workout({ segments }), '2026-06-03')
    expect(payload.steps[0].target.type).toBe('heart.rate')
  })

  it('maps an RPE-only or target-less segment to an open target', () => {
    const segments: PlannedSegment[] = [
      { role: 'main', description: 'free', duration: { value: 20, unit: 'min' }, paceTarget: paceTarget({ preferredMode: 'rpe', rpeLow: 5, rpeHigh: 6 }) },
    ]
    const payload = plannedWorkoutToGarminPayload(workout({ segments }), '2026-06-03')
    expect(payload.steps[0].target).toEqual({ type: 'open' })
  })

  it('maps a strength workout to the strength sport with timed steps', () => {
    const segments: PlannedSegment[] = [
      { role: 'main', description: 'squats', duration: { value: 15, unit: 'min' } },
    ]
    const payload = plannedWorkoutToGarminPayload(workout({ category: 'strength', segments }), '2026-06-03')
    expect(payload.sport).toBe('strength')
    expect(payload.steps[0].endCondition).toEqual({ type: 'time', value: 900 })
    expect(payload.steps[0].target).toEqual({ type: 'open' })
  })

  it('emits a lap-button step for a segment with no duration or distance', () => {
    const segments: PlannedSegment[] = [{ role: 'main', description: 'fartlek by feel' }]
    const payload = plannedWorkoutToGarminPayload(workout({ category: 'fartlek', segments }), '2026-06-03')
    expect(payload.steps[0].endCondition).toEqual({ type: 'lap.button' })
  })
})
