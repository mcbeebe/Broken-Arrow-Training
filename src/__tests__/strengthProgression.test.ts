import { describe, it, expect } from 'vitest'
import {
  parseWeightLb,
  normalizeExerciseName,
  buildProgression,
  getProgressionFor,
  suggestNextTarget,
  projectToWeek,
  formatSession,
  type ExerciseProgression,
  type ExerciseSession,
} from '../utils/strengthProgression'
import type { TrainingWeek, StrengthSet } from '../types'

describe('parseWeightLb', () => {
  it('parses common weight strings', () => {
    expect(parseWeightLb('20 lb')).toBe(20)
    expect(parseWeightLb('20 lbs')).toBe(20)
    expect(parseWeightLb('22.5')).toBe(22.5)
    expect(parseWeightLb('  15  lb ')).toBe(15)
  })

  it('returns 0 for bodyweight / blank / dash', () => {
    expect(parseWeightLb('')).toBe(0)
    expect(parseWeightLb(undefined)).toBe(0)
    expect(parseWeightLb(null)).toBe(0)
    expect(parseWeightLb('—')).toBe(0)
    expect(parseWeightLb('-')).toBe(0)
    expect(parseWeightLb('BW')).toBe(0)
    expect(parseWeightLb('bodyweight')).toBe(0)
  })

  it('returns 0 for "0 lbs" specifically', () => {
    expect(parseWeightLb('0 lbs')).toBe(0)
  })
})

describe('normalizeExerciseName', () => {
  it('matches via the exercise guide library', () => {
    // Both should resolve to "Goblet Squat" via the GUIDES match
    expect(normalizeExerciseName('Goblet Squat')).toBe(normalizeExerciseName('Goblet Squats'))
  })

  it('strips DB / BB / KB prefixes when no guide matches', () => {
    // Use a name unlikely to be in GUIDES
    expect(normalizeExerciseName('DB Hammer Curl')).toBe('hammer curl')
    expect(normalizeExerciseName('BB Hammer Curls')).toBe('hammer curl')
  })

  it('is case-insensitive and handles plurals', () => {
    expect(normalizeExerciseName('PUSH-UP')).toBe(normalizeExerciseName('push-up'))
  })
})

describe('buildProgression', () => {
  function week(num: number, days: { day: string; date: string; sets?: StrengthSet[]; name?: string }[]): TrainingWeek {
    return {
      num,
      dates: '',
      miles: 0,
      focus: '',
      days: days.map(d => ({
        day: d.day,
        type: 'strength',
        workout: '',
        detail: '',
        zone: '',
        route: '',
        time: '',
        actual: d.sets
          ? {
              stravaId: 0,
              distance: 0,
              movingTime: 0,
              elapsedTime: 0,
              elevationGain: 0,
              type: 'WeightTraining',
              name: 'Strength',
              startDate: d.date,
              strengthLog: [
                { name: d.name ?? 'Goblet Squat', focus: 'lower', sets: d.sets },
              ],
            }
          : undefined,
      })),
    }
  }

  it('returns empty map when no strength logs exist', () => {
    const weeks = [week(1, [{ day: 'Mon 4/20', date: '' }])]
    expect(buildProgression(weeks).size).toBe(0)
  })

  it('aggregates sessions across weeks for the same exercise', () => {
    const weeks = [
      week(1, [
        { day: 'Mon 4/20', date: '2026-04-20', sets: [{ reps: 8, weight: '15 lb' }, { reps: 8, weight: '15 lb' }, { reps: 8, weight: '15 lb' }] },
      ]),
      week(2, [
        { day: 'Mon 4/27', date: '2026-04-27', sets: [{ reps: 8, weight: '20 lb' }, { reps: 8, weight: '20 lb' }, { reps: 8, weight: '20 lb' }] },
      ]),
    ]
    const prog = getProgressionFor(weeks, 'Goblet Squat')
    expect(prog).not.toBeNull()
    expect(prog!.sessions).toHaveLength(2)
    expect(prog!.first?.weekNum).toBe(1)
    expect(prog!.first?.topWeightLb).toBe(15)
    expect(prog!.last?.weekNum).toBe(2)
    expect(prog!.last?.topWeightLb).toBe(20)
    expect(prog!.peakWeightLb).toBe(20)
    expect(prog!.isBodyweight).toBe(false)
  })

  it('tracks bodyweight exercises (peak = 0, isBodyweight = true)', () => {
    const weeks = [
      week(1, [
        { day: 'Mon 4/20', date: '2026-04-20', name: 'Push-Up', sets: [{ reps: 10, weight: '—' }, { reps: 10, weight: '—' }, { reps: 10, weight: '—' }] },
      ]),
    ]
    const prog = getProgressionFor(weeks, 'Push-Up')
    expect(prog).not.toBeNull()
    expect(prog!.peakWeightLb).toBe(0)
    expect(prog!.isBodyweight).toBe(true)
    expect(prog!.last?.totalReps).toBe(30)
  })
})

