/**
 * Adaptive engine PR 1 — execution scoring (both directions), the weekly
 * advance/hold/ease verdict, gap tiers, and the single-session spike cap.
 */
import { describe, it, expect } from 'vitest'
import type { PlannedDay, TrainingWeek, ActualWorkout } from '../types'
import {
  scoreWorkoutExecution, scoreWeekExecution, hrDriftFromStream,
  detectTrainingGap, longestRunCapMi,
} from '../engines/adaptive/execution'

function runDay(over: Partial<PlannedDay> = {}, actualOver: Partial<ActualWorkout> | null = {}): PlannedDay {
  const actual: ActualWorkout | undefined = actualOver === null ? undefined : {
    stravaId: 1, source: 'strava', distance: 4, movingTime: 2400, elapsedTime: 2500,
    elevationGain: 50, type: 'Run', name: 'Morning Run', startDate: '2026-09-08T07:00:00',
    avgHR: 138, ...actualOver,
  }
  return {
    day: 'Tue 9/8', type: 'run', workout: 'Easy run',
    detail: 'Conversational.', zone: '4.0 mi · Z2 (130–148)', route: '', time: '45 min',
    actual, ...over,
  }
}

function week(days: PlannedDay[], num = 3): TrainingWeek {
  return { num, dates: 'Sep 7–13', startIso: '2026-09-07', miles: 18, focus: 'Build', days }
}

// The targets parser derives the running-time band from distance+zone, so
// pace math uses the estimate mid. A 4 mi Z2 run estimates ~ 10-11 min/mi.

describe('scoreWorkoutExecution', () => {
  it('scores a clean session strong and a slow one struggled — BOTH directions exist', () => {
    // ~9:35/mi on a Z2 4-miler: at/under the estimate band.
    const strong = scoreWorkoutExecution(runDay({}, { movingTime: 2300, avgHR: 140 }), '2026-09-08')!
    expect(strong.verdict).toBe('strong')

    // ~12:55/mi with high HR: clearly slower than the band.
    const slow = scoreWorkoutExecution(runDay({}, { movingTime: 3100, avgHR: 156 }), '2026-09-08')!
    expect(slow.verdict).toBe('struggled')
    expect(slow.paceDeltaFrac!).toBeGreaterThan(0.04)
    expect(slow.reasons.join(' ')).toMatch(/slower than target/)
  })

  it('hitting pace at blown HR is a struggle, not a win', () => {
    const bought = scoreWorkoutExecution(runDay({}, { movingTime: 2300, avgHR: 158 }), '2026-09-08')!
    expect(bought.hrDeltaBpm).toBe(10)
    expect(bought.verdict).toBe('struggled')
    expect(bought.reasons.join(' ')).toMatch(/HR/)
  })

  it('an abandoned session is honest about it', () => {
    const abandoned = scoreWorkoutExecution(runDay({}, { distance: 2.2, movingTime: 1400 }), '2026-09-08')!
    expect(abandoned.verdict).toBe('struggled')
    expect(abandoned.reasons.join(' ')).toMatch(/stopped at 2.2/)
  })

  it('non-run days and unlogged days score null — no guessing', () => {
    expect(scoreWorkoutExecution(runDay({ type: 'strength' }), '2026-09-08')).toBeNull()
    expect(scoreWorkoutExecution(runDay({}, null), '2026-09-08')).toBeNull()
  })

  it('computes cardiac drift from a cached stream on steady sessions', () => {
    const stream = {
      time: Array.from({ length: 120 }, (_, i) => i * 30),
      heartrate: Array.from({ length: 120 }, (_, i) => (i < 60 ? 140 : 154)),
    }
    expect(hrDriftFromStream(stream)).toBe(10)
    const s = scoreWorkoutExecution(runDay({ type: 'long', zone: '6.0 mi · Z2 (130–148)' }, { distance: 6, movingTime: 3600 }), '2026-09-08', { hrStream: stream })!
    expect(s.hrDriftPct).toBe(10)
  })
})

