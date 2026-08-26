/**
 * Adaptive engine PR 2 — the Monday Review: evidence → typed adjustment
 * diffs with ready-made plan-edit ops, guardrails included.
 */
import { describe, it, expect } from 'vitest'
import type { PlannedDay, TrainingWeek, ActualWorkout } from '../types'
import { buildWeeklyReview } from '../engines/adaptive/weeklyReview'

function day(over: Partial<PlannedDay>, actualOver?: Partial<ActualWorkout> | null): PlannedDay {
  const actual: ActualWorkout | undefined = actualOver == null ? undefined : {
    stravaId: 1, source: 'strava', distance: 4, movingTime: 2400, elapsedTime: 2500,
    elevationGain: 50, type: 'Run', name: 'Run', startDate: '2026-09-08T07:00:00',
    avgHR: 140, ...actualOver,
  }
  return {
    day: 'Tue 9/8', type: 'run', workout: 'Easy run', detail: 'Conversational.',
    zone: '4.0 mi · Z2 (130–148)', route: '', time: '45 min', actual, ...over,
  }
}

/** Wk 3 (reviewed, Sep 7–13) + Wk 4 (next, Sep 14–20) + a far race week. */
function plan(reviewedDays: PlannedDay[], nextDays: PlannedDay[]): TrainingWeek[] {
  return [
    { num: 3, dates: 'Sep 7–13', startIso: '2026-09-07', miles: 16, focus: 'Build', days: reviewedDays },
    { num: 4, dates: 'Sep 14–20', startIso: '2026-09-14', miles: 18, focus: 'Build', days: nextDays },
    { num: 12, dates: 'Nov 9–15', startIso: '2026-11-09', miles: 8, focus: 'Race week', days: [
      day({ day: 'Sat 11/14', type: 'race', workout: 'RACE', zone: '—', time: '—' }, null),
    ] },
  ]
}

const cleanReviewed = () => [
  day({}, { movingTime: 2350, startDate: '2026-09-08T07:00:00' }),
  day({ day: 'Thu 9/10', type: 'quality', workout: 'Threshold intervals', zone: '4.0 mi · Z4 (155–168)', time: '42 min' },
    { movingTime: 2900, avgHR: 160, startDate: '2026-09-10T07:00:00' }),
  day({ day: 'Sat 9/12', type: 'long', workout: 'Long run', zone: '6.0 mi · Z2 (130–148)', time: '72 min' },
    { distance: 6, movingTime: 4400, startDate: '2026-09-12T07:00:00' }),
]

const nextDays = () => [
  day({ day: 'Mon 9/14' }, null),
  day({ day: 'Thu 9/17', type: 'quality', workout: 'Threshold intervals', zone: '4.0 mi · Z4 (155–168)', time: '42 min' }, null),
  day({ day: 'Sat 9/19', type: 'long', workout: 'Long run', zone: '7.0 mi · Z2 (130–148)', time: '84 min' }, null),
]

