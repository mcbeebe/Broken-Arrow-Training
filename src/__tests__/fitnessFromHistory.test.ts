import { describe, it, expect, beforeEach } from 'vitest'
import { deriveFitnessFromHistory } from '../utils/fitnessFromHistory'

/**
 * Plans start from your REAL fitness: the trailing 4 weeks of logged runs
 * (Garmin/Strava/manual) size the plan instead of a questionnaire guess.
 */

const TODAY = '2026-07-12'

beforeEach(() => localStorage.clear())

function seedGarmin(activities: object[]) {
  localStorage.setItem('ba_garmin_activities_t', JSON.stringify(activities))
}
function seedStrava(activities: object[]) {
  localStorage.setItem('ba_strava_activities_t', JSON.stringify(activities))
}

describe('deriveFitnessFromHistory', () => {
  it('averages 4 weeks of Garmin run miles and finds the longest run', () => {
    seedGarmin([
      { date: '2026-07-10', type: 'running', name: 'Easy', durationMinutes: 40, distanceMi: 5, elevationGainFt: 100 },
      { date: '2026-07-05', type: 'running', name: 'Long', durationMinutes: 90, distanceMi: 10, elevationGainFt: 400 },
      { date: '2026-06-28', type: 'trail_running', name: 'Trail', durationMinutes: 60, distanceMi: 6, elevationGainFt: 900 },
      { date: '2026-06-20', type: 'running', name: 'Easy', durationMinutes: 40, distanceMi: 5, elevationGainFt: 100 },
    ])
    const d = deriveFitnessFromHistory('t', TODAY)
    expect(d.weeklyMileage4wk).toBe(6.5) // 26 mi / 4
    expect(d.longestRecentRunMi).toBe(10)
    expect(d.sampleWeeks).toBeGreaterThanOrEqual(3)
  })

  it('converts Strava meters to miles', () => {
    seedStrava([
      { id: 1, name: 'Morning Run', type: 'Run', sport_type: 'Run', distance: 8047, start_date_local: '2026-07-08T07:00:00' },
      { id: 2, name: 'Morning Run', type: 'Run', sport_type: 'Run', distance: 8047, start_date_local: '2026-06-30T07:00:00' },
    ])
    const d = deriveFitnessFromHistory('t', TODAY)
    expect(d.weeklyMileage4wk).toBe(2.5) // 2 × 5.0 mi / 4
  })

  it('dedupes the same run synced from both Garmin and Strava', () => {
    seedGarmin([
      { date: '2026-07-08', type: 'running', name: 'Morning Run', durationMinutes: 45, distanceMi: 5.0, elevationGainFt: 100 },
      { date: '2026-06-30', type: 'running', name: 'Run', durationMinutes: 45, distanceMi: 5.0, elevationGainFt: 100 },
    ])
    seedStrava([
      { id: 1, name: 'Morning Run', type: 'Run', sport_type: 'Run', distance: 8047, start_date_local: '2026-07-08T07:00:00' },
    ])
    const d = deriveFitnessFromHistory('t', TODAY)
    expect(d.weeklyMileage4wk).toBe(2.5) // the Strava copy of 7/08 doesn't double-count
  })

  it('excludes rides and other non-run sports', () => {
    seedGarmin([
      { date: '2026-07-09', type: 'cycling', name: 'Ride', durationMinutes: 90, distanceMi: 30, elevationGainFt: 800 },
      { date: '2026-07-08', type: 'running', name: 'Run', durationMinutes: 40, distanceMi: 4, elevationGainFt: 100 },
      { date: '2026-06-29', type: 'running', name: 'Run', durationMinutes: 40, distanceMi: 4, elevationGainFt: 100 },
    ])
    const d = deriveFitnessFromHistory('t', TODAY)
    expect(d.weeklyMileage4wk).toBe(2) // 8 run miles / 4 — the 30-mi ride ignored
  })

  it('returns null below the minimum sample (fewer than 2 weeks with runs)', () => {
    seedGarmin([
      { date: '2026-07-10', type: 'running', name: 'Run', durationMinutes: 40, distanceMi: 5, elevationGainFt: 100 },
      { date: '2026-07-09', type: 'running', name: 'Run', durationMinutes: 40, distanceMi: 5, elevationGainFt: 100 },
    ])
    const d = deriveFitnessFromHistory('t', TODAY)
    expect(d.weeklyMileage4wk).toBeNull()
    expect(d.sampleWeeks).toBe(1)
  })

  it('ignores runs outside the 28-day window', () => {
    seedGarmin([
      { date: '2026-05-01', type: 'running', name: 'Old', durationMinutes: 60, distanceMi: 8, elevationGainFt: 100 },
      { date: '2026-07-08', type: 'running', name: 'Run', durationMinutes: 40, distanceMi: 4, elevationGainFt: 100 },
      { date: '2026-06-29', type: 'running', name: 'Run', durationMinutes: 40, distanceMi: 4, elevationGainFt: 100 },
    ])
    const d = deriveFitnessFromHistory('t', TODAY)
    expect(d.weeklyMileage4wk).toBe(2)
    expect(d.longestRecentRunMi).toBe(4)
  })

  it('counts manual logs as runs unless the name says otherwise', () => {
    localStorage.setItem('ba_manual_logs_t', JSON.stringify({
      '2026-07-07': { name: 'Tiger Mtn run', distance: 6, movingTime: 4000, elevationGain: 1200 },
      '2026-06-28': { name: 'Easy jog', distance: 4, movingTime: 2400, elevationGain: 100 },
      '2026-07-01': { name: 'Gravel ride', distance: 25, movingTime: 7200, elevationGain: 900 },
    }))
    const d = deriveFitnessFromHistory('t', TODAY)
    expect(d.weeklyMileage4wk).toBe(2.5) // 10 run miles / 4 — the ride excluded
  })

  it('empty caches → nulls, zero sample', () => {
    expect(deriveFitnessFromHistory('t', TODAY)).toEqual({ weeklyMileage4wk: null, longestRecentRunMi: null, sampleWeeks: 0 })
  })
})