describe('scoreWeekExecution — advance / hold / ease', () => {
  const quality = (actualOver: Partial<ActualWorkout> | null) =>
    runDay({ day: 'Thu 9/10', type: 'quality', workout: 'Threshold intervals', zone: '4.0 mi · Z4 (155–168)', time: '42 min' },
      actualOver === null ? null : { avgHR: 160, ...actualOver })
  const long = (actualOver: Partial<ActualWorkout> | null) =>
    runDay({ day: 'Sat 9/12', type: 'long', workout: 'Long run', zone: '6.0 mi · Z2 (130–148)', time: '66 min' },
      actualOver === null ? null : { distance: 6, movingTime: 3700, ...actualOver })

  it('a clean week advances', () => {
    const w = week([runDay({}, { movingTime: 2350 }), quality({ movingTime: 2250 }), long({})])
    const r = scoreWeekExecution(w, '2026-09-14')
    expect(r.verdict).toBe('advance')
    expect(r.completedSessions).toBe(3)
  })

  it('one struggled key session holds', () => {
    const w = week([runDay({}, { movingTime: 2350 }), quality({ movingTime: 3400 }), long({})])
    const r = scoreWeekExecution(w, '2026-09-14')
    expect(r.struggledKeys).toBe(1)
    expect(r.verdict).toBe('hold')
  })

  it('a struggled key PLUS heavy long-run drift eases', () => {
    const driftStream = {
      time: Array.from({ length: 120 }, (_, i) => i * 30),
      heartrate: Array.from({ length: 120 }, (_, i) => (i < 60 ? 140 : 154)),
    }
    const w = week([quality({ movingTime: 3400 }), long({})])
    const r = scoreWeekExecution(w, '2026-09-14', { hrStream: d => (d.type === 'long' ? driftStream : null) })
    expect(r.longRunDriftPct).toBe(10)
    expect(r.verdict).toBe('ease')
  })

  it('skipping most of the week eases regardless of what was run', () => {
    const w = week([runDay({}, { movingTime: 2350 }), quality(null), long(null)])
    const r = scoreWeekExecution(w, '2026-09-14')
    expect(r.verdict).toBe('ease')
    expect(r.reasons.join(' ')).toMatch(/33% of sessions/)
  })
})

describe('detectTrainingGap — detraining tiers', () => {
  function weeksWithLastActivity(iso: string): TrainingWeek[] {
    return [week([runDay({}, { startDate: `${iso}T07:00:00` })])]
  }

  it('maps days-off to the science tiers', () => {
    expect(detectTrainingGap(weeksWithLastActivity('2026-09-10'), '2026-09-14').tier).toBe('none')
    const resume = detectTrainingGap(weeksWithLastActivity('2026-09-05'), '2026-09-14')
    expect(resume.tier).toBe('resume')
    expect(resume.days).toBe(9)
    expect(resume.volumeFactor).toBe(1)
    const ease = detectTrainingGap(weeksWithLastActivity('2026-08-28'), '2026-09-14')
    expect(ease.tier).toBe('ease75')
    expect(ease.volumeFactor).toBe(0.75)
    expect(detectTrainingGap(weeksWithLastActivity('2026-08-01'), '2026-09-14').tier).toBe('rebuild50')
    expect(detectTrainingGap(weeksWithLastActivity('2026-06-01'), '2026-09-14').tier).toBe('restart')
  })

  it('spares strength in the guidance and never invents a gap without history', () => {
    const ease = detectTrainingGap(weeksWithLastActivity('2026-08-28'), '2026-09-14')
    expect(ease.guidance).toMatch(/strength held/i)
    expect(detectTrainingGap([week([runDay({}, null)])], '2026-09-14').tier).toBe('restart')
  })
})

describe('longestRunCapMi — the single-session spike guard', () => {
  it('caps at 110% of the trailing-30-day longest run', () => {
    const weeks = [week([
      runDay({}, { distance: 5.0, startDate: '2026-09-01T07:00:00' }),
      runDay({ day: 'Thu 9/3' }, { distance: 7.0, startDate: '2026-09-03T07:00:00' }),
    ])]
    expect(longestRunCapMi(weeks, '2026-09-14')).toBe(7.7)
    expect(longestRunCapMi([week([runDay({}, null)])], '2026-09-14')).toBeNull()
  })
})
