import { describe, it, expect } from 'vitest'
import type { TrainingWeek, PlannedDay, WorkoutType } from '../../../types'
import { assessRecalibration } from '../../../engines/planGenerator/recalibration'
import { repaceString, buildRepaceOps } from '../../../utils/repace'
import { replayEdits } from '../../../hooks/usePlanEdits'

/**
 * G5 tests: recalibration qualifies only on ≥3 honest faster sessions
 * (HR-compliant, full-distance, in-window), applies HALF the observed
 * speedup capped at 3%, GAP-corrects trail sessions — and the write-back
 * touches pace tokens on FUTURE days only, exclusively through applied
 * ops (the never-silent plan-hash guard).
 */

function day(dayLabel: string, over: Partial<PlannedDay> & { type?: WorkoutType } = {}): PlannedDay {
  return {
    day: dayLabel,
    type: over.type ?? 'quality',
    workout: over.workout ?? 'Tempo 5mi',
    detail: over.detail ?? 'Tempo at 8:40-9:00 /mi, controlled',
    zone: over.zone ?? '5 mi · Z3 (148-167) · 8:40-9:00 /mi',
    route: '', time: '45 min',
    ...over,
  }
}

// zone parses distance 5mi; estimateRunTimeRange gives durationMinLow ~ from
// pace; we rely on parsePlannedTargets seeing "45 min" → durationMin, and the
// run-range from the zone string. To keep the math exact in tests we set the
// time field directly: durationMinLow comes from estimateRunTimeRange, so we
// instead exercise the public behavior with actuals far below the fast end.
function done(distance: number, movingTimeSec: number, avgHR?: number, name = 'Morning Run') {
  return { actual: { name, distance, movingTime: movingTimeSec, avgHR } as unknown as PlannedDay['actual'] }
}

function week(days: PlannedDay[], num = 1, dates = 'Jul 1-7'): TrainingWeek {
  return { num, dates, miles: 20, focus: 'Build', days }
}

const TODAY = '2026-07-08'

describe('assessRecalibration (G5 policy)', () => {
  // 5 mi at 8:00/mi = 2400s — far faster than any parsed target fast-end
  // for a 45-min 5-miler (9:00/mi = 2700s).
  const fastDays = [
    day('Wed 7/1', done(5, 2400, 150)),
    day('Thu 7/2', done(5, 2380, 150)),
    day('Fri 7/3', done(5, 2410, 152)),
  ]

  it('qualifies on 3 honest faster sessions and suggests a conservative factor', () => {
    const a = assessRecalibration([week(fastDays)], TODAY)
    expect(a.qualifies).toBe(true)
    expect(a.sessions).toHaveLength(3)
    // Half the observed speedup, floored at 0.97 (≤3% faster).
    expect(a.suggestedFactor).toBeGreaterThanOrEqual(0.97)
    expect(a.suggestedFactor).toBeLessThan(1)
    expect(a.evidence[0]).toMatch(/faster/)
  })

  it('GUARD: 2 sessions do not qualify', () => {
    const a = assessRecalibration([week(fastDays.slice(0, 2))], TODAY)
    expect(a.qualifies).toBe(false)
    expect(a.suggestedFactor).toBe(1)
  })

  it('GUARD: a blown HR cap disqualifies the session (effort, not fitness)', () => {
    const a = assessRecalibration([week([
      day('Wed 7/1', done(5, 2400, 180)), // hrHigh 167 (+2 grace) — blown
      ...fastDays.slice(1),
    ])], TODAY)
    expect(a.sessions).toHaveLength(2)
    expect(a.qualifies).toBe(false)
  })

  it('GUARD: sessions outside the 28-day window are ignored', () => {
    const a = assessRecalibration([week(
      [day('Mon 5/4', done(5, 2400, 150)), day('Tue 5/5', done(5, 2400, 150)), day('Wed 5/6', done(5, 2400, 150))],
      1, 'May 4-10',
    )], TODAY)
    expect(a.qualifies).toBe(false)
  })

  it('GAP-corrects trail sessions (the input Runna does not have)', () => {
    // 5 mi in 2900s raw (9:40/mi — slower than target) but on terrain with
    // a 1.25 GAP multiplier → equivalent flat 7:44/mi: clearly faster.
    const a = assessRecalibration(
      [week([day('Wed 7/1', done(5, 2900, 150, 'Mountain Run')), ...fastDays.slice(1)])],
      TODAY,
      { gapFactor: (_iso, name) => (name === 'Mountain Run' ? 1.25 : null) },
    )
    expect(a.sessions).toHaveLength(3)
    expect(a.sessions[0].gapCorrected).toBe(true)
    expect(a.evidence[0]).toContain('grade-adjusted')
  })
})

describe('repace write-back (D4 — targets only, future only, applied only)', () => {
  it('rewrites single and range pace tokens by the factor', () => {
    expect(repaceString('Tempo at 8:40-9:00 /mi, controlled', 0.97))
      .toBe('Tempo at 8:24-8:44 /mi, controlled')
    expect(repaceString('Long run 10:00/mi easy', 0.97)).toBe('Long run 9:42/mi easy')
    // Non-pace text and HR bands untouched.
    expect(repaceString('Z3 (148-167), 45 min', 0.97)).toBe('Z3 (148-167), 45 min')
  })

  it('builds ops for FUTURE pace-bearing days only', () => {
    const weeks = [week([
      day('Mon 7/6', done(5, 2700)),                      // past + completed → never
      day('Thu 7/9'),                                     // future, has paces → op
      day('Fri 7/10', { type: 'rest', workout: 'Rest', detail: 'Off', zone: '—' }), // no paces → no op
    ])]
    const ops = buildRepaceOps(weeks, 0.97, TODAY, 'test')
    expect(ops).toHaveLength(1)
    expect(ops[0].op.kind).toBe('updateDay')
    const updates = (ops[0].op as { updates: { zone?: string } }).updates
    expect(updates.zone).toContain('8:24')
  })

  it('GUARD (never silent): replaying the base plan without applied ops changes nothing', () => {
    const weeks = [week([day('Thu 7/9')])]
    expect(replayEdits(weeks, [])).toEqual(weeks)
    // And applying the ops changes exactly the pace tokens.
    const ops = buildRepaceOps(weeks, 0.97, TODAY, 'test')
    const applied = replayEdits(weeks, ops.map((o, i) => ({
      id: `e${i}`, batchId: 'b1', op: o.op, appliedAt: i,
    })))
    expect(applied[0].days[0].zone).toContain('8:24-8:44 /mi')
    expect(applied[0].days[0].workout).toBe(weeks[0].days[0].workout) // structure untouched
  })

  it('factor 1 produces zero ops', () => {
    expect(buildRepaceOps([week([day('Thu 7/9')])], 1, TODAY, 'x')).toHaveLength(0)
  })
})
