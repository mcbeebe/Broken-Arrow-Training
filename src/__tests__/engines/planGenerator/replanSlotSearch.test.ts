/**
 * T2 — "move it later" must actually try every later day.
 *
 * The slot search abandoned the whole week the moment ONE candidate was
 * rejected, so a perfectly good slot two days further on was never tried
 * and the session was silently skipped instead of moved. The athlete was
 * told "moved" and got a skip.
 */
import { describe, it, expect } from 'vitest'
import { replanMissedKeySession, moveOutcomeFor } from '../../../engines/planGenerator/replan'
import type { TrainingPlan, PlannedDay, WorkoutType } from '../../../types'

const day = (label: string, type: WorkoutType, workout: string): PlannedDay => ({
  day: label, type, workout, detail: '', zone: 'Z2', route: '', time: '40 min',
})

/**
 * Monday's quality session is missed. Tuesday is a run but Wednesday is
 * hard, so Tuesday is not a legal home. Thursday is a run followed by a
 * rest day — a legal home, and the one the athlete expects.
 */
const planWithALaterSlot = (): TrainingPlan => ({
  athlete: { name: 'Test' } as TrainingPlan['athlete'],
  zones: [],
  race: { name: 'Test race', date: '2026-12-05' } as TrainingPlan['race'],
  weeks: [{
    num: 1,
    dates: 'Aug 24 – Aug 30',
    startIso: '2026-08-24',
    miles: 20,
    focus: 'Build',
    days: [
      day('Mon', 'quality', 'Tempo — 4×5min @ AnT'),  // missed
      day('Tue', 'run', 'Easy run'),                  // rejected: Wed is hard
      day('Wed', 'long', 'Long run'),
      day('Thu', 'run', 'Easy run'),                  // legal — Fri is rest
      day('Fri', 'rest', 'Rest'),
      day('Sat', 'run', 'Easy run'),
      day('Sun', 'rest', 'Rest'),
    ],
  }],
})

describe('missed key session — the slot search', () => {
  it('moves the session to a later legal day instead of giving up at the first rejection', () => {
    const out = replanMissedKeySession(planWithALaterSlot(), '2026-08-24')
    const week = out.weeks[0]

    // The tempo must have landed on Thursday, the first legal slot after Tuesday.
    expect(week.days[3].type).toBe('quality')
    expect(week.days[3].workout).toContain('Tempo')
    // Thursday keeps its own day label — only the session moved.
    expect(week.days[3].day).toBe('Thu')

    // Monday is now an explicit moved-later note, not a bare skip.
    expect(week.days[0].detail ?? '').toMatch(/moved later/i)

    // And the rejected candidate was left alone.
    expect(week.days[1].type).toBe('run')
  })

  it('still skips honestly when no later day in the week is legal', () => {
    const plan = planWithALaterSlot()
    // Make every remaining run sit next to a hard day.
    plan.weeks[0].days[4] = day('Fri', 'long', 'Long run')
    plan.weeks[0].days[6] = day('Sun', 'quality', 'Intervals')
    plan.weeks[0].days[5] = day('Sat', 'run', 'Easy run') // flanked by two hard days
    plan.weeks[0].days[3] = day('Thu', 'run', 'Easy run') // Fri is now hard

    const out = replanMissedKeySession(plan, '2026-08-24')
    const week = out.weeks[0]
    // Nothing was moved into an illegal slot.
    expect(week.days[3].type).toBe('run')
    expect(week.days[5].type).toBe('run')
    // The missed day is resolved one way or another, never left dangling.
    expect(week.days[0].detail ?? '').toMatch(/skipped|moved later/i)
  })
})

describe('the athlete is told which outcome they will get', () => {
  it('names the day when a legal slot exists', () => {
    const out = moveOutcomeFor(planWithALaterSlot().weeks, '2026-08-24')
    expect(out).toEqual({ kind: 'moved', toDay: 'Thu' })
  })

  it('says it will skip when nothing later works', () => {
    const plan = planWithALaterSlot()
    // Every remaining run now sits immediately before a hard day.
    plan.weeks[0].days[4] = day('Fri', 'long', 'Long run')
    plan.weeks[0].days[6] = day('Sun', 'quality', 'Intervals')
    const out = moveOutcomeFor(plan.weeks, '2026-08-24')
    expect(out.kind).toBe('skipped')
  })

  it('reports the same answer the engine actually produces', () => {
    // The preview must never disagree with the rule it previews.
    const plan = planWithALaterSlot()
    const preview = moveOutcomeFor(plan.weeks, '2026-08-24')
    const applied = replanMissedKeySession(plan, '2026-08-24').weeks[0]
    if (preview.kind === 'moved') {
      const landed = applied.days.find(d => d.day === preview.toDay)
      expect(landed?.type).toBe('quality')
    } else {
      expect(applied.days.every(d => d.type !== 'quality')).toBe(true)
    }
  })
})
