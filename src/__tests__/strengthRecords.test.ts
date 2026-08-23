/**
 * Strength records (Phase 4) — Epley e1RM math, PR detection over the
 * logged history, weekly working-set volume, and the benchmark
 * comparison. All pure functions over the same buildProgression()
 * history the rest of the strength layer uses.
 */
import { describe, it, expect } from 'vitest'
import type { TrainingWeek, ActualWorkout, StrengthExerciseLog } from '../types'
import {
  epley1RM, e1RMSeries, e1RMTrend, detectPRs, prsOnDate, formatPR,
  weeklyStrengthVolume, gobletBenchmarkComparison,
} from '../utils/strengthRecords'
import { buildProgression } from '../utils/strengthProgression'

function strengthDay(dayLabel: string, date: string, log: StrengthExerciseLog[]): TrainingWeek['days'][number] {
  const actual: ActualWorkout = {
    stravaId: Date.parse(date), source: 'manual', distance: 0, movingTime: 3000,
    elapsedTime: 3000, elevationGain: 0, type: 'strength_training',
    name: 'Strength', startDate: `${date}T08:00:00`, strengthLog: log,
  }
  return { day: dayLabel, type: 'strength', workout: 'STRENGTH', detail: '', zone: 'Z1', route: 'Gym', time: '1 hr', actual }
}

function week(num: number, days: TrainingWeek['days']): TrainingWeek {
  return { num, dates: '', miles: 0, focus: 'Build', days }
}

const squats = (w: string, reps = 12): StrengthExerciseLog => ({
  name: 'Goblet squats', focus: 'lower',
  sets: [{ reps, weight: w }, { reps, weight: w }],
})
const pushups = (reps: number): StrengthExerciseLog => ({
  name: 'Push-ups', focus: 'upper',
  sets: [{ reps, weight: 'BW' }, { reps: reps - 2, weight: 'BW' }],
})

describe('epley1RM', () => {
  it('computes w × (1 + r/30), clamped past 12 reps, 0 when unloaded', () => {
    expect(epley1RM(100, 1)).toBeCloseTo(103.3, 1)
    expect(epley1RM(30, 8)).toBeCloseTo(38, 1)
    // A 20-rep endurance set must not fabricate a heroic max: clamped to 12.
    expect(epley1RM(30, 20)).toBe(epley1RM(30, 12))
    expect(epley1RM(0, 10)).toBe(0)
    expect(epley1RM(30, 0)).toBe(0)
  })
})

describe('PR detection', () => {
  const weeks: TrainingWeek[] = [
    week(1, [strengthDay('Mon 8/3', '2026-08-03', [squats('30 lb'), pushups(15)])]),
    week(2, [strengthDay('Mon 8/10', '2026-08-10', [squats('30 lb'), pushups(18)])]),   // push-up rep PR
    week(3, [strengthDay('Mon 8/17', '2026-08-17', [squats('35 lb'), pushups(17)])]),   // squat e1RM PR
  ]

  it('the first session establishes a baseline — it is not a PR', () => {
    const prs = detectPRs(weeks.slice(0, 1))
    expect(prs).toHaveLength(0)
  })

  it('weighted lifts PR on e1RM, bodyweight on best single-set reps', () => {
    const prs = detectPRs(weeks)
    expect(prs).toHaveLength(2)
    const pushupPR = prs.find(p => p.kind === 'reps')!
    expect(pushupPR.date).toBe('2026-08-10')
    expect(pushupPR.value).toBe(18)
    expect(pushupPR.prev).toBe(15)
    const squatPR = prs.find(p => p.kind === 'e1rm')!
    expect(squatPR.date).toBe('2026-08-17')
    expect(squatPR.value).toBe(epley1RM(35, 12))
    expect(squatPR.prev).toBe(epley1RM(30, 12))
    expect(formatPR(squatPR)).toMatch(/e1RM 49 lb \(was 42\)/)
  })

  it('prsOnDate narrows to one session\'s records', () => {
    const prs = detectPRs(weeks)
    expect(prsOnDate(prs, '2026-08-10')).toHaveLength(1)
    expect(prsOnDate(prs, '2026-08-03')).toHaveLength(0)
  })

  it('skipped sets never set a record', () => {
    const withSkip: TrainingWeek[] = [
      week(1, [strengthDay('Mon 8/3', '2026-08-03', [squats('30 lb')])]),
      week(2, [strengthDay('Mon 8/10', '2026-08-10', [{
        name: 'Goblet squats', focus: 'lower',
        sets: [{ reps: 12, weight: '50 lb', done: false }, { reps: 12, weight: '30 lb' }],
      }])]),
    ]
    expect(detectPRs(withSkip)).toHaveLength(0)
  })
})

