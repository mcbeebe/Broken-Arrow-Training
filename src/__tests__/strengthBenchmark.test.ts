/**
 * N4 — the strength benchmark. The complaint it answers: the app had no
 * idea whether the athlete could do 10 push-ups or 1000, so every load
 * was a library default scaled by one multiplier off a three-option
 * self-report.
 *
 * Two safety properties run through these tests, because this module
 * prescribes physical loads:
 *   - a prescription is NEVER above what was measured
 *   - a measurement only speaks for the lift it measured
 */
import { describe, it, expect } from 'vitest'
import {
  BENCHMARK_ITEMS, RETEST_WEEKS, itemsFor, isBenchmarkWeek,
  weeksSince, isStale, hasAnyMeasurement, capacitySummary,
  prescribePushUps, prescribeGobletSquat, prescribePlank, prescribeWallBalls,
  benchmarkDetail, benchmarkWorkoutName,
  type StrengthCapacity,
} from '../engines/strength/benchmark'
import { calibrateGuideWeight } from '../utils/exercises'
import { generateHyroxPlan } from '../utils/planGenerator'
import type { OnboardingConfig } from '../hooks/useOnboarding'

const cap = (over: Partial<StrengthCapacity> = {}): StrengthCapacity => ({
  measuredAt: '2026-09-01', pushUps: 30, gobletSquatLb: 50, plankSec: 90, ...over,
})

describe('the test itself', () => {
  it('every item explains what it is for and bounds its own input', () => {
    for (const i of BENCHMARK_ITEMS) {
      expect(i.protocol.length, i.id).toBeGreaterThan(30)
      expect(i.why.length, i.id).toBeGreaterThan(30)
      expect(i.max).toBeGreaterThan(i.min)
    }
  })

  it('general-conditioning athletes are not asked about sleds and wall balls', () => {
    const general = itemsFor('general').map(i => i.id)
    expect(general).toContain('push_ups')
    expect(general).not.toContain('wall_balls')
    expect(general).not.toContain('sled_push')
    expect(itemsFor('hyrox').map(i => i.id)).toContain('wall_balls')
  })

  it('the session copy says it replaces the workout and is not scored', () => {
    const first = benchmarkDetail('hyrox', false)
    expect(first).toMatch(/replaces today’s strength session/i)
    expect(first).toMatch(/nothing here is scored/i)
    expect(benchmarkWorkoutName(false)).toMatch(/baseline/i)

    const retest = benchmarkDetail('general', true)
    expect(retest).toMatch(/same protocol/i)
    expect(benchmarkWorkoutName(true)).toMatch(/re-test/i)
  })
})

describe('when it is scheduled', () => {
  it('week 1 always, then every RETEST_WEEKS', () => {
    expect(isBenchmarkWeek(1, 16)).toBe(true)
    expect(isBenchmarkWeek(1 + RETEST_WEEKS, 16)).toBe(true)
    expect(isBenchmarkWeek(1 + 2 * RETEST_WEEKS, 16)).toBe(true)
    expect(isBenchmarkWeek(2, 16)).toBe(false)
    expect(isBenchmarkWeek(4, 16)).toBe(false)
  })

  it('never in the taper or race week — those are not for testing', () => {
    expect(isBenchmarkWeek(15, 16)).toBe(false)
    expect(isBenchmarkWeek(16, 16)).toBe(false)
    // Even when the cadence would otherwise land there.
    const total = 11 // week 11 = 1 + 2*5 would be a re-test week
    expect(isBenchmarkWeek(11, total)).toBe(false)
  })
})

describe('staleness', () => {
  it('measures age in weeks and expires at the re-test cadence', () => {
    expect(weeksSince(cap(), '2026-09-01')).toBe(0)
    expect(weeksSince(cap(), '2026-09-15')).toBe(2)
    expect(isStale(cap(), '2026-09-15')).toBe(false)
    expect(isStale(cap(), `2026-10-06`)).toBe(true) // 5 weeks
  })

  it('an athlete who never tested is not "stale", just unmeasured', () => {
    expect(weeksSince(null, '2026-09-01')).toBeNull()
    expect(isStale(null, '2026-09-01')).toBe(false)
    expect(hasAnyMeasurement(null)).toBe(false)
    expect(hasAnyMeasurement({ measuredAt: '2026-09-01' })).toBe(false)
    expect(hasAnyMeasurement(cap())).toBe(true)
  })
})

