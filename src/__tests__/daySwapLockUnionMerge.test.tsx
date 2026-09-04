/**
 * Day swaps and locked days, across two devices.
 *
 * Both keys have the shape the plan-edit log had before #420: one
 * localStorage key holding the whole list, synced last-write-wins. Swap two
 * days on the phone, lock a day on the laptop, and whichever syncs second
 * replaces the other's entire list.
 *
 * Swaps carry a sharper edge than plain loss. `applySwapsToWeeks` replays
 * them in sequence, so a swap that comes back twice does not merely
 * reappear — it applies a SECOND time, swaps the days back, and leaves the
 * week silently unswapped. Identity and ordering both have to be right, not
 * just membership.
 *
 * And as with the edit log, the union is only safe because removals are
 * recorded rather than implied: a week reset is a `SwapReset` tombstone, an
 * unlock is a `LockRecord` with `unlocked: true`. Without those a merge
 * un-resets a week and re-locks a day the athlete deliberately opened.
 */
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { PlannedDay, TrainingWeek } from '../types'
import { isMergeableCollectionKey, mergeCollection } from '../utils/syncMerge'
import { lockedDates, type LockRecord } from '../hooks/useLockedDays'
import { useDaySwap } from '../hooks/useDaySwap'

const SWAPS = 'ba_day_swaps_mike'

function merge(key: string, local: unknown[], server: unknown[], serverNewer = true): unknown[] {
  const out = mergeCollection(JSON.stringify(local), JSON.stringify(server), serverNewer, key)
  expect(out, `${key} should take the union path, not fall back to LWW`).not.toBeNull()
  return JSON.parse(out!.value) as unknown[]
}

const swap = (weekNum: number, fromIndex: number, toIndex: number, at: number, id?: string) =>
  ({ ...(id ? { id } : {}), weekNum, fromIndex, toIndex, at })
const reset = (weekNum: number, at: number, id = `r${at}`) =>
  ({ id, weekNum, at, reset: true })
const lock = (dateIso: string, appliedAt: number, id = `l${appliedAt}`) =>
  ({ id, dateIso, appliedAt }) as LockRecord
const unlock = (dateIso: string, appliedAt: number, id = `u${appliedAt}`) =>
  ({ id, dateIso, appliedAt, unlocked: true }) as LockRecord

describe('both keys are registered', () => {
  it('claims day swaps and locked days', () => {
    for (const k of ['ba_day_swaps_mike', 'ba_day_swaps:mike',
                     'ba_locked_days_mike', 'ba_locked_days:mike']) {
      expect(isMergeableCollectionKey(k), k).toBe(true)
    }
  })
})

describe('day swaps', () => {
  it('keeps both devices’ swaps', () => {
    const merged = merge(SWAPS,
      [swap(1, 0, 1, 100, 'a')],
      [swap(2, 3, 4, 200, 'b')])
    expect(merged.map((s) => (s as { id: string }).id)).toEqual(['a', 'b'])
  })

  it('does NOT duplicate a legacy swap that has no id', () => {
    // The dangerous one. Both devices hold the same pre-id swap; keying it
    // by position would keep two copies, and replaying a swap twice undoes
    // it — the week silently reverts.
    const legacy = swap(1, 0, 1, 100)
    expect(merge(SWAPS, [legacy], [legacy])).toHaveLength(1)
  })

  it('still keeps two genuinely different legacy swaps', () => {
    expect(merge(SWAPS, [swap(1, 0, 1, 100)], [swap(1, 2, 3, 150)])).toHaveLength(2)
  })

  it('converges — both devices end up with the same array', () => {
    const phone = [swap(1, 0, 1, 100, 'a')]
    const laptop = [swap(2, 3, 4, 200, 'b')]
    expect(JSON.stringify(merge(SWAPS, phone, laptop, true)))
      .toBe(JSON.stringify(merge(SWAPS, laptop, phone, false)))
  })

  it('orders the merged log by timestamp, because swaps compose', () => {
    const merged = merge(SWAPS,
      [swap(1, 2, 3, 300, 'late')],
      [swap(1, 0, 1, 100, 'early')])
    expect(merged.map((s) => (s as { id: string }).id)).toEqual(['early', 'late'])
  })

  it('is idempotent', () => {
    const phone = [swap(1, 0, 1, 100, 'a')]
    const laptop = [swap(2, 3, 4, 200, 'b')]
    const once = merge(SWAPS, phone, laptop)
    expect(merge(SWAPS, once as never[], laptop)).toEqual(once)
  })

  it('carries a week reset across the merge as a tombstone', () => {
    // Phone reset week 1; the laptop still holds the swap it removed.
    const merged = merge(SWAPS,
      [swap(1, 0, 1, 100, 'a'), reset(1, 200)],
      [swap(1, 0, 1, 100, 'a')])
    const ids = merged.map((s) => (s as { id: string }).id)
    expect(ids).toContain('a')      // the row survives…
    expect(ids).toContain('r200')   // …and so does the tombstone that kills it
  })
})