describe('suggestNextTarget — progression rules', () => {
  function progression(sessions: Partial<ExerciseSession>[]): ExerciseProgression {
    const filled: ExerciseSession[] = sessions.map((s, i) => ({
      date: s.date ?? `2026-04-${20 + i}`,
      weekNum: s.weekNum ?? 1,
      dayLabel: s.dayLabel ?? 'Mon',
      sets: s.sets ?? [],
      topWeightLb: s.topWeightLb ?? 0,
      totalReps: s.totalReps ?? 0,
    }))
    return {
      canonicalName: 'goblet squat',
      displayName: 'Goblet Squat',
      sessions: filled,
      first: filled[0],
      last: filled[filled.length - 1],
      peakWeightLb: filled.reduce((m, s) => Math.max(m, s.topWeightLb), 0),
      isBodyweight: filled.every(s => s.topWeightLb === 0),
    }
  }

  it('starting tier when no history', () => {
    const out = suggestNextTarget(null, 3, 8)
    expect(out.tier).toBe('starting')
    expect(out.sets).toBe(3)
    expect(out.reps).toBe(8)
  })

  it('progress tier — bumps weight when last session hit clean reps', () => {
    const prog = progression([{ topWeightLb: 20, totalReps: 24, sets: [{ reps: 8, weight: '20 lb' }, { reps: 8, weight: '20 lb' }, { reps: 8, weight: '20 lb' }] }])
    const out = suggestNextTarget(prog, 3, 8)
    expect(out.tier).toBe('progress')
    expect(out.weightLb).toBeGreaterThan(20)
    expect(out.weightLb % 2.5).toBe(0)  // rounded to 2.5 lb plate
  })

  it('hold tier — repeat weight when 80-95% of reps hit', () => {
    const prog = progression([{ topWeightLb: 20, totalReps: 21, sets: [{ reps: 8, weight: '20 lb' }, { reps: 7, weight: '20 lb' }, { reps: 6, weight: '20 lb' }] }])
    const out = suggestNextTarget(prog, 3, 8)
    expect(out.tier).toBe('hold')
    expect(out.weightLb).toBe(20)
  })

  it('deload tier — drop weight when under 80% of reps', () => {
    const prog = progression([{ topWeightLb: 30, totalReps: 12, sets: [{ reps: 5, weight: '30 lb' }, { reps: 4, weight: '30 lb' }, { reps: 3, weight: '30 lb' }] }])
    const out = suggestNextTarget(prog, 3, 8)
    expect(out.tier).toBe('deload')
    expect(out.weightLb).toBeLessThan(30)
    expect(out.weightLb).toBeGreaterThan(20) // ~ 30 × 0.9 = 27, rounded to 27.5
  })

  it('bodyweight progression — adds a rep when hitting cleanly', () => {
    const prog = progression([{ topWeightLb: 0, totalReps: 24, sets: [{ reps: 8, weight: '—' }, { reps: 8, weight: '—' }, { reps: 8, weight: '—' }] }])
    const out = suggestNextTarget(prog, 3, 8)
    expect(out.tier).toBe('progress')
    expect(out.weightLb).toBe(0)
    expect(out.reps).toBe(9)
  })

  it('bodyweight cap — flags harder variant when above 12 reps avg', () => {
    const prog = progression([{ topWeightLb: 0, totalReps: 36, sets: [{ reps: 12, weight: '—' }, { reps: 12, weight: '—' }, { reps: 12, weight: '—' }] }])
    const out = suggestNextTarget(prog, 3, 8)
    expect(out.tier).toBe('progress')
    expect(out.rationale).toMatch(/harder|alternate/i)
  })
})

