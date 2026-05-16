import { describe, it, expect } from 'vitest'
import {
  buildRaceReadinessDetail,
  computeRaceReadiness,
  parseRaceElevationFt,
  shouldTrackVerticalGain,
  VERT_TRACKING_FT_PER_MI,
} from '../utils/raceReadiness'
import { daysUntilRace, weeksUntilRace } from '../utils/raceCountdown'
import type { PerformanceMetrics, RaceInfo, TrainingWeek } from '../types'

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

describe('shouldTrackVerticalGain', () => {
  it('is true when race elevation exceeds 100 ft/mi (Broken Arrow 18K ≈ 268 ft/mi)', () => {
    expect(shouldTrackVerticalGain(race('2026-07-15', 11.2, '3,000 ft'))).toBe(true)
  })

  it('is true for a very steep race', () => {
    expect(shouldTrackVerticalGain(race('2026-07-15', 18.6, '8,000 ft'))).toBe(true)
  })

  it('is false for a flat road race (~50 ft/mi)', () => {
    expect(shouldTrackVerticalGain(race('2026-07-15', 13.1, '650 ft'))).toBe(false)
  })

  it('is false right at the 100 ft/mi boundary (strict >)', () => {
    expect(shouldTrackVerticalGain(race('2026-07-15', 10, '1,000 ft'))).toBe(false)
  })

  it('is false when elevation is missing or distance is zero', () => {
    expect(shouldTrackVerticalGain(race('2026-07-15', 0, '3,000 ft'))).toBe(false)
    expect(shouldTrackVerticalGain(race('2026-07-15', 18.6, ''))).toBe(false)
  })

  it('is false for null/undefined race', () => {
    expect(shouldTrackVerticalGain(null)).toBe(false)
    expect(shouldTrackVerticalGain(undefined)).toBe(false)
  })

  it('uses the documented 100 ft/mi threshold constant', () => {
    expect(VERT_TRACKING_FT_PER_MI).toBe(100)
  })
})

