/**
 * "How does your body feel right now?" is asked twice a day at most:
 * before 10 AM and from the evening hour. These pin the gate.
 */
import { describe, it, expect } from 'vitest'
import {
  checkInWindowAt, checkInWindowLabel, nextCheckInLabel, fmtClock, sorenessOption, MORNING_CLOSE_HOUR,
} from '../utils/checkInWindow'

const at = (h: number, m = 0) => new Date(2026, 8, 18, h, m)

describe('checkInWindowAt', () => {
  it('opens the morning window until 10 AM', () => {
    expect(checkInWindowAt(at(0))).toBe('morning')
    expect(checkInWindowAt(at(6, 52))).toBe('morning')
    expect(checkInWindowAt(at(9, 59))).toBe('morning')
    expect(checkInWindowAt(at(10))).toBeNull()
    expect(MORNING_CLOSE_HOUR).toBe(10)
  })

  it('opens the evening window from the evening hour, 6 PM by default', () => {
    expect(checkInWindowAt(at(17, 59))).toBeNull()
    expect(checkInWindowAt(at(18))).toBe('evening')
    expect(checkInWindowAt(at(23, 30))).toBe('evening')
  })

  it('follows the athlete’s own evening hour', () => {
    expect(checkInWindowAt(at(18), 20)).toBeNull()
    expect(checkInWindowAt(at(20), 20)).toBe('evening')
  })

  it('asks nothing in the middle of the day', () => {
    for (let h = 10; h < 18; h++) expect(checkInWindowAt(at(h, 30))).toBeNull()
  })
})

describe('labels', () => {
  it('names the window and its edge', () => {
    expect(checkInWindowLabel('morning')).toBe('Morning check-in · until 10 AM')
    expect(checkInWindowLabel('evening')).toBe('Evening check-in · from 6 PM')
    expect(checkInWindowLabel('evening', 19)).toBe('Evening check-in · from 7 PM')
  })

  it('points at the next window when none is open', () => {
    expect(nextCheckInLabel(at(13))).toBe('Evening check-in opens at 6 PM')
    expect(nextCheckInLabel(at(13), 20)).toBe('Evening check-in opens at 8 PM')
    expect(nextCheckInLabel(at(22))).toBe('Morning check-in opens tomorrow')
  })

  it('formats a clock time and tolerates junk', () => {
    expect(fmtClock(new Date(2026, 8, 18, 6, 5).toISOString())).toBe('6:05am')
    expect(fmtClock(new Date(2026, 8, 18, 19, 12).toISOString())).toBe('7:12pm')
    expect(fmtClock(new Date(2026, 8, 18, 0, 0).toISOString())).toBe('12:00am')
    expect(fmtClock(undefined)).toBe('')
    expect(fmtClock('not a date')).toBe('')
  })

  it('has one option per level', () => {
    expect(sorenessOption(2).label).toBe('Normal')
    expect(sorenessOption(5).emoji).toBe('🔥')
  })
})