describe('buildWeeklyReview', () => {
  it('a clean week advances with no adjustments', () => {
    const r = buildWeeklyReview(plan(cleanReviewed(), nextDays()), 3, '2026-09-14')!
    expect(r.execution.verdict).toBe('advance')
    expect(r.adjustments).toHaveLength(0)
    expect(r.headline).toMatch(/advances as planned/)
  })

  it('a held week proposes repeating the long run, capped and with ops', () => {
    // Long-run drift >8% → hold, and the drift is the cited reason.
    const drift = {
      time: Array.from({ length: 120 }, (_, i) => i * 30),
      heartrate: Array.from({ length: 120 }, (_, i) => (i < 60 ? 138 : 152)),
    }
    const r = buildWeeklyReview(plan(cleanReviewed(), nextDays()), 3, '2026-09-14', {
      hrStream: d => (d.type === 'long' ? drift : null),
    })!
    expect(r.execution.verdict).toBe('hold')
    const hold = r.adjustments.find(a => a.id === 'hold-long-run')!
    expect(hold.before).toContain('7 mi')
    expect(hold.after).toContain('6 mi')
    expect(hold.why).toMatch(/HR drifted 10.1%/)
    expect(hold.ops).toHaveLength(1)
    const op = hold.ops[0].op
    expect(op.kind).toBe('updateDay')
    if (op.kind === 'updateDay') {
      expect(op.weekNum).toBe(4)
      expect(op.updates.zone).toContain('6 mi')
    }
  })

  it('a consistently slow week proposes easing paces — the direction G5 never had', () => {
    const slowReviewed = [
      day({ detail: 'Easy — 10:30 /mi.' }, { movingTime: 3100, avgHR: 152, startDate: '2026-09-08T07:00:00' }),
      day({ day: 'Wed 9/9', detail: 'Easy — 10:30 /mi.' }, { movingTime: 3150, avgHR: 154, startDate: '2026-09-09T07:00:00' }),
    ]
    const next = [day({ day: 'Tue 9/15', detail: 'Easy — 10:30 /mi.' }, null)]
    const r = buildWeeklyReview(plan(slowReviewed, next), 3, '2026-09-14')!
    const ease = r.adjustments.find(a => a.id === 'ease-paces')!
    expect(ease.kind).toBe('targets')
    expect(ease.after).toContain('+3%')
    // Ops rewrite the pace token in the future day only.
    const rewritten = ease.ops.find(o => o.op.kind === 'updateDay' && o.op.weekNum === 4)
    expect(rewritten).toBeDefined()
    if (rewritten && rewritten.op.kind === 'updateDay') {
      expect(rewritten.op.updates.detail).toMatch(/10:4[0-9]\s*\/mi/)
    }
  })

  it('back-to-back hard days propose an un-stacking swap as two mirrored ops', () => {
    const next = [
      day({ day: 'Mon 9/14', type: 'quality', workout: 'Threshold intervals', zone: '4.0 mi · Z4 (155–168)' }, null),
      day({ day: 'Tue 9/15', type: 'long', workout: 'Long run', zone: '6.0 mi · Z2 (130–148)', time: '72 min' }, null),
      day({ day: 'Wed 9/16' }, null),
      day({ day: 'Thu 9/17', type: 'strength', workout: 'STRENGTH', zone: 'Z1 (110–130)', time: '50 min' }, null),
    ]
    const r = buildWeeklyReview(plan(cleanReviewed(), next), 3, '2026-09-14')!
    const swap = r.adjustments.find(a => a.id === 'space-hard-days')!
    expect(swap.ops).toHaveLength(2)
    const [a, b] = swap.ops.map(o => o.op)
    if (a.kind === 'updateDay' && b.kind === 'updateDay') {
      expect(a.updates.workout).toBe('STRENGTH')
      expect(b.updates.workout).toBe('Long run')
    }
  })

  it('a 2–4 week gap outranks tuning: 75% resumption ops over the next two weeks', () => {
    // Last activity Aug 28 → 17 days before Sep 14.
    const reviewed = [day({}, { startDate: '2026-08-28T07:00:00' })]
    const r = buildWeeklyReview(plan(reviewed, nextDays()), 3, '2026-09-14')!
    expect(r.gap.tier).toBe('ease75')
    const rescale = r.adjustments.find(a => a.id === 'gap-ease75')!
    expect(r.adjustments).toHaveLength(1) // resumption suppresses week tuning
    const zones = rescale.ops
      .map(o => (o.op.kind === 'updateDay' ? o.op.updates.zone : ''))
      .filter(Boolean)
    // 4.0 → 3, 7.0 → 5.3 (75%)
    expect(zones.some(z => z!.includes('3 mi'))).toBe(true)
    expect(zones.some(z => z!.includes('5.3 mi'))).toBe(true)
    expect(rescale.why).toMatch(/75% volume/)
  })

  it('never touches race week or logged days', () => {
    const reviewed = [day({}, { startDate: '2026-08-28T07:00:00' })]
    const r = buildWeeklyReview(plan(reviewed, nextDays()), 3, '2026-09-14')!
    for (const adj of r.adjustments) {
      for (const o of adj.ops) {
        if (o.op.kind === 'updateDay') expect(o.op.weekNum).not.toBe(12)
      }
    }
  })
})