describe('parseRaceElevationFt', () => {
  it('parses "3,000 ft" to 3000', () => {
    expect(parseRaceElevationFt(race('2026-07-15', 11.2, '3,000 ft'))).toBe(3000)
  })

  it('returns 0 when elevation is empty or unparseable', () => {
    expect(parseRaceElevationFt(race('2026-07-15', 11.2, ''))).toBe(0)
    expect(parseRaceElevationFt(race('2026-07-15', 11.2, 'TBD'))).toBe(0)
  })

  it('returns 0 for null/undefined race', () => {
    expect(parseRaceElevationFt(null)).toBe(0)
    expect(parseRaceElevationFt(undefined)).toBe(0)
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

// Sample plan slice — three consecutive weeks with the typical layout
// (strength + easy + quality + long + cross). Used by detail-builder tests.
function sampleWeeks(): TrainingWeek[] {
  return [
    {
      num: 5, dates: 'May 11–17', miles: 14, focus: 'Vert build',
      days: [
        { day: 'Mon 5/11', type: 'strength', workout: 'STRENGTH', detail: 'Squats, lunges', zone: 'Z1', route: 'Gym', time: '1 hr' },
        { day: 'Tue 5/12', type: 'run', workout: 'Easy run', detail: 'Conversational', zone: '3.0 mi · Z2', route: 'Park', time: '45 min' },
        { day: 'Wed 5/13', type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' },
        { day: 'Thu 5/14', type: 'quality', workout: 'Hill repeats', detail: '4×90s uphill', zone: 'Z3 intervals', route: 'Hill', time: '1 hr' },
        { day: 'Fri 5/15', type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' },
        { day: 'Sat 5/16', type: 'cross', workout: 'CROSS-TRAIN', detail: 'Bike + mobility', zone: 'Z2', route: 'Gym', time: '1 hr' },
        { day: 'Sun 5/17', type: 'long', workout: 'LONG RUN — Hilly', detail: '~760 ft gain', zone: '5.0 mi · Z2', route: 'Canyon', time: '1 hr 30 min' },
      ],
    },
    {
      num: 6, dates: 'May 18–24', miles: 16, focus: 'Vert build',
      days: [
        { day: 'Mon 5/18', type: 'strength', workout: 'STRENGTH', detail: '', zone: 'Z1', route: 'Gym', time: '1 hr' },
        { day: 'Tue 5/19', type: 'run', workout: 'Easy run', detail: '', zone: '3.5 mi · Z2', route: 'Park', time: '50 min' },
        { day: 'Wed 5/20', type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' },
        { day: 'Thu 5/21', type: 'quality', workout: 'Hill repeats', detail: '5×90s uphill', zone: 'Z3 intervals', route: 'Hill', time: '1 hr' },
        { day: 'Fri 5/22', type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' },
        { day: 'Sat 5/23', type: 'cross', workout: 'CROSS-TRAIN', detail: '', zone: 'Z2', route: 'Gym', time: '1 hr' },
        { day: 'Sun 5/24', type: 'long', workout: 'LONG RUN — Hilly', detail: '~900 ft gain', zone: '6.0 mi · Z2', route: 'Canyon', time: '1 hr 50 min' },
      ],
    },
    {
      num: 7, dates: 'May 25–31', miles: 17, focus: 'Peak vert',
      days: [
        { day: 'Mon 5/25', type: 'strength', workout: 'STRENGTH', detail: '', zone: 'Z1', route: 'Gym', time: '1 hr' },
        { day: 'Tue 5/26', type: 'run', workout: 'Easy run', detail: '', zone: '4.0 mi · Z2', route: 'Park', time: '55 min' },
        { day: 'Wed 5/27', type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' },
        { day: 'Thu 5/28', type: 'quality', workout: 'Hill repeats', detail: '6×2 min uphill', zone: 'Z3 intervals', route: 'Hill', time: '1 hr 10 min' },
        { day: 'Fri 5/29', type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' },
        { day: 'Sat 5/30', type: 'cross', workout: 'CROSS-TRAIN', detail: '', zone: 'Z2', route: 'Gym', time: '1 hr' },
        { day: 'Sun 5/31', type: 'long', workout: 'LONG RUN — Hilly', detail: '~1100 ft gain', zone: '7.0 mi · Z2', route: 'Canyon', time: '2 hr' },
      ],
    },
  ]
}

describe('buildRaceReadinessDetail', () => {
  const baseNow = new Date('2026-05-14T12:00:00')

  it('vert gap anchors prescription to the existing quality day and long run', () => {
    const r = race('2026-06-19', 11.2, '3,800 ft') // Mike's exact race
    const summary = computeRaceReadiness({ race: r, performance: perf(50), now: baseNow })!
    expect(summary.gap).toBe('vert')

    const detail = buildRaceReadinessDetail({
      summary,
      weeks: sampleWeeks(),
      currentWeekNum: 5,
      race: r,
    })

    // Names the actual planned day (Thu 5/14) and long run (Sun 5/17).
    const allDayLabels = detail.weeks.flatMap(w => w.assignments.map(a => a.dayLabel))
    expect(allDayLabels).toContain('Thu 5/14')
    expect(allDayLabels).toContain('Sun 5/17')

    // Targets the existing quality + long workouts (not easy / strength / cross).
    const types = new Set(detail.weeks.flatMap(w => w.assignments.map(a => a.workoutType)))
    expect(types.has('quality')).toBe(true)
    expect(types.has('long')).toBe(true)
    expect(types.has('strength')).toBe(false)
    expect(types.has('cross')).toBe(false)

    // Card summary line references real days, not generic "next 3 weeks".
    expect(detail.specificNextAction).toMatch(/Thu/)
    expect(detail.specificNextAction).toMatch(/Sun/)
    expect(detail.specificNextAction).toMatch(/ft/)

    // Per-workout guidance covers every category so easy / strength / cross
    // get explicit "leave alone" instructions.
    const categories = detail.guidance.map(g => g.category)
    expect(categories).toEqual(expect.arrayContaining(['easy', 'long', 'quality', 'strength', 'cross']))
    expect(detail.guidance.find(g => g.category === 'easy')!.text).toMatch(/flat|conversational|easy/i)
  })

  it('fitness gap anchors to cross-train and long-run slots', () => {
    const r = race('2026-07-15') // ~9 weeks out
    const summary = computeRaceReadiness({ race: r, performance: perf(25), now: baseNow })!
    expect(summary.gap).toBe('fitness')

    const detail = buildRaceReadinessDetail({
      summary,
      weeks: sampleWeeks(),
      currentWeekNum: 5,
      race: r,
    })

    const types = new Set(detail.weeks.flatMap(w => w.assignments.map(a => a.workoutType)))
    expect(types.has('cross')).toBe(true)
    expect(types.has('long')).toBe(true)
    expect(detail.specificNextAction).toMatch(/CTL/)
  })

  it('taper gap restricts horizon and touches strength + long', () => {
    const r = race('2026-05-21') // 7 days out
    const summary = computeRaceReadiness({ race: r, performance: perf(55, -10), now: baseNow })!
    expect(summary.gap).toBe('taper')

    const detail = buildRaceReadinessDetail({
      summary,
      weeks: sampleWeeks(),
      currentWeekNum: 5,
      race: r,
    })

    expect(detail.horizonWeeks).toBeLessThanOrEqual(2)
    const types = new Set(detail.weeks.flatMap(w => w.assignments.map(a => a.workoutType)))
    expect(types.has('strength')).toBe(true) // taper guidance touches strength
    expect(detail.guidance.find(g => g.category === 'strength')!.text).toMatch(/skip|maintenance|bodyweight/i)
  })

  it('falls back gracefully when no weeks supplied', () => {
    const r = race('2026-07-15', 18.6, '8,000 ft')
    const summary = computeRaceReadiness({ race: r, performance: perf(50), now: baseNow })!
    const detail = buildRaceReadinessDetail({
      summary,
      weeks: [],
      currentWeekNum: 1,
      race: r,
    })

    // No planned weeks to anchor to → falls back to summary.nextAction.
    expect(detail.weeks).toEqual([])
    expect(detail.specificNextAction).toBe(summary.nextAction)
    // Generic per-workout guidance still rendered.
    expect(detail.guidance.length).toBeGreaterThan(0)
  })
})
