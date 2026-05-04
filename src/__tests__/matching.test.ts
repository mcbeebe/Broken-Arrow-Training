import { describe, it, expect } from 'vitest'
import { matchActivitiesToPlan, mergeGarminDetailIntoWeeks } from '../utils/matching'
import { mikePlan } from '../data'
import type { StravaActivity, GarminActivityDetail } from '../types'

function makeActivity(overrides: Partial<StravaActivity> = {}): StravaActivity {
  return {
    id: 1,
    name: 'Morning Run',
    type: 'Run',
    sport_type: 'Run',
    distance: 4828, // ~3 miles
    moving_time: 2700,
    elapsed_time: 3000,
    total_elevation_gain: 50,
    average_heartrate: 135,
    max_heartrate: 155,
    start_date_local: '2026-04-14T07:00:00Z',
    start_date: '2026-04-14T14:00:00Z',
    ...overrides,
  }
}

describe('matchActivitiesToPlan', () => {
  it('returns unmodified weeks when no activities', () => {
    const result = matchActivitiesToPlan(mikePlan.weeks, [])
    expect(result[0].days[0].actual).toBeUndefined()
  })

  it('matches activity to correct day by date', () => {
    // Tue 4/14 = Week 1, Day 2 (Easy run)
    const activity = makeActivity({ start_date_local: '2026-04-14T07:00:00Z' })
    const result = matchActivitiesToPlan(mikePlan.weeks, [activity])
    expect(result[0].days[1].actual).toBeDefined()
    expect(result[0].days[1].actual!.stravaId).toBe(1)
  })

  it('does not match activity to wrong date', () => {
    const activity = makeActivity({ start_date_local: '2026-04-14T07:00:00Z' })
    const result = matchActivitiesToPlan(mikePlan.weeks, [activity])
    // Mon 4/13 should have no match
    expect(result[0].days[0].actual).toBeUndefined()
  })

  it('converts distance from meters to miles', () => {
    const activity = makeActivity({ distance: 4828 }) // 4828m ≈ 3 mi
    const result = matchActivitiesToPlan(mikePlan.weeks, [activity])
    const actual = result[0].days[1].actual!
    expect(actual.distance).toBeCloseTo(3, 0)
  })

  it('converts elevation from meters to feet', () => {
    const activity = makeActivity({ total_elevation_gain: 100 }) // 100m ≈ 328 ft
    const result = matchActivitiesToPlan(mikePlan.weeks, [activity])
    const actual = result[0].days[1].actual!
    expect(actual.elevationGain).toBeCloseTo(328, 0)
  })

  it('preserves HR data', () => {
    const activity = makeActivity({ average_heartrate: 142, max_heartrate: 165 })
    const result = matchActivitiesToPlan(mikePlan.weeks, [activity])
    const actual = result[0].days[1].actual!
    expect(actual.avgHR).toBe(142)
    expect(actual.maxHR).toBe(165)
  })

  it('prefers type-matched activity when multiple on same day', () => {
    const run = makeActivity({ id: 1, type: 'Run', sport_type: 'Run', start_date_local: '2026-04-14T07:00:00Z' })
    const ride = makeActivity({ id: 2, type: 'Ride', sport_type: 'Ride', start_date_local: '2026-04-14T18:00:00Z' })
    const result = matchActivitiesToPlan(mikePlan.weeks, [run, ride])
    // Day 2 (Tue 4/14) is an easy run — should match the Run, not the Ride
    expect(result[0].days[1].actual!.stravaId).toBe(1)
  })
})

function makeGarminDetail(overrides: Partial<GarminActivityDetail> = {}): GarminActivityDetail {
  return {
    activityId: 1,
    name: 'Activity',
    type: 'running',
    startTimeLocal: '2026-04-14T07:00:00',
    durationSeconds: 1800,
    movingDurationSeconds: 1800,
    averageHR: 130,
    maxHR: 150,
    distanceMeters: 4828,
    elevationGainMeters: 30,
    elevationLossMeters: 30,
    calories: 250,
    ...overrides,
  }
}