describe('measurement → prescription', () => {
  it('never prescribes more than was measured', () => {
    for (const reps of [5, 12, 30, 75, 150]) {
      const p = prescribePushUps(cap({ pushUps: reps }))!
      expect(parseInt(p.text, 10), `${reps} max`).toBeLessThan(reps)
    }
    for (const lb of [20, 50, 95, 150]) {
      const p = prescribeGobletSquat(cap({ gobletSquatLb: lb }))!
      expect(parseInt(p.text, 10), `${lb} lb 8RM`).toBeLessThanOrEqual(lb)
    }
    for (const sec of [30, 90, 240]) {
      const p = prescribePlank(cap({ plankSec: sec }))!
      expect(parseInt(p.text, 10), `${sec}s max`).toBeLessThan(sec)
    }
  })

  it('a very low push-up score changes the exercise instead of the number', () => {
    const p = prescribePushUps(cap({ pushUps: 2 }))!
    expect(p.text).toMatch(/incline/i)
    expect(p.measured).toBe(true)
  })

  it('wall balls are broken into sets the athlete can actually hold', () => {
    const p = prescribeWallBalls(cap({ wallBallsUnbroken: 20 }), 100)!
    expect(p.text).toMatch(/^\d+×\d+/)
    const [sets, per] = p.text.split(' ')[0].split('×').map(Number)
    expect(per).toBeLessThan(20)          // never the whole unbroken set
    expect(sets * per).toBeGreaterThanOrEqual(100) // still covers the station
  })

  it('returns null rather than guessing when a test was skipped', () => {
    const partial: StrengthCapacity = { measuredAt: '2026-09-01', pushUps: 20 }
    expect(prescribePushUps(partial)).not.toBeNull()
    expect(prescribeGobletSquat(partial)).toBeNull()
    expect(prescribePlank(partial)).toBeNull()
    expect(prescribeWallBalls(partial, 100)).toBeNull()
  })

  it('summarises what was measured and how old it is', () => {
    const s = capacitySummary(cap(), '2026-09-15')!
    expect(s).toMatch(/30 push-ups/)
    expect(s).toMatch(/50 lb goblet squat/)
    expect(s).toMatch(/2 weeks ago/)
    expect(capacitySummary(null, '2026-09-15')).toBeNull()
  })
})

describe('a measurement only speaks for the lift it measured', () => {
  it('the tested goblet-squat load replaces the library guess', () => {
    const out = calibrateGuideWeight('15-25 lb dumbbell (focus on control, not load)', 'new', {
      capacity: cap({ gobletSquatLb: 60 }),
      exerciseName: 'Goblet Squat',
    })
    expect(out).toMatch(/from your benchmark/)
    expect(out).toMatch(/55 lb/) // 60 × 0.9 → 54 → rounded to 55
  })

  it('it does NOT leak onto other lifts — a squat says nothing about a row', () => {
    const rowed = calibrateGuideWeight('15-25 lb dumbbell (one arm at a time)', 'new', {
      capacity: cap({ gobletSquatLb: 60 }),
      exerciseName: 'Dumbbell Row',
    })
    expect(rowed).not.toMatch(/benchmark/)
    // Falls back to the self-report calibration, unchanged.
    expect(rowed).toBe(calibrateGuideWeight('15-25 lb dumbbell (one arm at a time)', 'new'))
  })

  it('an unmeasured athlete keeps the old behaviour byte for byte', () => {
    const before = calibrateGuideWeight('20-30 lb dumbbell', 'recreational')
    const after = calibrateGuideWeight('20-30 lb dumbbell', 'recreational', { capacity: null, exerciseName: 'Goblet Squat' })
    expect(after).toBe(before)
  })
})

describe('the benchmark lands in a real generated plan', () => {
  const plan = generateHyroxPlan({
    raceType: 'hyrox', raceName: 'Hyrox Anaheim', raceDate: '2026-12-05',
    experienceLevel: 'intermediate', trainingDaysPerWeek: 5, longRunDay: 'Saturday',
    wearable: 'garmin', athleteName: 'Mike', age: 45, maxHR: 200,
    equipmentAccess: ['gym'], completedAt: '',
  } as OnboardingConfig, '2026-09-01') // explicit `today` — no wall clock

  const benchDays = plan.weeks.flatMap(w =>
    w.days.filter(d => /STRENGTH BENCHMARK/i.test(d.workout)).map(d => ({ d, num: w.num })))

  it('week 1 gets a baseline test', () => {
    expect(benchDays.some(b => b.num === 1)).toBe(true)
    expect(benchDays.find(b => b.num === 1)!.d.workout).toMatch(/baseline/i)
  })

  it('there is at least one re-test, and none in the last two weeks', () => {
    expect(benchDays.length).toBeGreaterThan(1)
    expect(benchDays.filter(b => b.num > 1).every(b => /re-test/i.test(b.d.workout))).toBe(true)
    for (const b of benchDays) {
      expect(b.num, `week ${b.num} of ${plan.weeks.length}`).toBeLessThanOrEqual(plan.weeks.length - 2)
    }
  })

  it('the benchmark occupies a strength slot, not an extra day', () => {
    for (const b of benchDays) expect(b.d.type).toBe('strength')
    // Week 1 still has the same number of days as any other week.
    expect(plan.weeks[0].days.length).toBe(7)
  })
})
