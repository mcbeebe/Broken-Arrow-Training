import { useState, useCallback, useEffect } from 'react'
import type { TrainingWeek, PlannedDay } from '../types'
import { stampKey } from '../utils/syncStamps'

const STORAGE_KEY = 'ba_day_swaps'

interface DaySwap {
  weekNum: number
  fromIndex: number
  toIndex: number
  /** When the swap was made — swaps are index-keyed against the plan
   *  that existed at the time, so a swap older than the current plan
   *  generation is pruned at load (same rule as pruneStaleEdits).
   *  Absent on legacy swaps, which are left alone. */
  at?: number
}

/** Swaps that predate the current plan generation can only shuffle the
 *  wrong plan's days — drop them. Legacy swaps without a timestamp are
 *  kept (they're cleared by the redo path instead). */
function pruneStaleSwaps(swaps: DaySwap[], planGeneration?: string): DaySwap[] {
  if (!planGeneration) return swaps
  const genMs = Date.parse(planGeneration)
  if (!Number.isFinite(genMs)) return swaps
  return swaps.filter(s => s.at === undefined || s.at >= genMs)
}

function loadSwaps(athleteId: string, planGeneration?: string): DaySwap[] {
  const raw = localStorage.getItem(`${STORAGE_KEY}_${athleteId}`)
  if (!raw) return []
  const all = JSON.parse(raw) as DaySwap[]
  const live = pruneStaleSwaps(all, planGeneration)
  if (live.length !== all.length) {
    // Persist the prune (stamped) so the clean list wins the sync LWW.
    saveSwaps(athleteId, live)
  }
  return live
}

function saveSwaps(athleteId: string, swaps: DaySwap[]): void {
  const key = `${STORAGE_KEY}_${athleteId}`
  localStorage.setItem(key, JSON.stringify(swaps))
  stampKey(key)
}

/**
 * Swap the workout content between two days, keeping day labels fixed.
 */
function swapDayContent(dayA: PlannedDay, dayB: PlannedDay): [PlannedDay, PlannedDay] {
  return [
    { ...dayB, day: dayA.day },
    { ...dayA, day: dayB.day },
  ]
}

export function useDaySwap(athleteId: string, planGeneration?: string) {
  const [swaps, setSwaps] = useState<DaySwap[]>(() => loadSwaps(athleteId, planGeneration))

  useEffect(() => {
    setSwaps(loadSwaps(athleteId, planGeneration))
  }, [athleteId, planGeneration])

  // Re-read on cross-device sync pulls (synthetic `storage` events).
  useEffect(() => {
    const watched = `${STORAGE_KEY}_${athleteId}`
    function onStorage(e: StorageEvent) {
      if (e.key !== watched) return
      setSwaps(loadSwaps(athleteId, planGeneration))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [athleteId, planGeneration])

  const swapDays = useCallback((weekNum: number, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    setSwaps(prev => {
      const next = [...prev, { weekNum, fromIndex, toIndex, at: Date.now() }]
      saveSwaps(athleteId, next)
      return next
    })
  }, [athleteId])

  const resetWeek = useCallback((weekNum: number) => {
    setSwaps(prev => {
      const next = prev.filter(s => s.weekNum !== weekNum)
      saveSwaps(athleteId, next)
      return next
    })
  }, [athleteId])

  const applySwapsToWeeks = useCallback((weeks: TrainingWeek[]): TrainingWeek[] => {
    return weeks.map(week => {
      const weekSwaps = swaps.filter(s => s.weekNum === week.num)
      if (weekSwaps.length === 0) return week

      const days = [...week.days]
      for (const swap of weekSwaps) {
        const [newA, newB] = swapDayContent(days[swap.fromIndex], days[swap.toIndex])
        days[swap.fromIndex] = newA
        days[swap.toIndex] = newB
      }
      return { ...week, days }
    })
  }, [swaps])

  const hasSwaps = useCallback((weekNum: number): boolean => {
    return swaps.some(s => s.weekNum === weekNum)
  }, [swaps])

  return { swapDays, resetWeek, applySwapsToWeeks, hasSwaps }
}
