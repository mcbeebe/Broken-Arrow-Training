import { useState, useCallback, useEffect, useMemo } from 'react'
import type { TravelWindow } from '../engines/planGenerator/travelMode'
import { stampKey } from '../utils/syncStamps'

/**
 * Holds the applied travel windows (declared trips that were rebalanced
 * into the plan). Same shape and lifecycle as useReplan / usePlanEdits:
 * localStorage-backed, scoped by athlete, pruned against the plan's birth
 * stamp so last season's trip can never claim this season's days, and
 * re-read on the sync layer's synthetic storage event.
 *
 * The day rewrites themselves live in the usePlanEdits op-log; a window
 * only remembers the batchId so the plan view can show the active-travel
 * strip and undo the whole trip in one tap. App orchestrates the pair:
 * applyBatch(ops) → add(window with that batchId); undoBatch → remove.
 */

const STORAGE_KEY = 'ba_travel_mode'

function scopedKey(athleteId?: string) {
  return athleteId ? `${STORAGE_KEY}_${athleteId}` : STORAGE_KEY
}

/** Windows applied before the current plan generation describe a plan that
 *  no longer exists — drop them (their edits are pruned by the same
 *  contract in usePlanEdits). */
export function pruneStaleTravel(windows: TravelWindow[], planGeneration?: string): TravelWindow[] {
  if (!planGeneration) return windows
  const genMs = Date.parse(planGeneration)
  if (!Number.isFinite(genMs)) return windows
  return windows.filter(w => w.appliedAt >= genMs)
}

function readWindows(athleteId?: string, planGeneration?: string): TravelWindow[] {
  try {
    const raw = localStorage.getItem(scopedKey(athleteId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    const all = Array.isArray(parsed) ? (parsed as TravelWindow[]) : []
    const live = pruneStaleTravel(all, planGeneration)
    if (live.length !== all.length) writeWindows(live, athleteId)
    return live
  } catch {
    return []
  }
}

function writeWindows(windows: TravelWindow[], athleteId?: string) {
  const key = scopedKey(athleteId)
  try {
    localStorage.setItem(key, JSON.stringify(windows))
    stampKey(key)
  } catch { /* quota */ }
}

export function useTravelMode(athleteId?: string, planGeneration?: string) {
  const [windows, setWindows] = useState<TravelWindow[]>(() => readWindows(athleteId, planGeneration))

  useEffect(() => {
    setWindows(readWindows(athleteId, planGeneration))
  }, [athleteId, planGeneration])

  // Cross-device: the sync layer dispatches a synthetic storage event after
  // a pull, so a trip set up on the phone shows up on the laptop.
  useEffect(() => {
    const watched = scopedKey(athleteId)
    function onStorage(e: StorageEvent) {
      if (e.key !== watched) return
      setWindows(readWindows(athleteId, planGeneration))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [athleteId, planGeneration])

  const add = useCallback((w: TravelWindow) => {
    setWindows(prev => {
      const next = [...prev, w]
      writeWindows(next, athleteId)
      return next
    })
  }, [athleteId])

  const remove = useCallback((id: string) => {
    setWindows(prev => {
      const next = prev.filter(w => w.id !== id)
      writeWindows(next, athleteId)
      return next
    })
  }, [athleteId])

  return useMemo(() => ({ windows, add, remove }), [windows, add, remove])
}
