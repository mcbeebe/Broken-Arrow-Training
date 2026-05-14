import { describe, it, expect } from 'vitest'
import { computeRaceReadiness } from '../utils/raceReadiness'
import { daysUntilRace, weeksUntilRace } from '../utils/raceCountdown'
import type { PerformanceMetrics, RaceInfo } from '../types'

function perf(ctl: number, tsb = 0): PerformanceMetrics[] {
  return [
    { date: '2026-05-01', ctl, atl: ctl, tsb, acwr: 1 },
  ]
}

function race(date: string, distanceMiles = 11.2, elevation = '3,000 ft'): RaceInfo {
  return {
    name: 'Broken Arrow 18K',
    date,
    startTime: '08:00',
    distance: '18K',
    distanceMiles,
    elevation,
    elevationRange: '',
    course: '',
    cutoff: '',
    landmarks: [],
    gear: [],
    nutrition: '',
  }
}

describe('daysUntilRace / weeksUntilRace', () => {
  it('returns days difference at midnight boundary', () => {
    const now = new Date('2026-05-14T18:00:00')
    expect(daysUntilRace('2026-05-14', now)).toBe(0)
    expect(daysUntilRace('2026-05-15', now)).toBe(1)
    expect(daysUntilRace('2026-05-21', now)).toBe(7)
  })

  it('accepts the natural-language date format used in the plan fixtures', () => {
    const now = new Date('2026-05-14T12:00:00')
    expect(daysUntilRace('Saturday, June 20, 2026', now)).toBe(37)
  })

  it('rounds up to whole weeks', () => {
    const now = new Date('2026-05-14T12:00:00')
    expect(weeksUntilRace('2026-05-21', now)).toBe(1) // exactly 7d
    expect(weeksUntilRace('2026-05-22', now)).toBe(2) // 8d → 2 weeks
  })

  it('returns null for malformed dates', () => {
    expect(daysUntilRace('')).toBeNull()
    expect(daysUntilRace('not a date')).toBeNull()
  })
})

describe('computeRaceReadiness', () => {
  const baseNow = new Date('2026-05-14T12:00:00')

  it('returns null when race has no date', () => {
    const r = { ...race('2026-07-15'), date: '' }
    expect(computeRaceReadiness({ race: r, performance: perf(50), now: baseNow })).toBeNull()
  })

  it('flags fitness as the gap when CTL is well below target in the build window', () => {
    const s = computeRaceReadiness({
      race: race('2026-07-15'), // ~9 weeks out
      performance: perf(25),    // far below target CTL of ~55 for half
      now: baseNow,
    })
    expect(s?.gap).toBe('fitness')
    expect(s?.pct).toBeLessThan(70)
    expect(s?.nextAction).toMatch(/aerobic|CTL/i)
  })

  it('flags vert as the gap when fitness is reasonable but the race is vert-heavy', () => {
    const s = computeRaceReadiness({
      race: race('2026-07-15', 18.6, '8,000 ft'), // 430 ft/mi — vert-heavy
      performance: perf(50),                       // near target → fitness ok
      now: baseNow,
    })
    expect(s?.gap).toBe('vert')
    expect(s?.nextAction).toMatch(/hill/i)
  })

  it('flags taper window when within 14 days and TSB is still negative', () => {
    const s = computeRaceReadiness({
      race: race('2026-05-21'),       // 7 days out
      performance: perf(55, -10),
      now: baseNow,
    })
    expect(s?.gap).toBe('taper')
    expect(s?.nextAction).toMatch(/volume|recovery balance/i)
  })

  it('reports on-track when within 14 days and TSB has climbed positive', () => {
    const s = computeRaceReadiness({
      race: race('2026-05-21'),
      performance: perf(55, 8),
      now: baseNow,
    })
    expect(s?.gap).toBe('on-track')
    expect(s?.headline).toMatch(/peaking/i)
  })

  it('produces a percent in 0–100', () => {
    for (const ctl of [0, 5, 25, 50, 75, 120]) {
      const s = computeRaceReadiness({
        race: race('2026-07-15'),
        performance: perf(ctl),
        now: baseNow,
      })
      expect(s?.pct).toBeGreaterThanOrEqual(0)
      expect(s?.pct).toBeLessThanOrEqual(100)
    }
  })
})
