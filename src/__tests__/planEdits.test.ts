import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePlanEdits, replayEdits, pruneStaleEdits } from '../hooks/usePlanEdits'
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

// ── userEdited marker (field bug: "Quality day — hit the zone splits"
//    coach note on a day the athlete rewrote into a hike) ─────────────

describe('replayEdits — userEdited marker', () => {
  const base = (): TrainingWeek[] => [{
    num: 1, dates: '', miles: 0, focus: '',
    days: [
      { day: 'Thu 9/24', type: 'quality', workout: 'Intervals', detail: '6×800', zone: 'Z4', route: '', time: '50 min' },
      { day: 'Sat 9/26', type: 'long', workout: 'Long run', detail: '10 mi', zone: 'Z2', route: '', time: '2 hr' },
    ],
  }]
  const edit = (op: PlanEdit['op'], at = 1): PlanEdit => ({ id: `e${at}`, batchId: `b${at}`, appliedAt: at, op })

  it('a type/workout rewrite marks the day userEdited', () => {
    const out = replayEdits(base(), [
      edit({ kind: 'updateDay', weekNum: 1, dayIndex: 0, updates: { workout: 'Tiger Mtn 3', detail: 'Tiger Mtn 3 climb · Poles' } }),
    ])
    expect(out[0].days[0].userEdited).toBe(true)
    expect(out[0].days[1].userEdited).toBeUndefined()
  })

  it('a detail/zone-only update (system repace shape) does NOT mark the day', () => {
    const out = replayEdits(base(), [
      edit({ kind: 'updateDay', weekNum: 1, dayIndex: 0, updates: { detail: '6×800 @ 7:10-7:25/mi', zone: 'Z4 · 7:10-7:25/mi' } }),
    ])
    expect(out[0].days[0].userEdited).toBeUndefined()
  })

  it('an added day is always userEdited', () => {
    const out = replayEdits(base(), [
      edit({ kind: 'addDay', weekNum: 1, atIndex: 2, day: { day: 'Sun 9/27', type: 'cross', workout: 'Mtn bike', detail: '', zone: '—', route: '', time: '1 hr' } }),
    ])
    expect(out[0].days[2].userEdited).toBe(true)
  })
})

describe('generation pruning — old-plan ops never replay onto a rebuild', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear()
  })

  const GEN = '2026-07-10T05:30:00.000Z' // the current plan's birth stamp
  const JUNE = Date.parse('2026-06-15T10:00:00.000Z')
  const AFTER = Date.parse('2026-07-11T09:00:00.000Z')

  const juneEdit: PlanEdit = {
    id: 'e1', batchId: 'b1', appliedAt: JUNE,
    op: { kind: 'updateDay', weekNum: 8, dayIndex: 0, updates: { workout: 'Tiger Mtn 3', type: 'quality' } },
  }
  const freshEdit: PlanEdit = {
    id: 'e2', batchId: 'b2', appliedAt: AFTER,
    op: { kind: 'updateWeek', weekNum: 4, updates: { focus: 'Adjusted' } },
  }

  it('pruneStaleEdits drops ops older than the generation, keeps newer ones', () => {
    expect(pruneStaleEdits([juneEdit, freshEdit], GEN)).toEqual([freshEdit])
    expect(pruneStaleEdits([juneEdit, freshEdit], undefined)).toHaveLength(2) // seed athletes: no-op
    expect(pruneStaleEdits([juneEdit], 'not-a-date')).toHaveLength(1)         // unparseable: no-op
  })

  it('the hook prunes at load AND persists the cleaned log (stamped) so sync propagates it', () => {
    localStorage.setItem('ba_plan_edits_mike', JSON.stringify([juneEdit, freshEdit]))
    const { result } = renderHook(() => usePlanEdits('mike', GEN))
    expect(result.current.edits).toHaveLength(1)
    expect(result.current.edits[0].id).toBe('e2')
    // The stale op is gone from storage — a later sync push carries the prune.
    expect(JSON.parse(localStorage.getItem('ba_plan_edits_mike')!)).toHaveLength(1)
    expect(localStorage.getItem('__attune_meta:__stamp:ba_plan_edits_mike')).toBeTruthy()
    // And the June workout never lands on the new plan.
    const weeks = result.current.applyEditsToWeeks(mkWeeks())
    expect(weeks.flatMap(w => w.days).some(d => d.workout === 'Tiger Mtn 3')).toBe(false)
  })

  it('a sync pull that resurrects a stale log is re-pruned via the storage event', () => {
    const { result } = renderHook(() => usePlanEdits('mike', GEN))
    expect(result.current.edits).toHaveLength(0)
    act(() => {
      localStorage.setItem('ba_plan_edits_mike', JSON.stringify([juneEdit]))
      window.dispatchEvent(new StorageEvent('storage', { key: 'ba_plan_edits_mike' }))
    })
    expect(result.current.edits).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('ba_plan_edits_mike')!)).toHaveLength(0)
  })

  it('without a generation (seed athletes) nothing is pruned', () => {
    localStorage.setItem('ba_plan_edits_mike', JSON.stringify([juneEdit]))
    const { result } = renderHook(() => usePlanEdits('mike'))
    expect(result.current.edits).toHaveLength(1)
  })

  it('new edits made under the current plan survive (appliedAt >= generation)', () => {
    const { result } = renderHook(() => usePlanEdits('mike', GEN))
    act(() => { result.current.applyOverride({ weekNum: 4, dayIndex: 1, updates: { workout: 'Bike intervals' } }) })
    const { result: reloaded } = renderHook(() => usePlanEdits('mike', GEN))
    expect(reloaded.current.edits).toHaveLength(1)
  })

  it('day swaps: stale timestamped swaps are pruned, legacy un-stamped swaps are kept', () => {
    localStorage.setItem('ba_day_swaps_mike', JSON.stringify([
      { weekNum: 4, fromIndex: 0, toIndex: 1, at: JUNE },   // old plan — drop
      { weekNum: 5, fromIndex: 0, toIndex: 0 },              // legacy, no stamp — keep
    ]))
    const { result } = renderHook(() => useDaySwap('mike', GEN))
    expect(result.current.hasSwaps(4)).toBe(false)
    expect(JSON.parse(localStorage.getItem('ba_day_swaps_mike')!)).toHaveLength(1)
  })

  it('day swaps made now carry a timestamp and survive their own generation', () => {
    const { result } = renderHook(() => useDaySwap('mike', GEN))
    act(() => result.current.swapDays(4, 0, 1))
    const stored = JSON.parse(localStorage.getItem('ba_day_swaps_mike')!)
    expect(stored[0].at).toBeGreaterThan(Date.parse(GEN))
    const { result: reloaded } = renderHook(() => useDaySwap('mike', GEN))
    expect(reloaded.current.hasSwaps(4)).toBe(true)
  })
})