describe('e1RM series and trend', () => {
  it('tracks loaded sessions and reports change since the first', () => {
    const weeks = [
      week(1, [strengthDay('Mon 8/3', '2026-08-03', [squats('30 lb')])]),
      week(3, [strengthDay('Mon 8/17', '2026-08-17', [squats('35 lb')])]),
    ]
    const prog = buildProgression(weeks).get('goblet squat')!
    expect(e1RMSeries(prog)).toHaveLength(2)
    const trend = e1RMTrend(prog)!
    expect(trend.current).toBe(epley1RM(35, 12))
    expect(trend.deltaPct).toBe(17) // 42 → 49
  })
})

describe('weeklyStrengthVolume', () => {
  it('counts performed working sets per week — skips and warm-ups excluded', () => {
    const weeks = [
      week(1, [strengthDay('Mon 8/3', '2026-08-03', [{
        name: 'Goblet squats', focus: 'lower',
        sets: [
          { reps: 8, weight: '15 lb', setType: 'warmup' as const },
          { reps: 12, weight: '30 lb' },
          { reps: 12, weight: '30 lb', done: false },
          { reps: 12, weight: '30 lb' },
        ],
      }])]),
      week(2, [strengthDay('Mon 8/10', '2026-08-10', [squats('30 lb')])]),
      week(3, []), // nothing logged — no entry
    ]
    expect(weeklyStrengthVolume(weeks)).toEqual([
      { weekNum: 1, sets: 2 },
      { weekNum: 2, sets: 2 },
    ])
  })
})

describe('gobletBenchmarkComparison', () => {
  const weeks = [
    week(1, [strengthDay('Mon 8/3', '2026-08-03', [squats('20 lb', 8)])]),
    week(3, [strengthDay('Mon 8/17', '2026-08-17', [squats('22.5 lb', 8)])]),
  ]
  const progs = buildProgression(weeks)

  it('reports working weight as a percent of the measured 8RM', () => {
    const c = gobletBenchmarkComparison(progs, { measuredAt: '2026-08-01', gobletSquatLb: 30 })!
    expect(c.workingLb).toBe(22.5)
    expect(c.benchLb).toBe(30)
    expect(c.pct).toBe(75)
    // e1RM 28.5 → implied 8RM ~22.5 → not above the measured 30: no claim.
    expect(c.expectedNext8RMLb).toBeNull()
  })

  it('predicts the next re-test only when the e1RM has moved past the benchmark', () => {
    const heavy = buildProgression([
      week(1, [strengthDay('Mon 8/3', '2026-08-03', [squats('30 lb', 8)])]),
      week(4, [strengthDay('Mon 8/24', '2026-08-24', [squats('40 lb', 8)])]),
    ])
    const c = gobletBenchmarkComparison(heavy, { measuredAt: '2026-08-01', gobletSquatLb: 30 })!
    // e1RM 50.7 → implied 8RM 40 (rounded to 5) > 30.
    expect(c.expectedNext8RMLb).toBe(40)
  })

  it('is null without a benchmark or without loaded history', () => {
    expect(gobletBenchmarkComparison(progs, null)).toBeNull()
    expect(gobletBenchmarkComparison(progs, { measuredAt: '2026-08-01' })).toBeNull()
    expect(gobletBenchmarkComparison(new Map(), { measuredAt: '2026-08-01', gobletSquatLb: 30 })).toBeNull()
  })
})
