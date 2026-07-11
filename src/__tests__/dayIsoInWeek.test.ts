import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ActualWorkout, TrainingWeek } from '../types'
import { dayIsoInWeek, parseDayToDate } from '../utils/planDates'
import { useManualLog } from '../hooks/useManualLog'

/**
 * Week-anchored date resolution — the fix for the field year-bleed where
 * June-2026 actuals/grades attached to June-2027 plan days (day labels
 * carry no year; every consumer guessed).
 */

describe('dayIsoInWeek', () => {
  it('resolves exactly within the week, immune to the year boundary', () => {
    const week = { startIso: '2026-12-28', dates: 'Dec 28–Jan 3' } // Mon Dec 28 2026 – Sun Jan 3 2027
    expect(dayIsoInWeek('Mon 12/28', week)).toBe('2026-12-28')
    expect(dayIsoInWeek('Thu 12/31', week)).toBe('2026-12-31')
    expect(dayIsoInWeek('Fri 1/1', week)).toBe('2027-01-01')
    expect(dayIsoInWeek('Sun 1/3', week)).toBe('2027-01-03')
  })

  it('a June label in a 2027 week resolves to 2027, never 2026 (the field bleed)', () => {
    const week = { startIso: '2027-06-14', dates: 'Jun 14–19' }
    expect(dayIsoInWeek('Sat 6/19', week)).toBe('2027-06-19')
  })

  it('FALLBACK: without startIso, behaves byte-identically to parseDayToDate', () => {
    const legacy = { dates: 'Jun 14–19' } as Pick<TrainingWeek, 'dates'>
    expect(dayIsoInWeek('Sat 6/19', legacy)).toBe(parseDayToDate('Sat 6/19', 'Jun 14–19'))
    expect(dayIsoInWeek('Sat 6/19', legacy, '2026-07-11')).toBe(parseDayToDate('Sat 6/19', 'Jun 14–19', '2026-07-11'))
    expect(dayIsoInWeek('Rest', legacy)).toBeNull()
  })
})

describe('manual logs across a year boundary', () => {
  beforeEach(() => localStorage.clear())

  const run: ActualWorkout = { name: 'Easy run', distance: 5, movingTime: 3000, elevationGain: 100 } as ActualWorkout
  const week2026: TrainingWeek = { num: 1, startIso: '2026-06-15', dates: 'Jun 15–21', miles: 20, focus: 'Build', days: [{ day: 'Fri 6/19', type: 'run', workout: 'Easy', detail: '', zone: 'Z2', route: '', time: '' }] }
  const week2027: TrainingWeek = { num: 50, startIso: '2027-06-14', dates: 'Jun 14–20', miles: 20, focus: 'Build', days: [{ day: 'Sat 6/19', type: 'run', workout: 'Easy', detail: '', zone: 'Z2', route: '', time: '' }] }

  it('a 2026-keyed log attaches to the 2026 week and NOT to the same M/D in 2027', () => {
    const { result } = renderHook(() => useManualLog('t'))
    act(() => result.current.logWorkout('Fri 6/19', run, '2026-06-19'))
    const [w26, w27] = result.current.applyLogsToWeeks([week2026, week2027])
    expect(w26.days[0].actual?.name).toBe('Easy run')
    expect(w27.days[0].actual).toBeUndefined()
  })

  it('a 2027 write with dayIso stores under the 2027 key and attaches to the 2027 week only', () => {
    const { result } = renderHook(() => useManualLog('t'))
    act(() => result.current.logWorkout('Sat 6/19', run, '2027-06-19'))
    expect(JSON.parse(localStorage.getItem('ba_manual_logs_t')!)['2027-06-19']).toBeTruthy()
    const [w26, w27] = result.current.applyLogsToWeeks([week2026, week2027])
    expect(w26.days[0].actual).toBeUndefined()
    expect(w27.days[0].actual?.name).toBe('Easy run')
  })

  it('LEGACY: a log written without dayIso still attaches to a week without startIso', () => {
    const legacyWeek: TrainingWeek = { ...week2026, startIso: undefined }
    const { result } = renderHook(() => useManualLog('t'))
    act(() => result.current.logWorkout('Fri 6/19', run))
    const [w] = result.current.applyLogsToWeeks([legacyWeek])
    expect(w.days[0].actual?.name).toBe('Easy run')
  })
})
