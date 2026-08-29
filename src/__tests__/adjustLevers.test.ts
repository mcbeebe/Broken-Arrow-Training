/**
 * P6 — the Adjust tray.
 *
 * The engine could move a session; the athlete could not. Every persona
 * with a job hit the same wall: a 50-minute tempo on a day with 30 minutes
 * in it, and nothing between "do it all" and "skip it".
 */
import { describe, it, expect } from 'vitest'
import { leversFor, minutesOf, opsForLever } from '../utils/adjustLevers'
import type { PlannedDay, WorkoutType } from '../types'

const day = (type: WorkoutType, time: string, detail = ''): PlannedDay => ({
  day: 'Fri', type, workout: 'Tempo — 4×5min @ AnT', detail, zone: 'Z4', route: '', time,
})

describe('reading the session length', () => {
  it('understands the formats the plan actually writes', () => {
    expect(minutesOf(day('quality', '50 min'))).toBe(50)
    expect(minutesOf(day('long', '1.5h'))).toBe(90)
    expect(minutesOf(day('rest', '—'))).toBeNull()
    expect(minutesOf(null)).toBeNull()
  })
})

describe('fit it into 30 minutes', () => {
  it('is offered when there is genuinely time to give back', () => {
    const l = leversFor(day('quality', '50 min')).find(x => x.id === 'fit30')!
    expect(l.preview).toContain('50 min becomes 30')
  })

  it('is NOT offered when it would make the session longer', () => {
    // A 25-minute run trimmed "to 30" is not a trim.
    expect(leversFor(day('run', '25 min')).some(l => l.id === 'fit30')).toBe(false)
    expect(leversFor(day('run', '32 min')).some(l => l.id === 'fit30')).toBe(false)
  })

  it('keeps the hard part and says so, in both the preview and the outcome', () => {
    const l = leversFor(day('quality', '50 min')).find(x => x.id === 'fit30')!
    expect(l.preview).toContain('Keeps the hard part')
    expect(l.outcome).toContain('intervals are intact')
    expect(l.updates.time).toBe('30 min')
  })

  it('preserves the original detail rather than overwriting it', () => {
    const l = leversFor(day('quality', '50 min', 'Last hard touch before stations')).find(x => x.id === 'fit30')!
    expect(l.updates.detail).toContain('Last hard touch before stations')
    expect(l.updates.detail).toContain('Trimmed to 30 min')
  })
})

describe('make today easy', () => {
  it('turns a hard session into an easy run', () => {
    const l = leversFor(day('quality', '50 min')).find(x => x.id === 'easy')!
    expect(l.updates.type).toBe('run')
    expect(l.updates.zone).toBe('Z2')
    expect(l.updates.workout).toBe('Easy run')
  })

  it('is not offered on a day that is already an easy run', () => {
    expect(leversFor(day('run', '40 min')).some(l => l.id === 'easy')).toBe(false)
  })

  it('promises the work is not made up later, which is the plan doctrine', () => {
    const l = leversFor(day('quality', '50 min')).find(x => x.id === 'easy')!
    expect(l.preview).toContain('not made up later')
    expect(l.outcome).toContain('Nothing is owed back')
  })
})

describe('what is never offered', () => {
  it('leaves rest days and race days alone', () => {
    expect(leversFor(day('rest', '—'))).toEqual([])
    expect(leversFor(day('race', '2h'))).toEqual([])
    expect(leversFor(null)).toEqual([])
  })
})

describe('applying a lever', () => {
  it('is one batch, carrying the outcome as its rationale so the log reads honestly', () => {
    const l = leversFor(day('quality', '50 min')).find(x => x.id === 'fit30')!
    const ops = opsForLever(l, 6, 4)
    expect(ops).toHaveLength(1)
    expect(ops[0].op).toMatchObject({ kind: 'updateDay', weekNum: 6, dayIndex: 4 })
    expect(ops[0].rationale).toBe(l.outcome)
  })

  it('applies exactly what the preview described', () => {
    // The preview and the change come from one value — they cannot drift.
    const l = leversFor(day('quality', '50 min')).find(x => x.id === 'fit30')!
    const ops = opsForLever(l, 1, 0)
    const updates = (ops[0].op as { updates: Record<string, unknown> }).updates
    expect(updates.time).toBe('30 min')
    expect(l.preview).toContain('becomes 30')
  })
})
