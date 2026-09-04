/**
 * The watch never holds a stale plan, and never gets spammed.
 *
 * This effect is the single seam that keeps Garmin's copy of the plan in
 * step with the app's: every edit path (coach proposal, realignment, manual
 * edit, day swap, undo) flows through the derived `weeks`, so watching that
 * one value covers all of them. It lived inline in App.tsx and had no test —
 * the two properties below are exactly the kind that survive a refactor only
 * by accident.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { TrainingWeek } from '../types'

const repushChangedWorkouts = vi.fn()
vi.mock('../utils/garminRepush', () => ({
  repushChangedWorkouts: (...a: unknown[]) => repushChangedWorkouts(...a),
}))

const { useGarminAutoRepush, REPUSH_DEBOUNCE_MS } = await import('../hooks/useGarminAutoRepush')

const WEEKS_A = [{ num: 1, days: [] }] as unknown as TrainingWeek[]
const WEEKS_B = [{ num: 2, days: [] }] as unknown as TrainingWeek[]

beforeEach(() => {
  vi.useFakeTimers()
  repushChangedWorkouts.mockReset()
  repushChangedWorkouts.mockResolvedValue({ sent: 0, failed: 0, errors: [] })
})
afterEach(() => { vi.useRealTimers() })

describe('when the watch is connected', () => {
  it('pushes once the edits settle', () => {
    renderHook(() => useGarminAutoRepush(WEEKS_A, 'mike', true))
    expect(repushChangedWorkouts, 'must not fire before the debounce').not.toHaveBeenCalled()
    vi.advanceTimersByTime(REPUSH_DEBOUNCE_MS)
    expect(repushChangedWorkouts).toHaveBeenCalledWith(WEEKS_A, 'mike')
  })

  it('collapses a burst of edits into ONE push', () => {
    // An applied multi-op proposal changes `weeks` several times in a row.
    // Without the debounce every intermediate state reaches the watch.
    const { rerender } = renderHook(
      ({ w }) => useGarminAutoRepush(w, 'mike', true),
      { initialProps: { w: WEEKS_A } },
    )
    vi.advanceTimersByTime(1000)
    rerender({ w: WEEKS_B })
    vi.advanceTimersByTime(1000)
    rerender({ w: WEEKS_A })
    vi.advanceTimersByTime(REPUSH_DEBOUNCE_MS)

    expect(repushChangedWorkouts).toHaveBeenCalledOnce()
    expect(repushChangedWorkouts).toHaveBeenCalledWith(WEEKS_A, 'mike')
  })

  it('cancels the pending push when the component goes away', () => {
    const { unmount } = renderHook(() => useGarminAutoRepush(WEEKS_A, 'mike', true))
    unmount()
    vi.advanceTimersByTime(REPUSH_DEBOUNCE_MS * 2)
    expect(repushChangedWorkouts).not.toHaveBeenCalled()
  })
})

describe('when the watch is not connected', () => {
  it('never pushes', () => {
    renderHook(() => useGarminAutoRepush(WEEKS_A, 'mike', false))
    vi.advanceTimersByTime(REPUSH_DEBOUNCE_MS * 2)
    expect(repushChangedWorkouts).not.toHaveBeenCalled()
  })
})

describe('failures are absorbed', () => {
  it('swallows a rejected push rather than surfacing it', async () => {
    // Someone editing their training plan must not see a network blip; the
    // next edit retries anyway.
    //
    // What enforces this is NOT an assertion below — it is the run itself.
    // Deleting the hook's `.catch` makes this rejection escape, and vitest
    // exits non-zero on an unhandled rejection even though every `it` still
    // reports as passing (verified: exit 1 with the catch removed, 0 with it).
    // A `window.addEventListener('unhandledrejection')` spy was tried here
    // first and never fires in this environment — an assertion that cannot
    // fail is worse than none, so it is gone.
    repushChangedWorkouts.mockRejectedValue(new Error('garmin down'))
    renderHook(() => useGarminAutoRepush(WEEKS_A, 'mike', true))
    await vi.advanceTimersByTimeAsync(REPUSH_DEBOUNCE_MS)
    expect(repushChangedWorkouts).toHaveBeenCalled()
  })
})
