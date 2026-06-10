import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { getCoachTimeOfDay, isEveningPreviewWindow } from '../utils/coach'
import { dayPeriod } from '../hooks/useCoachInsight'
import {
  useProactiveTimingPreference,
  DEFAULT_CARD_HOUR,
  DEFAULT_COACH_EVENING_HOUR,
} from '../hooks/useProactiveTimingPreference'

const at = (hour: number) => new Date(2026, 5, 9, hour, 0)

describe('getCoachTimeOfDay (configurable evening boundary)', () => {
  it('defaults to a 2 PM boundary', () => {
    expect(getCoachTimeOfDay(undefined, at(13))).toBe('morning')
    expect(getCoachTimeOfDay(undefined, at(14))).toBe('evening')
  })
  it('honors a custom boundary', () => {
    expect(getCoachTimeOfDay(18, at(17))).toBe('morning')
    expect(getCoachTimeOfDay(18, at(18))).toBe('evening')
  })
})

describe('dayPeriod (morning/evening only)', () => {
  it('never returns afternoon, at any hour', () => {
    for (let h = 0; h < 24; h++) {
      expect(['morning', 'evening']).toContain(dayPeriod(14, at(h)))
    }
  })
  it('splits at the configured hour', () => {
    expect(dayPeriod(14, at(13))).toBe('morning')
    expect(dayPeriod(14, at(14))).toBe('evening')
    expect(dayPeriod(20, at(19))).toBe('morning')
    expect(dayPeriod(20, at(20))).toBe('evening')
  })
})

describe('isEveningPreviewWindow (configurable card hour)', () => {
  it('defaults to 8 PM', () => {
    expect(isEveningPreviewWindow(at(19))).toBe(false)
    expect(isEveningPreviewWindow(at(20))).toBe(true)
  })
  it('honors a custom start hour', () => {
    expect(isEveningPreviewWindow(at(16), 17)).toBe(false)
    expect(isEveningPreviewWindow(at(17), 17)).toBe(true)
  })
})

describe('useProactiveTimingPreference', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to 8 PM card / 2 PM coach evening', () => {
    const { result } = renderHook(() => useProactiveTimingPreference('mike'))
    expect(result.current.cardHour).toBe(DEFAULT_CARD_HOUR)
    expect(result.current.coachEveningHour).toBe(DEFAULT_COACH_EVENING_HOUR)
  })

  it('persists each saver independently', () => {
    const { result } = renderHook(() => useProactiveTimingPreference('mike'))
    act(() => result.current.saveCardHour(19))
    act(() => result.current.saveCoachEveningHour(16))
    expect(result.current.cardHour).toBe(19)
    expect(result.current.coachEveningHour).toBe(16)
    expect(JSON.parse(localStorage.getItem('ba_proactive_timing_v1:mike')!)).toEqual({
      cardHour: 19,
      coachEveningHour: 16,
    })
  })

  it('clamps out-of-range hours back to the default', () => {
    const { result } = renderHook(() => useProactiveTimingPreference('mike'))
    act(() => result.current.saveCardHour(99))
    expect(result.current.cardHour).toBe(DEFAULT_CARD_HOUR)
  })

  it('re-reads stored values per athlete', () => {
    localStorage.setItem(
      'ba_proactive_timing_v1:lori',
      JSON.stringify({ cardHour: 17, coachEveningHour: 12 }),
    )
    const { result } = renderHook(() => useProactiveTimingPreference('lori'))
    expect(result.current.cardHour).toBe(17)
    expect(result.current.coachEveningHour).toBe(12)
  })
})
