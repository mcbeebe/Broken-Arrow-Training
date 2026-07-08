import { describe, it, expect } from 'vitest'
import type { TrainingWeek, PlannedDay, WorkoutType } from '../../types'
import {
  assessRealignment,
  buildRealignmentContext,
  realignmentContextForWeeks,
} from '../../utils/realignment'

/**
 * G4 trigger-policy tests (docs/gap-closure-build-plan.md §3):
 * fires on 1 missed KEY session or 2 missed of any type within 7 days —
 * tighter than Runna's >3 benchmark — with guards: a compliant week, rest
 * days, today's not-yet-done workout, and stale misses outside the window
 * must all stay silent.
 */

function d(day: string, type: WorkoutType, opts: Partial<PlannedDay> = {}): PlannedDay {
  return {
    day, type,
    workout: opts.workout ?? `${type} session`,
    detail: '', zone: '4 mi · Z2 (108-148)', route: '', time: '45 min',
    ...opts,
  }
}

const done = { actual: { name: 'run', distance: 4 } as unknown as PlannedDay['actual'] }

function week(days: PlannedDay[], num = 1): TrainingWeek {
  return { num, dates: 'Jul 6-12', miles: 20, focus: 'Build', days }
}

const TODAY = '2026-07-10' // Friday of the test week

describe('assessRealignment (G4 trigger policy)', () => {
  it('fires on 1 missed key session (long run)', () => {
    const a = assessRealignment([week([
      d('Mon 7/6', 'run', done),
      d('Tue 7/7', 'long', { workout: 'Long Run 10mi' }), // missed key
      d('Wed 7/8', 'rest'),
    ])], TODAY)
    expect(a.qualifies).toBe(true)
    expect(a.missedKey).toHaveLength(1)
    expect(a.missedKey[0].workout).toBe('Long Run 10mi')
  })

  it('fires on 2 missed non-key sessions', () => {
    const a = assessRealignment([week([
      d('Mon 7/6', 'run'),       // missed
      d('Tue 7/7', 'strength'),  // missed
      d('Wed 7/8', 'rest'),
    ])], TODAY)
    expect(a.qualifies).toBe(true)
    expect(a.missedKey).toHaveLength(0)
    expect(a.missed).toHaveLength(2)
  })

  it('GUARD: 1 missed easy run does not fire (beats nagging, still beats Runna)', () => {
    const a = assessRealignment([week([
      d('Mon 7/6', 'run'),       // one miss, non-key
      d('Tue 7/7', 'quality', done),
      d('Wed 7/8', 'rest'),
    ])], TODAY)
    expect(a.qualifies).toBe(false)
  })

  it('GUARD: a fully compliant week stays silent', () => {
    const a = assessRealignment([week([
      d('Mon 7/6', 'run', done),
      d('Tue 7/7', 'long', done),
      d('Wed 7/8', 'rest'),
      d('Thu 7/9', 'strength', done),
    ])], TODAY)
    expect(a.qualifies).toBe(false)
    expect(buildRealignmentContext(a)).toBeNull()
  })

  it('GUARD: rest/travel days are never "missed" (rest counts as compliance)', () => {
    const a = assessRealignment([week([
      d('Mon 7/6', 'rest'),
      d('Tue 7/7', 'travel'),
      d('Wed 7/8', 'rest'),
    ])], TODAY)
    expect(a.missed).toHaveLength(0)
  })

  it("GUARD: today's workout is not missed while the day is still going", () => {
    const a = assessRealignment([week([
      d('Fri 7/10', 'long'), // today — evening skipped-workout ping owns it
    ])], TODAY)
    expect(a.missed).toHaveLength(0)
  })

  it('GUARD: misses older than 7 days are outside the window', () => {
    const a = assessRealignment([
      week([d('Wed 7/1', 'long'), d('Thu 7/2', 'quality')], 1), // stale
      week([d('Mon 7/6', 'run', done)], 2),
    ], TODAY)
    expect(a.qualifies).toBe(false)
  })

  it('names the sessions in the context string', () => {
    const ctx = realignmentContextForWeeks([week([
      d('Tue 7/7', 'long', { workout: 'Long Run 10mi' }),
      d('Thu 7/9', 'strength', { workout: 'Strength A' }),
    ])], TODAY)
    expect(ctx).toContain('Long Run 10mi')
    expect(ctx).toContain('key session')
    expect(ctx).toContain('Strength A')
  })
})
