import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { getCoachTimeOfDay, isEveningPreviewWindow } from '../utils/coach'
import { dayPeriod } from '../hooks/useCoachInsight'
import {
  useProactiveTimingPreference,
  DEFAULT_MORNING_HOUR,
  DEFAULT_EVENING_HOUR,
} from '../hooks/useProactiveTimingPreference'

const at = (hour: number) => new Date(2026, 5, 9, hour, 0)

describe('getCoachTimeOfDay (two configurable windows)', () => {
  it('defaults to 7 AM / 6 PM windows', () => {
    expect(getCoachTimeOfDay(undefined, undefined, at(6))).toBe('evening') // before morning
    expect(getCoachTimeOfDay(undefined, undefined, at(7))).toBe('morning')
    expect(getCoachTimeOfDay(undefined, undefined, at(13))).toBe('morning')
    expect(getCoachTimeOfDay(undefined, undefined, at(18))).toBe('evening')
    expect(getCoachTimeOfDay(undefined, undefined, at(23))).toBe('evening')
    expect(getCoachTimeOfDay(undefined, undefined, at(2))).toBe('evening') // small hours
  })
  it('honors custom morning + evening hours', () => {
    expect(getCoachTimeOfDay(5, 17, at(4))).toBe('evening')
    expect(getCoachTimeOfDay(5, 17, at(5))).toBe('morning')
    expect(getCoachTimeOfDay(5, 17, at(16))).toBe('morning')
    expect(getCoachTimeOfDay(5, 17, at(17))).toBe('evening')
  })
})

describe('dayPeriod (morning/evening only)', () => {
  it('never returns afternoon, at any hour', () => {
    for (let h = 0; h < 24; h++) {
      expect(['morning', 'evening']).toContain(dayPeriod(7, 18, at(h)))
    }
  })
  it('matches the configured windows', () => {
    expect(dayPeriod(7, 18, at(6))).toBe('evening')
    expect(dayPeriod(7, 18, at(7))).toBe('morning')
    expect(dayPeriod(7, 18, at(17))).toBe('morning')
    expect(dayPeriod(7, 18, at(18))).toBe('evening')
  })
})

describe('isEveningPreviewWindow (tomorrow-card reveal hour)', () => {
  it('defaults to 8 PM', () => {
    expect(isEveningPreviewWindow(at(19))).toBe(false)
    expect(isEveningPreviewWindow(at(20))).toBe(true)
  })
  it('honors a custom hour (the evening time)', () => {
    expect(isEveningPreviewWindow(at(17), 18)).toBe(false)
    expect(isEveningPreviewWindow(at(18), 18)).toBe(true)
  })
})

describe('useProactiveTimingPreference', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to 7 AM morning / 6 PM evening', () => {
    const { result } = renderHook(() => useProactiveTimingPreference('mike'))
    expect(result.current.morningHour).toBe(DEFAULT_MORNING_HOUR)
    expect(result.current.eveningHour).toBe(DEFAULT_EVENING_HOUR)
  })

  it('persists each saver independently', () => {
    const { result } = renderHook(() => useProactiveTimingPreference('mike'))
    act(() => result.current.saveMorningHour(6))
    act(() => result.current.saveEveningHour(20))
    expect(result.current.morningHour).toBe(6)
    expect(result.current.eveningHour).toBe(20)
    expect(JSON.parse(localStorage.getItem('ba_proactive_timing_v1:mike')!)).toEqual({
      morningHour: 6,
      eveningHour: 20,
    })
  })

  it('clamps out-of-range hours back to the default', () => {
    const { result } = renderHook(() => useProactiveTimingPreference('mike'))
    act(() => result.current.saveMorningHour(99))
    expect(result.current.morningHour).toBe(DEFAULT_MORNING_HOUR)
  })

  it('re-reads stored values per athlete', () => {
    localStorage.setItem(
      'ba_proactive_timing_v1:lori',
      JSON.stringify({ morningHour: 9, eveningHour: 21 }),
    )
    const { result } = renderHook(() => useProactiveTimingPreference('lori'))
    expect(result.current.morningHour).toBe(9)
    expect(result.current.eveningHour).toBe(21)
  })
})
