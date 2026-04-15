import { describe, it, expect } from 'vitest'
import {
  detectNewWorkoutTrigger,
  detectReadinessShiftTrigger,
  detectSkippedWorkoutTrigger,
  detectWeeklyRecapTrigger,
} from '../hooks/useProactivePings'

describe('detectNewWorkoutTrigger', () => {
  it('returns null with no activities', () => {
    expect(detectNewWorkoutTrigger(null, [])).toBeNull()
  })
  it('fires when latest activity id differs from last seen', () => {
    const t = detectNewWorkoutTrigger('100', [{ id: 200 }, { id: 100 }])
    expect(t).not.toBeNull()
    expect(t!.id).toBe(200)
  })
  it('does not fire when latest has been seen', () => {
    expect(detectNewWorkoutTrigger('200', [{ id: 200 }])).toBeNull()
  })
  it('fires on first-ever sight', () => {
    const t = detectNewWorkoutTrigger(null, [{ id: 42 }])
    expect(t).not.toBeNull()
    expect(t!.id).toBe(42)
  })
})

describe('detectReadinessShiftTrigger', () => {
  it('false when either score missing', () => {
    expect(detectReadinessShiftTrigger(null, { status: 'GREEN' })).toBe(false)
    expect(detectReadinessShiftTrigger({ status: 'GREEN' }, null)).toBe(false)
  })
  it('false when status unchanged', () => {
    expect(
      detectReadinessShiftTrigger({ status: 'GREEN' }, { status: 'GREEN' }),
    ).toBe(false)
  })
  it('true on band shift', () => {
    expect(
      detectReadinessShiftTrigger({ status: 'GREEN' }, { status: 'YELLOW' }),
    ).toBe(true)
    expect(
      detectReadinessShiftTrigger({ status: 'YELLOW' }, { status: 'RED' }),
    ).toBe(true)
  })
})

describe('detectSkippedWorkoutTrigger', () => {
  it('false before 8pm', () => {
    expect(
      detectSkippedWorkoutTrigger(19, { type: 'run' }),
    ).toBe(false)
  })
  it('false for rest day', () => {
    expect(
      detectSkippedWorkoutTrigger(21, { type: 'rest' }),
    ).toBe(false)
  })
  it('false when actual is already logged', () => {
    expect(
      detectSkippedWorkoutTrigger(21, { type: 'run', actual: { name: 'x' } }),
    ).toBe(false)
  })
  it('false when no planned workout', () => {
    expect(detectSkippedWorkoutTrigger(21, undefined)).toBe(false)
  })
  it('true at 8pm on non-rest day with no actual', () => {
    expect(detectSkippedWorkoutTrigger(20, { type: 'run' })).toBe(true)
    expect(detectSkippedWorkoutTrigger(23, { type: 'quality' })).toBe(true)
  })
})

describe('detectWeeklyRecapTrigger', () => {
  it('true Sunday evening', () => {
    // 2026-04-19 is a Sunday
    const d = new Date(2026, 3, 19, 19, 0, 0)
    expect(detectWeeklyRecapTrigger(d)).toBe(true)
  })
  it('false Sunday before 6pm', () => {
    const d = new Date(2026, 3, 19, 14, 0, 0)
    expect(detectWeeklyRecapTrigger(d)).toBe(false)
  })
  it('false on any other day', () => {
    // 2026-04-18 is a Saturday, evening
    const sat = new Date(2026, 3, 18, 20, 0, 0)
    expect(detectWeeklyRecapTrigger(sat)).toBe(false)
    // 2026-04-13 is a Monday
    const mon = new Date(2026, 3, 13, 19, 0, 0)
    expect(detectWeeklyRecapTrigger(mon)).toBe(false)
  })
})
