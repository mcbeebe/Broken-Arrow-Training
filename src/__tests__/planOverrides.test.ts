import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePlanOverrides } from '../hooks/usePlanOverrides'
import type { TrainingWeek } from '../types'

const mkWeeks = (): TrainingWeek[] => [{
  num: 4,
  dates: 'May 4–10',
  miles: 15,
  focus: '',
  days: [
    { day: 'Mon 5/4', type: 'strength', workout: 'STRENGTH', detail: '', zone: 'Z1 (108–128)', route: 'Gym', time: '1 hr' },
    { day: 'Wed 5/6', type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '—', time: '—' },
  ],
}]

describe('usePlanOverrides — manual edit flow', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear()
  })

  it('applies a manual override and reflects it in applyOverridesToWeeks', () => {
    const { result } = renderHook(() => usePlanOverrides('mike'))

    act(() => {
      result.current.applyOverride({
        weekNum: 4,
        dayIndex: 1,
        updates: {
          type: 'quality',
          workout: 'Bike intervals — Z4 efforts',
          zone: '0.0 mi · Z4 (167–177)',
          time: '60 min',
          route: 'Indoor',
          detail: '6×3 min @ Z4',
        },
        rationale: 'Manual edit',
      })
    })

    const weeks = result.current.applyOverridesToWeeks(mkWeeks())
    const editedDay = weeks[0].days[1]
    expect(editedDay.type).toBe('quality')
    expect(editedDay.workout).toBe('Bike intervals — Z4 efforts')
    expect(editedDay.zone).toBe('0.0 mi · Z4 (167–177)')
    expect(editedDay.day).toBe('Wed 5/6')  // day label preserved
  })

  it('replaces an existing override on the same day instead of stacking', () => {
    const { result } = renderHook(() => usePlanOverrides('mike'))

    act(() => {
      result.current.applyOverride({
        weekNum: 4,
        dayIndex: 1,
        updates: { workout: 'First edit' },
      })
    })
    act(() => {
      result.current.applyOverride({
        weekNum: 4,
        dayIndex: 1,
        updates: { workout: 'Second edit' },
      })
    })

    expect(result.current.overrides).toHaveLength(1)
    const weeks = result.current.applyOverridesToWeeks(mkWeeks())
    expect(weeks[0].days[1].workout).toBe('Second edit')
  })

  it('removeForDay restores the original plan', () => {
    const { result } = renderHook(() => usePlanOverrides('mike'))

    act(() => {
      result.current.applyOverride({
        weekNum: 4,
        dayIndex: 1,
        updates: { workout: 'Edited' },
      })
    })
    expect(result.current.overrides).toHaveLength(1)

    act(() => result.current.removeForDay(4, 1))
    expect(result.current.overrides).toHaveLength(0)

    const weeks = result.current.applyOverridesToWeeks(mkWeeks())
    expect(weeks[0].days[1].workout).toBe('Rest')
  })

  it('persists overrides across remounts (localStorage)', () => {
    const { result, unmount } = renderHook(() => usePlanOverrides('mike'))

    act(() => {
      result.current.applyOverride({
        weekNum: 4,
        dayIndex: 0,
        updates: { workout: 'Persisted edit' },
      })
    })
    unmount()

    const { result: result2 } = renderHook(() => usePlanOverrides('mike'))
    expect(result2.current.overrides).toHaveLength(1)
    expect(result2.current.overrides[0].updates.workout).toBe('Persisted edit')
  })

  it('scopes overrides per athlete (no cross-bleed)', () => {
    const { result: mike } = renderHook(() => usePlanOverrides('mike'))
    act(() => {
      mike.current.applyOverride({
        weekNum: 4,
        dayIndex: 0,
        updates: { workout: 'Mike edit' },
      })
    })

    const { result: jim } = renderHook(() => usePlanOverrides('jim'))
    expect(jim.current.overrides).toHaveLength(0)
  })
})
