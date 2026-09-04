/**
 * The bridge between a declared trip and the plan-edit log.
 *
 * Travel mode is two stores that have to move together: `usePlanEdits` holds
 * the day rewrites as one undoable batch, and `useTravelMode` holds the
 * record that lets a banner say "you're travelling" and undo the whole trip
 * in a tap. Neither owns the pairing, so it lived inline in App.tsx as two
 * callbacks — which is why it had no test of its own.
 *
 * Extracted verbatim: same order, same id shape, same early return. The
 * arguments are the individual functions rather than the two hook objects so
 * this can be exercised without rendering a 2500-line component, and so it
 * cannot quietly start depending on the rest of either hook's surface.
 */
import { useCallback } from 'react'
import type { TrainingWeek, PlanEditOpInput } from '../types'
import { buildTravelBatch, type TravelDeclaration, type TravelWindow } from '../engines/planGenerator/travelMode'

export interface TravelActionsArgs {
  /** The DERIVED weeks — post swap and edit. The batch's op coordinates have
   *  to be in the same space planEdits replays over, so building this against
   *  the base plan would land the rewrites on the wrong days. */
  weeks: TrainingWeek[]
  applyBatch: (ops: PlanEditOpInput[]) => string
  undoBatch: (batchId: string) => void
  addWindow: (w: TravelWindow) => void
  removeWindow: (id: string) => void
}

export interface TravelActions {
  /** Rebalance the trip's days into one undoable batch and remember it. */
  activateTravel: (decl: TravelDeclaration) => void
  /** Drop the batch and the window together. */
  deactivateTravel: (window: TravelWindow) => void
}

export function useTravelActions({
  weeks, applyBatch, undoBatch, addWindow, removeWindow,
}: TravelActionsArgs): TravelActions {
  const activateTravel = useCallback((decl: TravelDeclaration) => {
    const res = buildTravelBatch(weeks, decl)
    // Nothing to rewrite (a trip over days the plan leaves empty) — record no
    // window either, or the athlete gets an undo button for a no-op.
    if (res.ops.length === 0) return
    const batchId = applyBatch(res.ops)
    addWindow({
      id: `travel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      batchId,
      appliedAt: Date.now(),
      summary: res.summary,
      affectedDays: res.affectedDays,
      ...decl,
    })
  }, [weeks, applyBatch, addWindow])

  const deactivateTravel = useCallback((window: TravelWindow) => {
    undoBatch(window.batchId)
    removeWindow(window.id)
  }, [undoBatch, removeWindow])

  return { activateTravel, deactivateTravel }
}
