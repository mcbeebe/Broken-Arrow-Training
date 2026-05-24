import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePlanEdits, replayEdits } from '../hooks/usePlanEdits'
import { useDaySwap } from '../hooks/useDaySwap'
import type { TrainingWeek, PlanEdit } from '../types'

const mkWeeks = (): TrainingWeek[] => [
  {
    num: 4,
    dates: 'May 4–10',
    miles: 15,
    focus: 'Build',
    days: [
      { day: 'Mon 5/4', type: 'strength', workout: 'STRENGTH', detail: 'Goblet squats 3×12', zone: 'Z1 (108–128)', route: 'Gym', time: '1 hr' },
      { day: 'Wed 5/6', type: 'rest', workout: 'Rest', detail: '—', zone: '—', route: '—', time: '—' },
    ],
  },
  {
    num: 5,
    dates: 'May 11–17',
    miles: 20,
    focus: 'Peak',
    days: [
      { day: 'Sat 5/16', type: 'long', workout: 'Long run', detail: '10 mi', zone: 'Z2', route: 'Trail', time: '2 hr' },
    ],
  },
]

describe('usePlanEdits — structural op-log', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear()
  })

  it('applyOverride patches a single day (legacy contract)', () => {
    const { result } = renderHook(() => usePlanEdits('mike'))
    act(() => {
      result.current.applyOverride({ weekNum: 4, dayIndex: 1, updates: { workout: 'Bike intervals', type: 'quality' } })
    })
    const weeks = result.current.applyEditsToWeeks(mkWeeks())
    expect(weeks[0].days[1].workout).toBe('Bike intervals')
    expect(weeks[0].days[1].type).toBe('quality')
    expect(weeks[0].days[1].day).toBe('Wed 5/6')  // label preserved
  })

  it('re-editing the same day replaces rather than stacks', () => {
    const { result } = renderHook(() => usePlanEdits('mike'))
    act(() => result.current.applyOverride({ weekNum: 4, dayIndex: 1, updates: { workout: 'First' } }))
    act(() => result.current.applyOverride({ weekNum: 4, dayIndex: 1, updates: { workout: 'Second' } }))
    const updateDayEdits = result.current.edits.filter(e => e.op.kind === 'updateDay')
    expect(updateDayEdits).toHaveLength(1)
    expect(result.current.applyEditsToWeeks(mkWeeks())[0].days[1].workout).toBe('Second')
  })

  it('addDay inserts a workout at an index with its label intact', () => {
    const { result } = renderHook(() => usePlanEdits('mike'))
    act(() => {
      result.current.applyBatch([{ op: { kind: 'addDay', weekNum: 4, atIndex: 1, day: { day: 'Tue 5/5', type: 'run', workout: 'Easy run', detail: '4 mi', zone: 'Z2', route: 'Park', time: '40 min' } } }])
    })
    const weeks = result.current.applyEditsToWeeks(mkWeeks())
    expect(weeks[0].days).toHaveLength(3)
    expect(weeks[0].days[1].day).toBe('Tue 5/5')
    expect(weeks[0].days[2].day).toBe('Wed 5/6')  // shifted down
  })

  it('deleteDay removes a day', () => {
    const { result } = renderHook(() => usePlanEdits('mike'))
    act(() => result.current.applyBatch([{ op: { kind: 'deleteDay', weekNum: 4, dayIndex: 0 } }]))
    const weeks = result.current.applyEditsToWeeks(mkWeeks())
    expect(weeks[0].days).toHaveLength(1)
    expect(weeks[0].days[0].day).toBe('Wed 5/6')
  })

  it('updateWeek edits week-level fields', () => {
    const { result } = renderHook(() => usePlanEdits('mike'))
    act(() => result.current.applyBatch([{ op: { kind: 'updateWeek', weekNum: 5, updates: { focus: 'Recovery week', miles: 10 } } }]))
    const weeks = result.current.applyEditsToWeeks(mkWeeks())
    expect(weeks[1].focus).toBe('Recovery week')
    expect(weeks[1].miles).toBe(10)
  })

  it('deleteWeek removes an entire week', () => {
    const { result } = renderHook(() => usePlanEdits('mike'))
    act(() => result.current.applyBatch([{ op: { kind: 'deleteWeek', weekNum: 5 } }]))
    const weeks = result.current.applyEditsToWeeks(mkWeeks())
    expect(weeks).toHaveLength(1)
    expect(weeks[0].num).toBe(4)
  })

  it('addWeek inserts after the anchor week', () => {
    const { result } = renderHook(() => usePlanEdits('mike'))
    act(() => {
      result.current.applyBatch([{ op: { kind: 'addWeek', atNum: 4, week: { num: 99, dates: 'extra', miles: 5, focus: 'Down week', days: [{ day: 'Mon x', type: 'rest', workout: 'Rest', detail: '—', zone: '—', route: '—', time: '—' }] } } }])
    })
    const weeks = result.current.applyEditsToWeeks(mkWeeks())
    expect(weeks.map(w => w.num)).toEqual([4, 99, 5])
  })

  it('a multi-op batch applies together and undoes as a unit', () => {
    const { result } = renderHook(() => usePlanEdits('mike'))
    let batchId = ''
    act(() => {
      batchId = result.current.applyBatch([
        { op: { kind: 'deleteDay', weekNum: 4, dayIndex: 0 } },
        { op: { kind: 'addDay', weekNum: 4, atIndex: 0, day: { day: 'Mon 5/4', type: 'cross', workout: 'Bike', detail: '45 min Z2', zone: 'Z2', route: 'Indoor', time: '45 min' } } },
        { op: { kind: 'updateWeek', weekNum: 4, updates: { focus: 'Adjusted' } } },
      ])
    })
    let weeks = result.current.applyEditsToWeeks(mkWeeks())
    expect(weeks[0].days[0].workout).toBe('Bike')
    expect(weeks[0].focus).toBe('Adjusted')

    act(() => result.current.undoBatch(batchId))
    weeks = result.current.applyEditsToWeeks(mkWeeks())
    expect(weeks[0].days[0].workout).toBe('STRENGTH')
    expect(weeks[0].focus).toBe('Build')
    expect(result.current.edits).toHaveLength(0)
  })

  it('persists edits across remounts and scopes per athlete', () => {
    const { result, unmount } = renderHook(() => usePlanEdits('mike'))
    act(() => result.current.applyOverride({ weekNum: 4, dayIndex: 0, updates: { workout: 'Persisted' } }))
    unmount()
    const { result: r2 } = renderHook(() => usePlanEdits('mike'))
    expect(r2.current.applyEditsToWeeks(mkWeeks())[0].days[0].workout).toBe('Persisted')
    const { result: jim } = renderHook(() => usePlanEdits('jim'))
    expect(jim.current.edits).toHaveLength(0)
  })

  it('migrates legacy ba_plan_overrides into the op-log', () => {
    localStorage.setItem('ba_plan_overrides_lori', JSON.stringify([
      { id: 'o1', weekNum: 4, dayIndex: 1, updates: { workout: 'Migrated' }, rationale: 'old', appliedAt: 123 },
    ]))
    const { result } = renderHook(() => usePlanEdits('lori'))
    expect(result.current.edits).toHaveLength(1)
    expect(result.current.edits[0].op.kind).toBe('updateDay')
    expect(result.current.applyEditsToWeeks(mkWeeks())[0].days[1].workout).toBe('Migrated')
  })

  // Regression: a day-swap must carry an existing edit to the new slot, and
  // the vacated slot must NOT revert to the base workout. This locks the
  // pipeline order (swaps → edits, with swapDayIndices re-anchoring) that a
  // prior reorder broke ("edit lands on the wrong day after a swap").
  it('an updateDay edit follows a day-swap instead of reverting to base', () => {
    const base = (): TrainingWeek[] => [
      week(6, [
        { day: 'Sat 5/30', type: 'travel', workout: 'TRAVEL', detail: 'Drive', zone: '—', route: '—', time: '—' },
        { day: 'Sun 5/31', type: 'long', workout: 'LONG RUN', detail: '9 mi', zone: 'Z2', route: 'Trail', time: '2 hr' },
      ]),
    ]
    function week(num: number, days: TrainingWeek['days']): TrainingWeek {
      return { num, dates: '', miles: 0, focus: '', days }
    }

    const edits = renderHook(() => usePlanEdits('mike'))
    const swap = renderHook(() => useDaySwap('mike'))

    // Athlete overrides Sun (dayIndex 1) → Rest.
    act(() => { edits.result.current.applyOverride({ weekNum: 6, dayIndex: 1, updates: { type: 'rest', workout: 'Rest', detail: '—' } }) })

    // Compose like App: swaps THEN edits. Pre-swap, Sun shows the override.
    let composed = edits.result.current.applyEditsToWeeks(swap.result.current.applySwapsToWeeks(base()))
    expect(composed[0].days[1].workout).toBe('Rest')

    // Swap Sat(0) ↔ Sun(1) — App wires both the swap and the edit re-anchor.
    act(() => {
      swap.result.current.swapDays(6, 0, 1)
      edits.result.current.swapDayIndices(6, 0, 1)
    })

    composed = edits.result.current.applyEditsToWeeks(swap.result.current.applySwapsToWeeks(base()))
    // Override followed the swap to Sat; Sun shows the swapped-in TRAVEL —
    // NOT the base LONG RUN (which would be the reverted-bug symptom).
    expect(composed[0].days[0].workout).toBe('Rest')      // Sat slot
    expect(composed[0].days[1].workout).toBe('TRAVEL')    // Sun slot — not "LONG RUN"
    expect(composed[0].days[1].workout).not.toBe('LONG RUN')
  })

  it('replayEdits skips out-of-range targets gracefully', () => {
    const edits: PlanEdit[] = [
      { id: '1', batchId: 'b', op: { kind: 'updateDay', weekNum: 99, dayIndex: 0, updates: { workout: 'nope' } }, appliedAt: 1 },
      { id: '2', batchId: 'b', op: { kind: 'updateDay', weekNum: 4, dayIndex: 9, updates: { workout: 'nope' } }, appliedAt: 2 },
    ]
    const weeks = replayEdits(mkWeeks(), edits)
    expect(weeks[0].days[0].workout).toBe('STRENGTH')  // unchanged
  })
})
