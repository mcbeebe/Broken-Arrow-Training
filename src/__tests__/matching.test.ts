import { describe, it, expect } from 'vitest'
import { matchActivitiesToPlan } from '../utils/matching'
import { mikePlan } from '../data'
import type { StravaActivity } from '../types'

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