describe('mergeGarminDetailIntoWeeks — multi-activity selection', () => {
  // Mon 4/13 is a strength day in mikePlan (Week 1 Day 1).
  const STRENGTH_DATE = '2026-04-13'

  it('drops sub-2-min stub activities (deleted-on-watch artifacts)', () => {
    const stub = makeGarminDetail({
      activityId: 999,
      type: 'hiking',
      durationSeconds: 60,
      movingDurationSeconds: 60,
    })
    const real = makeGarminDetail({
      activityId: 100,
      type: 'strength_training',
      durationSeconds: 2520,
      movingDurationSeconds: 1380,
    })
    const result = mergeGarminDetailIntoWeeks(mikePlan.weeks, {
      [STRENGTH_DATE]: [stub, real],
    })
    const day = result[0].days[0]
    expect(day.actual?.garminId).toBe(100)
    expect(day.secondaryActuals ?? []).toHaveLength(0)
  })

  it('picks the heaviest-scored matching activity, not the first', () => {
    // Three activities, all > 2 min. Strength day plan.
    const warmup = makeGarminDetail({
      activityId: 1,
      type: 'treadmill_running',
      durationSeconds: 300,
      movingDurationSeconds: 300,
      averageHR: 100,
    })
    const strength = makeGarminDetail({
      activityId: 2,
      type: 'strength_training',
      durationSeconds: 2520,
      movingDurationSeconds: 1380,
      averageHR: 130,
    })
    const result = mergeGarminDetailIntoWeeks(mikePlan.weeks, {
      [STRENGTH_DATE]: [warmup, strength],
    })
    const day = result[0].days[0]
    // Strength matches plan type AND scores higher than the running warm-up
    expect(day.actual?.garminId).toBe(2)
  })

  it('falls back to highest-scored when no activity matches plan type', () => {
    // Strength day, but only running activities recorded (no strength match).
    // Should pick the longer one, not just the first.
    const short = makeGarminDetail({ activityId: 1, type: 'running', durationSeconds: 600, movingDurationSeconds: 600 })
    const long = makeGarminDetail({ activityId: 2, type: 'cycling', durationSeconds: 3600, movingDurationSeconds: 3600 })
    const result = mergeGarminDetailIntoWeeks(mikePlan.weeks, {
      [STRENGTH_DATE]: [short, long],
    })
    const day = result[0].days[0]
    expect(day.actual?.garminId).toBe(2)
  })

  it('exposes non-primary activities in secondaryActuals', () => {
    const warmup = makeGarminDetail({ activityId: 1, type: 'treadmill_running', durationSeconds: 300, movingDurationSeconds: 300 })
    const strength = makeGarminDetail({ activityId: 2, type: 'strength_training', durationSeconds: 2520, movingDurationSeconds: 1380 })
    const result = mergeGarminDetailIntoWeeks(mikePlan.weeks, {
      [STRENGTH_DATE]: [warmup, strength],
    })
    const day = result[0].days[0]
    expect(day.secondaryActuals).toBeDefined()
    expect(day.secondaryActuals).toHaveLength(1)
    expect(day.secondaryActuals![0].garminId).toBe(1)
  })

  it('does not populate secondaryActuals when only one activity remains after filtering', () => {
    const stub = makeGarminDetail({ activityId: 999, type: 'hiking', durationSeconds: 30, movingDurationSeconds: 30 })
    const real = makeGarminDetail({ activityId: 100, type: 'strength_training', durationSeconds: 2520, movingDurationSeconds: 1380 })
    const result = mergeGarminDetailIntoWeeks(mikePlan.weeks, {
      [STRENGTH_DATE]: [stub, real],
    })
    const day = result[0].days[0]
    expect(day.secondaryActuals).toBeUndefined()
  })

  it('drops everything when all activities are stubs', () => {
    const stub1 = makeGarminDetail({ activityId: 1, durationSeconds: 30, movingDurationSeconds: 30 })
    const stub2 = makeGarminDetail({ activityId: 2, durationSeconds: 60, movingDurationSeconds: 60 })
    const result = mergeGarminDetailIntoWeeks(mikePlan.weeks, {
      [STRENGTH_DATE]: [stub1, stub2],
    })
    const day = result[0].days[0]
    expect(day.actual).toBeUndefined()
    expect(day.secondaryActuals).toBeUndefined()
  })
})
