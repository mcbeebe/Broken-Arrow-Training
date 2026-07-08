import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { TrainingWeek, PlannedDay } from '../../types'
import {
  payloadHash,
  readPushedLedger,
  collectPushableDays,
  diffChangedPushedDays,
  pushWeekToGarmin,
  repushChangedWorkouts,
} from '../../utils/garminRepush'
import { buildGarminPayloadForDay } from '../../engines/planGenerator/garminWorkout'

/**
 * G2a behavioral tests (docs/gap-closure-build-plan.md §3):
 *  - week batch push sends only future, pushable, non-completed days;
 *  - auto re-push re-sends EXACTLY the previously-pushed days whose
 *    workout changed — and (guard) never re-sends untouched days,
 *    never pushes days the athlete didn't send, never pushes the past.
 */

function day(overrides: Partial<PlannedDay>): PlannedDay {
  return {
    day: 'Mon 7/13',
    type: 'run',
    workout: 'Easy Run 4mi',
    detail: 'Easy aerobic effort, conversational',
    // parsePlannedTargets reads distance + HR from `zone` (real plan format).
    zone: '4 mi · Z2 (108-148)',
    route: 'neighborhood',
    time: '45 min',
    ...overrides,
  }
}

function week(days: PlannedDay[], num = 1): TrainingWeek {
  return { num, dates: 'Jul 13-19', miles: 20, focus: 'Build', days }
}

// Fixed "today" so tests are date-stable: plan dates are hardcoded 2026.
const TODAY = '2026-07-14'

const testWeek = week([
  day({ day: 'Mon 7/13', workout: 'Easy Run 4mi' }),                    // past
  day({ day: 'Tue 7/14', workout: 'Tempo 5mi', type: 'quality' }),      // today
  day({ day: 'Wed 7/15', type: 'rest', workout: 'Rest', detail: 'Off' }), // unpushable
  day({ day: 'Thu 7/16', workout: 'Hills 5mi', type: 'quality' }),      // future
  day({
    day: 'Fri 7/17', workout: 'Easy 3mi',
    actual: { name: 'Morning Run', distance: 3.1 } as unknown as PlannedDay['actual'],
  }),                                                                    // completed
])

beforeEach(() => {
  localStorage.clear()
})

describe('payloadHash', () => {
  it('is stable for identical payloads and differs when content changes', () => {
    const p1 = buildGarminPayloadForDay(day({}), '2026-07-16')
    const p2 = buildGarminPayloadForDay(day({}), '2026-07-16')
    const p3 = buildGarminPayloadForDay(day({ zone: '6 mi · Z2 (108-148)' }), '2026-07-16')
    expect(p1).not.toBeNull()
    expect(p3).not.toBeNull()
    expect(payloadHash(p1!)).toBe(payloadHash(p2!))
    expect(payloadHash(p1!)).not.toBe(payloadHash(p3!))
  })
})

describe('collectPushableDays', () => {
  it('includes today + future pushable days; excludes past, rest, completed', () => {
    const days = collectPushableDays([testWeek], TODAY)
    expect(days.map(d => d.isoDate)).toEqual(['2026-07-14', '2026-07-16'])
  })
})

describe('pushWeekToGarmin', () => {
  it('pushes each pushable future day once and records it in the ledger', async () => {
    const pushFn = vi.fn().mockResolvedValue({ success: true })
    const result = await pushWeekToGarmin(testWeek, 'mike', TODAY, pushFn)
    expect(result).toMatchObject({ sent: 2, failed: 0 })
    expect(pushFn).toHaveBeenCalledTimes(2)
    const ledger = readPushedLedger('mike')
    expect(Object.keys(ledger).sort()).toEqual(['2026-07-14', '2026-07-16'])
  })

  it('reports partial failure without aborting the batch', async () => {
    const pushFn = vi.fn()
      .mockRejectedValueOnce(new Error('watch offline'))
      .mockResolvedValue({ success: true })
    const result = await pushWeekToGarmin(testWeek, 'mike', TODAY, pushFn)
    expect(result.sent).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.errors[0]).toContain('watch offline')
    // Only the successful day lands in the ledger.
    expect(Object.keys(readPushedLedger('mike'))).toEqual(['2026-07-16'])
  })
})

describe('diffChangedPushedDays / repushChangedWorkouts', () => {
  it('re-pushes exactly the pushed day whose workout changed', async () => {
    // Athlete pushed the whole week…
    const pushFn = vi.fn().mockResolvedValue({ success: true })
    await pushWeekToGarmin(testWeek, 'mike', TODAY, pushFn)
    pushFn.mockClear()

    // …then a coach proposal rewrites Thursday only.
    const edited = week(testWeek.days.map(d =>
      d.day === 'Thu 7/16'
        ? { ...d, workout: 'Downhill Repeats 5mi', detail: '5 mi w/ 6x400m downhill' }
        : d,
    ))

    const changed = diffChangedPushedDays([edited], 'mike', TODAY)
    expect(changed.map(d => d.isoDate)).toEqual(['2026-07-16'])

    localStorage.setItem('ba_garmin_connected_mike', 'true') // isGarminConnected gate
    const result = await repushChangedWorkouts([edited], 'mike', TODAY, pushFn)
    expect(result.sent).toBe(1)
    expect(pushFn).toHaveBeenCalledTimes(1)
    expect(pushFn.mock.calls[0][0].scheduleDate).toBe('2026-07-16')

    // Ledger updated: a second pass is a no-op (the L2 guard).
    pushFn.mockClear()
    const again = await repushChangedWorkouts([edited], 'mike', TODAY, pushFn)
    expect(again.sent).toBe(0)
    expect(pushFn).not.toHaveBeenCalled()
  })

  it('GUARD: unchanged plan → no re-push calls at all', async () => {
    const pushFn = vi.fn().mockResolvedValue({ success: true })
    await pushWeekToGarmin(testWeek, 'mike', TODAY, pushFn)
    pushFn.mockClear()
    localStorage.setItem('ba_garmin_connected_mike', 'true')
    const result = await repushChangedWorkouts([testWeek], 'mike', TODAY, pushFn)
    expect(result.sent).toBe(0)
    expect(pushFn).not.toHaveBeenCalled()
  })

  it('GUARD: never-pushed days are not auto-pushed even when they change', () => {
    // Nothing in the ledger: the athlete never sent anything.
    const edited = week(testWeek.days.map(d =>
      d.day === 'Thu 7/16' ? { ...d, workout: 'Something New' } : d,
    ))
    expect(diffChangedPushedDays([edited], 'mike', TODAY)).toEqual([])
  })

  it('GUARD: a pushed day that moved into the past is never re-pushed', async () => {
    const pushFn = vi.fn().mockResolvedValue({ success: true })
    await pushWeekToGarmin(testWeek, 'mike', TODAY, pushFn)
    pushFn.mockClear()
    const edited = week(testWeek.days.map(d =>
      d.day === 'Tue 7/14' ? { ...d, workout: 'Changed Tempo' } : d,
    ))
    // Same edit, but evaluated two days later — Tuesday is now history.
    expect(diffChangedPushedDays([edited], 'mike', '2026-07-16')
      .map(d => d.isoDate)).not.toContain('2026-07-14')
  })
})
