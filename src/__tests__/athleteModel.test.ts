/**
 * Adaptive engine PR 4 — the Athlete Model: critical-speed frontier
 * fit with its honest fallback, the pace-at-HR efficiency trend, and
 * measured volume, all null without supporting data.
 */
import { describe, it, expect } from 'vitest'
import type { PlannedDay, TrainingWeek, ActualWorkout } from '../types'
import { buildAthleteModel, fitCriticalSpeed, efficiencyTrend, fmtPaceSecMi } from '../engines/adaptive/athleteModel'

const MILE_M = 1609.344

function run(iso: string, miles: number, sec: number, over: Partial<PlannedDay> = {}, avgHR?: number): PlannedDay {
  const actual: ActualWorkout = {
    stravaId: 1, source: 'strava', distance: miles, movingTime: sec, elapsedTime: sec + 60,
    elevationGain: 0, type: 'Run', name: 'Run', startDate: `${iso}T07:00:00`, avgHR,
  }
  return {
    day: 'Tue', type: 'run', workout: 'Run', detail: '', zone: `${miles} mi · Z2 (130–148)`,
    route: '', time: '45 min', actual, ...over,
  }
}

function weeksOf(days: PlannedDay[]): TrainingWeek[] {
  return [{ num: 1, dates: '', startIso: '2026-06-01', miles: 0, focus: 'Build', days }]
}

function effort(iso: string, sec: number, paceSecMi: number) {
  const miles = sec / paceSecMi
  return { isoDate: iso, sec, meters: miles * MILE_M, type: 'run' }
}

describe('fitCriticalSpeed', () => {
  it('recovers CS and D-prime from a spread best-effort frontier', () => {
    // Synthesize efforts on a true CS=3.2 m/s (8:23/mi), D'=200 m line.
    const CS = 3.2
    const D = 200
    const mk = (iso: string, sec: number) => ({ isoDate: iso, sec, meters: CS * sec + D, type: 'run' })
    const est = fitCriticalSpeed([
      mk('2026-06-02', 5 * 60), mk('2026-06-09', 12 * 60), mk('2026-06-16', 25 * 60),
      mk('2026-06-23', 45 * 60), mk('2026-06-30', 70 * 60),
    ])!
    expect(est.method).toBe('linear-fit')
    expect(est.secPerMi).toBeCloseTo(Math.round(MILE_M / CS), -1)
    expect(est.dPrimeMeters).toBeGreaterThan(150)
    expect(est.dPrimeMeters).toBeLessThan(250)
  })

  it('falls back to a best-effort lower bound when the frontier has no spread', () => {
    // Three near-identical easy 30-min runs — no fit possible.
    const est = fitCriticalSpeed([
      effort('2026-06-02', 30 * 60, 600),
      effort('2026-06-09', 31 * 60, 605),
      effort('2026-06-16', 30 * 60, 590),
    ])!
    expect(est.method).toBe('best-effort')
    expect(est.secPerMi).toBe(590)
    expect(est.dPrimeMeters).toBe(0)
  })

  it('returns null with no usable efforts', () => {
    expect(fitCriticalSpeed([])).toBeNull()
    expect(fitCriticalSpeed([effort('2026-06-02', 2 * 60, 500)])).toBeNull() // too short
  })
})

describe('efficiencyTrend', () => {
  it('measures fitness as speed-per-heartbeat improving between windows', () => {
    const runs = [
      // Baseline window: 10:00/mi at 150 bpm.
      ...['2026-06-02', '2026-06-05', '2026-06-09'].map(iso =>
        ({ isoDate: iso, sec: 1800, meters: 3 * MILE_M, avgHR: 150, type: 'run' })),
      // Current window: same pace at 138 bpm — fitter.
      ...['2026-08-20', '2026-08-23', '2026-08-25'].map(iso =>
        ({ isoDate: iso, sec: 1800, meters: 3 * MILE_M, avgHR: 138, type: 'run' })),
    ]
    const t = efficiencyTrend(runs, '2026-08-26')!
    expect(t.deltaPct).toBeGreaterThanOrEqual(8)
    expect(t.current).toBeGreaterThan(t.baseline)
    expect(t.sampleCount).toBe(6)
  })

  it('refuses to trend from thin data', () => {
    const runs = ['2026-08-20', '2026-08-23'].map(iso =>
      ({ isoDate: iso, sec: 1800, meters: 3 * MILE_M, avgHR: 140, type: 'run' }))
    expect(efficiencyTrend(runs, '2026-08-26')).toBeNull()
  })
})

describe('buildAthleteModel', () => {
  it('assembles measured volume, strength trends, and benchmarks with provenance', () => {
    const days = [
      run('2026-08-10', 4, 2400, {}, 140),
      run('2026-08-17', 5, 3000, {}, 141),
      run('2026-08-24', 6, 3600, { type: 'long' }, 142),
      {
        ...run('2026-08-11', 0, 0, { type: 'strength', workout: 'STRENGTH', zone: 'Z1' }),
        actual: {
          stravaId: 9, source: 'manual', distance: 0, movingTime: 3000, elapsedTime: 3000,
          elevationGain: 0, type: 'strength_training', name: 'Strength', startDate: '2026-08-11T08:00:00',
          strengthLog: [{ name: 'Goblet squats', focus: 'lower', sets: [{ reps: 8, weight: '30 lb' }] }],
        } as ActualWorkout,
      },
      {
        ...run('2026-08-18', 0, 0, { type: 'strength', workout: 'STRENGTH', zone: 'Z1' }),
        actual: {
          stravaId: 10, source: 'manual', distance: 0, movingTime: 3000, elapsedTime: 3000,
          elevationGain: 0, type: 'strength_training', name: 'Strength', startDate: '2026-08-18T08:00:00',
          strengthLog: [{ name: 'Goblet squats', focus: 'lower', sets: [{ reps: 8, weight: '35 lb' }] }],
        } as ActualWorkout,
      },
    ]
    const m = buildAthleteModel(weeksOf(days), '2026-08-26', {
      capacity: { measuredAt: '2026-08-26', gobletSquatLb: 30, erg500Sec: 112 },
    })
    expect(m.weeklyRunMiles4wk).toBeCloseTo(3.8, 1)
    expect(m.longestRun30dMi).toBe(6)
    expect(m.strength[0].name.toLowerCase()).toContain('goblet')
    expect(m.strength[0].deltaPct).toBeGreaterThan(0)
    expect(m.stationBenchmarks.map(b => b.label)).toContain('500 m erg')
    expect(m.criticalSpeed).not.toBeNull()
    // Not enough steady-HR spread across windows for a trend.
    expect(m.efficiency).toBeNull()
  })

  it('a fresh athlete gets an all-null model, not invented numbers', () => {
    const m = buildAthleteModel(weeksOf([]), '2026-08-26')
    expect(m.criticalSpeed).toBeNull()
    expect(m.efficiency).toBeNull()
    expect(m.weeklyRunMiles4wk).toBeNull()
    expect(m.strength).toHaveLength(0)
  })

  it('fmtPaceSecMi renders mm:ss', () => {
    expect(fmtPaceSecMi(503)).toBe('8:23 /mi')
  })
})