describe('projectToWeek', () => {
  function progression(sessions: Partial<ExerciseSession>[], isBW = false): ExerciseProgression {
    const filled: ExerciseSession[] = sessions.map((s, i) => ({
      date: s.date ?? `2026-04-${20 + i}`,
      weekNum: s.weekNum ?? i + 1,
      dayLabel: s.dayLabel ?? 'Mon',
      sets: s.sets ?? [],
      topWeightLb: s.topWeightLb ?? 0,
      totalReps: s.totalReps ?? 0,
    }))
    return {
      canonicalName: 'goblet squat',
      displayName: 'Goblet Squat',
      sessions: filled,
      first: filled[0],
      last: filled[filled.length - 1],
      peakWeightLb: filled.reduce((m, s) => Math.max(m, s.topWeightLb), 0),
      isBodyweight: isBW || filled.every(s => s.topWeightLb === 0),
    }
  }

  it('linear projection — wk 1: 15 lb, wk 3: 20 lb → wk 5: ~25 lb', () => {
    const prog = progression([
      { weekNum: 1, topWeightLb: 15, totalReps: 24, sets: [{reps:8,weight:'15 lb'},{reps:8,weight:'15 lb'},{reps:8,weight:'15 lb'}] },
      { weekNum: 3, topWeightLb: 20, totalReps: 24, sets: [{reps:8,weight:'20 lb'},{reps:8,weight:'20 lb'},{reps:8,weight:'20 lb'}] },
    ])
    const out = projectToWeek(prog, 5)
    expect(out).not.toBeNull()
    expect(out!.method).toBe('linear')
    expect(out!.predictedWeightLb).toBe(25)
  })

  it('low confidence with single session — held at last known', () => {
    const prog = progression([{ weekNum: 1, topWeightLb: 30, totalReps: 24, sets: [{reps:8,weight:'30 lb'},{reps:8,weight:'30 lb'},{reps:8,weight:'30 lb'}] }])
    const out = projectToWeek(prog, 5)
    expect(out!.method).toBe('last-known')
    expect(out!.confidence).toBe('low')
    expect(out!.predictedWeightLb).toBe(30)
  })

  it('high confidence after 5+ monotonic sessions', () => {
    const prog = progression([
      { weekNum: 1, topWeightLb: 15, totalReps: 24, sets: [{reps:8,weight:'15 lb'},{reps:8,weight:'15 lb'},{reps:8,weight:'15 lb'}] },
      { weekNum: 2, topWeightLb: 17.5, totalReps: 24, sets: [{reps:8,weight:'17.5 lb'},{reps:8,weight:'17.5 lb'},{reps:8,weight:'17.5 lb'}] },
      { weekNum: 3, topWeightLb: 20, totalReps: 24, sets: [{reps:8,weight:'20 lb'},{reps:8,weight:'20 lb'},{reps:8,weight:'20 lb'}] },
      { weekNum: 4, topWeightLb: 22.5, totalReps: 24, sets: [{reps:8,weight:'22.5 lb'},{reps:8,weight:'22.5 lb'},{reps:8,weight:'22.5 lb'}] },
      { weekNum: 5, topWeightLb: 25, totalReps: 24, sets: [{reps:8,weight:'25 lb'},{reps:8,weight:'25 lb'},{reps:8,weight:'25 lb'}] },
    ])
    const out = projectToWeek(prog, 9)
    expect(out!.confidence).toBe('high')
    expect(out!.predictedWeightLb).toBe(35)  // slope 2.5/wk × wk9 + intercept
  })

  it('bodyweight projection — predicts reps not weight', () => {
    const prog = progression([
      { weekNum: 1, topWeightLb: 0, totalReps: 24, sets: [{reps:8,weight:'—'},{reps:8,weight:'—'},{reps:8,weight:'—'}] },
      { weekNum: 3, topWeightLb: 0, totalReps: 30, sets: [{reps:10,weight:'—'},{reps:10,weight:'—'},{reps:10,weight:'—'}] },
    ], true)
    const out = projectToWeek(prog, 5)
    expect(out!.predictedWeightLb).toBe(0)
    expect(out!.predictedReps).toBe(12)
    expect(out!.method).toBe('linear')
  })

  it('returns null for empty history', () => {
    const empty: ExerciseProgression = {
      canonicalName: 'x', displayName: 'X', sessions: [], peakWeightLb: 0, isBodyweight: true,
    }
    expect(projectToWeek(empty, 5)).toBeNull()
  })

  it('flat trajectory — held steady, weight unchanged', () => {
    const prog = progression([
      { weekNum: 1, topWeightLb: 20, totalReps: 24, sets: [{reps:8,weight:'20 lb'},{reps:8,weight:'20 lb'},{reps:8,weight:'20 lb'}] },
      { weekNum: 2, topWeightLb: 20, totalReps: 24, sets: [{reps:8,weight:'20 lb'},{reps:8,weight:'20 lb'},{reps:8,weight:'20 lb'}] },
      { weekNum: 3, topWeightLb: 20, totalReps: 24, sets: [{reps:8,weight:'20 lb'},{reps:8,weight:'20 lb'},{reps:8,weight:'20 lb'}] },
    ])
    const out = projectToWeek(prog, 5)
    expect(out!.predictedWeightLb).toBe(20)
  })
})

describe('formatSession', () => {
  it('renders weighted session', () => {
    const s: ExerciseSession = { date: '2026-04-20', weekNum: 1, dayLabel: 'Mon', sets: [{ reps: 8, weight: '20 lb' }, { reps: 8, weight: '20 lb' }, { reps: 8, weight: '20 lb' }], topWeightLb: 20, totalReps: 24 }
    expect(formatSession(s)).toMatch(/20 lb/)
    expect(formatSession(s)).toMatch(/Wk 1/)
  })

  it('renders bodyweight session without weight prefix', () => {
    const s: ExerciseSession = { date: '2026-04-20', weekNum: 2, dayLabel: 'Mon', sets: [{ reps: 10, weight: '—' }, { reps: 10, weight: '—' }], topWeightLb: 0, totalReps: 20 }
    const fmt = formatSession(s)
    expect(fmt).toMatch(/Wk 2/)
    expect(fmt).not.toMatch(/lb/)
  })
})
