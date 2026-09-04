/**
 * Activating a trip has to move two stores together.
 *
 * The day rewrites live in the plan-edit op-log under one batch id; the
 * travel window is the record that lets a banner say "you're travelling" and
 * undo the whole trip in a tap. Neither store owns the pairing, so it sat
 * inline in App.tsx as two callbacks and had no test at all — the extraction
 * is what makes these assertions possible.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { TrainingWeek } from '../types'
import type { TravelWindow } from '../engines/planGenerator/travelMode'

const buildTravelBatch = vi.fn()
vi.mock('../engines/planGenerator/travelMode', async (orig) => ({
  ...(await orig<typeof import('../engines/planGenerator/travelMode')>()),
  buildTravelBatch: (...a: unknown[]) => buildTravelBatch(...a),
}))

const { useTravelActions } = await import('../hooks/useTravelActions')

const DECL = { startIso: '2026-03-02', endIso: '2026-03-06', kit: 'none' as never }
const WEEKS = [{ num: 1, days: [] }] as unknown as TrainingWeek[]

function setup(over: Record<string, unknown> = {}) {
  const applyBatch = vi.fn(() => 'batch_1')
  const undoBatch = vi.fn()
  const addWindow = vi.fn()
  const removeWindow = vi.fn()
  const { result } = renderHook(() => useTravelActions({
    weeks: WEEKS, applyBatch, undoBatch, addWindow, removeWindow, ...over,
  } as never))
  return { result, applyBatch, undoBatch, addWindow, removeWindow }
}

beforeEach(() => {
  buildTravelBatch.mockReset()
  buildTravelBatch.mockReturnValue({
    ops: [{ op: { kind: 'updateDay', weekNum: 1, dayIndex: 0, updates: {} } }],
    summary: '3 days rebalanced',
    affectedDays: 3,
  })
})

describe('activating a trip', () => {
  it('applies the batch and records a window carrying its id', () => {
    const { result, applyBatch, addWindow } = setup()
    act(() => result.current.activateTravel(DECL))

    expect(applyBatch).toHaveBeenCalledOnce()
    expect(addWindow).toHaveBeenCalledOnce()
    const w = addWindow.mock.calls[0][0] as TravelWindow
    // The batch id is the undo handle — a window that does not carry the id
    // of the batch it created cannot undo it.
    expect(w.batchId).toBe('batch_1')
    expect(w.summary).toBe('3 days rebalanced')
    expect(w.affectedDays).toBe(3)
    expect(w.startIso).toBe(DECL.startIso)
    expect(w.endIso).toBe(DECL.endIso)
  })

  it('builds the batch against the DERIVED weeks it was given', () => {
    // The op coordinates must be in the same space planEdits replays over;
    // built against the base plan they would land on the wrong days.
    const { result } = setup()
    act(() => result.current.activateTravel(DECL))
    expect(buildTravelBatch).toHaveBeenCalledWith(WEEKS, DECL)
  })

  it('records nothing when the trip rewrites nothing', () => {
    // Otherwise the athlete gets an "undo my trip" button for a no-op.
    buildTravelBatch.mockReturnValue({ ops: [], summary: '', affectedDays: 0 })
    const { result, applyBatch, addWindow } = setup()
    act(() => result.current.activateTravel(DECL))
    expect(applyBatch).not.toHaveBeenCalled()
    expect(addWindow).not.toHaveBeenCalled()
  })

  it('gives each trip its own window id', () => {
    const { result, addWindow } = setup()
    act(() => result.current.activateTravel(DECL))
    act(() => result.current.activateTravel(DECL))
    const [a, b] = addWindow.mock.calls.map(c => (c[0] as TravelWindow).id)
    expect(a).not.toBe(b)
  })
})

describe('deactivating a trip', () => {
  it('drops the batch AND the window', () => {
    const { result, undoBatch, removeWindow } = setup()
    const w = { id: 'w1', batchId: 'batch_1' } as TravelWindow
    act(() => result.current.deactivateTravel(w))
    // Dropping only one leaves either orphaned day rewrites with no undo, or
    // a banner for a trip that is no longer applied.
    expect(undoBatch).toHaveBeenCalledWith('batch_1')
    expect(removeWindow).toHaveBeenCalledWith('w1')
  })
})
