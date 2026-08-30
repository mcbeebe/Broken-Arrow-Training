/**
 * P13 — the phase must track the clock, not the last render.
 *
 * The bug this pins: Today left open overnight, picked up at breakfast,
 * still showing last night's Evening Close. `dayPhase` was right; nothing
 * ever asked it again.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDayPhase, msUntilNextHour } from '../hooks/useDayPhase'

const WINDOW = { morningHour: 7, eveningHour: 18 }

describe('msUntilNextHour', () => {
  it('counts to the top of the next hour', () => {
    expect(msUntilNextHour(new Date(2026, 7, 29, 19, 30, 0, 0))).toBe(30 * 60_000)
    expect(msUntilNextHour(new Date(2026, 7, 29, 19, 59, 59, 500))).toBe(500)
  })

  it('never returns zero, so a self-rescheduling timer cannot spin', () => {
    for (let m = 0; m < 60; m++) {
      for (const s of [0, 17, 59]) {
        expect(msUntilNextHour(new Date(2026, 7, 29, 4, m, s, 0))).toBeGreaterThan(0)
      }
    }
  })
})

describe('useDayPhase', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('reads the phase from the clock at mount', () => {
    vi.setSystemTime(new Date(2026, 7, 29, 19, 30))
    const { result } = renderHook(() => useDayPhase(WINDOW))
    expect(result.current).toBe('evening')
  })

  it('flips to the close when the close hour arrives, with the app still open', () => {
    vi.setSystemTime(new Date(2026, 7, 29, 17, 40))
    const { result } = renderHook(() => useDayPhase(WINDOW))
    expect(result.current).toBe('morning')

    // Twenty minutes to the hour, then the hour turns.
    act(() => {
      vi.setSystemTime(new Date(2026, 7, 29, 18, 0))
      vi.advanceTimersByTime(20 * 60_000)
    })
    expect(result.current).toBe('evening')
  })

  it('does not carry last night’s close into the morning', () => {
    // Left open at 22:00, picked up at 07:47 the next day. This is the
    // device report that prompted the fix.
    vi.setSystemTime(new Date(2026, 7, 29, 22, 0))
    const { result } = renderHook(() => useDayPhase(WINDOW))
    expect(result.current).toBe('evening')

    act(() => {
      vi.setSystemTime(new Date(2026, 7, 30, 7, 47))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe('morning')
  })

  it('re-reads when the athlete moves their own hours', () => {
    vi.setSystemTime(new Date(2026, 7, 29, 19, 30))
    const { result, rerender } = renderHook(
      ({ w }) => useDayPhase(w),
      { initialProps: { w: WINDOW } },
    )
    expect(result.current).toBe('evening')

    // Close moved out to 21:00 — 19:30 is the day again.
    act(() => { rerender({ w: { morningHour: 7, eveningHour: 21 } }) })
    expect(result.current).toBe('morning')
  })

  it('keeps ticking hour after hour rather than firing once', () => {
    // Mounted on the hour, then left alone. Each advance carries the fake
    // clock forward an hour of its own accord — if the timer only ever fired
    // once, the 18:00 flip below would never arrive.
    vi.setSystemTime(new Date(2026, 7, 29, 15, 0))
    const { result } = renderHook(() => useDayPhase(WINDOW))
    expect(result.current).toBe('morning')

    for (const [h, expected] of [[16, 'morning'], [17, 'morning'], [18, 'evening']] as const) {
      act(() => { vi.advanceTimersByTime(60 * 60_000) })
      expect(new Date().getHours(), 'fake clock').toBe(h)
      expect(result.current, `hour ${h}`).toBe(expected)
    }
  })

  it('stops its timer on unmount', () => {
    vi.setSystemTime(new Date(2026, 7, 29, 10, 0))
    const { unmount } = renderHook(() => useDayPhase(WINDOW))
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
