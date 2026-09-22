/**
 * The Monday review's show/dismiss cadence. Field bug (Tue 9/22): the
 * sheet could not be closed — "Close" and "Sounds good" both dismissed,
 * and it came straight back. Storage held the key of a PREVIOUS week's
 * review; dismiss wrote under that stale key; the decision saw the
 * current week with no dismissal.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMondayReview, shouldShowReview, reviewWeekKey } from '../hooks/useMondayReview'

const KEY = 'ba_monday_review_v1_mike'
// Tuesday 2026-09-22 11:15 local — inside Monday 9/21's 48-hour window.
const TUESDAY = new Date(2026, 8, 22, 11, 15)

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(TUESDAY)
})
afterEach(() => vi.useRealTimers())

describe('reviewWeekKey', () => {
  it('is the Monday whose window the clock sits in, or null outside it', () => {
    expect(reviewWeekKey(TUESDAY)).toBe('2026-09-21')
    expect(reviewWeekKey(new Date(2026, 8, 21, 5, 59))).toBeNull()   // Monday before 6 AM
    expect(reviewWeekKey(new Date(2026, 8, 23, 6, 1))).toBeNull()    // Wednesday, window closed
  })
})

describe('shouldShowReview', () => {
  it('a dismissal recorded under a previous week does not hide this week', () => {
    const stale = { weekKey: '2026-09-14', shownAt: 0, dismissed: true }
    expect(shouldShowReview(stale, TUESDAY, null).show).toBe(true)
  })

  it('a dismissal recorded under THIS week hides it', () => {
    const done = { weekKey: '2026-09-21', shownAt: TUESDAY.getTime() - 1000, dismissed: true }
    expect(shouldShowReview(done, TUESDAY, null).show).toBe(false)
  })
})

describe('useMondayReview — the dismiss actually dismisses', () => {
  it('with a previous week\'s dismissal in storage, Close hides the sheet and stays hidden', () => {
    // Last Monday's review, dismissed — exactly what the athlete's phone held.
    localStorage.setItem(KEY, JSON.stringify({ weekKey: '2026-09-14', shownAt: 1, dismissed: true }))
    const { result } = renderHook(() => useMondayReview('mike', null))
    expect(result.current.visible).toBe(true)
    // Showing it records THIS week's key.
    expect(JSON.parse(localStorage.getItem(KEY)!).weekKey).toBe('2026-09-21')

    act(() => result.current.dismiss())
    expect(result.current.visible).toBe(false)
    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ weekKey: '2026-09-21', dismissed: true })

    // A minute later (the hook's clock tick) it is still gone.
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(result.current.visible).toBe(false)
  })

  it('fresh storage: first show, dismiss, gone', () => {
    const { result } = renderHook(() => useMondayReview('mike', null))
    expect(result.current.visible).toBe(true)
    act(() => result.current.dismiss())
    expect(result.current.visible).toBe(false)
  })

  it('a gap review: dismiss acknowledges that gap, and the same gap never nags twice', () => {
    localStorage.setItem(KEY, JSON.stringify({ weekKey: '2026-09-14', shownAt: 1, dismissed: true }))
    const { result, rerender } = renderHook(({ gap }) => useMondayReview('mike', gap), { initialProps: { gap: '2026-09-01' as string | null } })
    expect(result.current.gapTriggered).toBe(true)
    act(() => result.current.dismiss())
    expect(result.current.visible).toBe(false)
    rerender({ gap: '2026-09-01' })
    expect(result.current.visible).toBe(false)
    // A NEW gap re-triggers.
    rerender({ gap: '2026-09-05' })
    expect(result.current.visible).toBe(true)
  })
})