describe('locked days', () => {
  it('keeps both devices’ locks', () => {
    const merged = merge('ba_locked_days_mike',
      [lock('2026-03-02', 100)],
      [lock('2026-03-05', 200)]) as LockRecord[]
    expect([...lockedDates(merged)].sort()).toEqual(['2026-03-02', '2026-03-05'])
  })

  it('does NOT re-lock a day the other device still shows as locked', () => {
    // The bug the tombstone exists for: phone unlocked it, laptop is stale.
    const merged = merge('ba_locked_days_mike',
      [lock('2026-03-02', 100), unlock('2026-03-02', 200)],
      [lock('2026-03-02', 100)]) as LockRecord[]
    expect(lockedDates(merged).has('2026-03-02')).toBe(false)
  })

  it('re-locking after an unlock wins, because it is newer', () => {
    const merged = merge('ba_locked_days_mike',
      [lock('2026-03-02', 100), unlock('2026-03-02', 200), lock('2026-03-02', 300, 'relock')],
      [lock('2026-03-02', 100)]) as LockRecord[]
    expect(lockedDates(merged).has('2026-03-02')).toBe(true)
  })

  it('treats a record with no `unlocked` flag as a lock (legacy rows)', () => {
    expect(lockedDates([{ id: 'x', dateIso: '2026-03-02', appliedAt: 1 }]).has('2026-03-02')).toBe(true)
  })

  it('breaks an exact timestamp tie deterministically', () => {
    const a = [lock('2026-03-02', 100, 'aaa'), unlock('2026-03-02', 100, 'zzz')]
    const b = [unlock('2026-03-02', 100, 'zzz'), lock('2026-03-02', 100, 'aaa')]
    expect(lockedDates(a).has('2026-03-02')).toBe(lockedDates(b).has('2026-03-02'))
  })
})

describe('the useDaySwap hook itself', () => {
  // The hook had no test of its own, and this PR changes how a week reset is
  // persisted — from "filter the rows out" to "append a tombstone". These pin
  // the athlete-visible behaviour so that change is provably invisible.
  function day(over: Partial<PlannedDay>): PlannedDay {
    return { day: 'Mon 9/7', type: 'run', workout: 'Easy', detail: '', zone: 'Z2', route: '', time: '40 min', ...over }
  }
  function weeks(): TrainingWeek[] {
    return [{
      num: 1, dates: 'Sep 7–13', startIso: '2026-09-07', miles: 20, focus: 'Build',
      days: [day({ day: 'Mon 9/7', workout: 'A' }), day({ day: 'Tue 9/8', workout: 'B' })],
    }] as TrainingWeek[]
  }

  it('swaps two days, then puts them back on reset', () => {
    localStorage.clear()
    const { result } = renderHook(() => useDaySwap('mike'))

    act(() => result.current.swapDays(1, 0, 1))
    expect(result.current.hasSwaps(1)).toBe(true)
    let w = result.current.applySwapsToWeeks(weeks())
    expect([w[0].days[0].workout, w[0].days[1].workout]).toEqual(['B', 'A'])

    act(() => result.current.resetWeek(1))
    expect(result.current.hasSwaps(1)).toBe(false)
    w = result.current.applySwapsToWeeks(weeks())
    expect([w[0].days[0].workout, w[0].days[1].workout]).toEqual(['A', 'B'])
  })

  it('a swap made AFTER a reset survives it', () => {
    // The `at`-bounded revocation, at the hook level: resetting week 1 must
    // not swallow the next swap the athlete makes in week 1.
    localStorage.clear()
    const { result } = renderHook(() => useDaySwap('mike'))
    act(() => result.current.swapDays(1, 0, 1))
    act(() => result.current.resetWeek(1))
    act(() => result.current.swapDays(1, 0, 1))
    expect(result.current.hasSwaps(1)).toBe(true)
    const w = result.current.applySwapsToWeeks(weeks())
    expect([w[0].days[0].workout, w[0].days[1].workout]).toEqual(['B', 'A'])
  })

  it('a reset on one week leaves another week alone', () => {
    localStorage.clear()
    const { result } = renderHook(() => useDaySwap('mike'))
    act(() => result.current.swapDays(1, 0, 1))
    act(() => result.current.swapDays(2, 0, 1))
    act(() => result.current.resetWeek(1))
    expect(result.current.hasSwaps(1)).toBe(false)
    expect(result.current.hasSwaps(2)).toBe(true)
  })

  it('survives a remount — the tombstone is persisted, not just in memory', () => {
    localStorage.clear()
    const first = renderHook(() => useDaySwap('mike'))
    act(() => first.result.current.swapDays(1, 0, 1))
    act(() => first.result.current.resetWeek(1))
    first.unmount()

    const second = renderHook(() => useDaySwap('mike'))
    expect(second.result.current.hasSwaps(1)).toBe(false)
    const w = second.result.current.applySwapsToWeeks(weeks())
    expect([w[0].days[0].workout, w[0].days[1].workout]).toEqual(['A', 'B'])
  })
})
