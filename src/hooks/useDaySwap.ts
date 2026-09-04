import { useState, useCallback, useEffect, useMemo } from 'react'
import type { TrainingWeek, PlannedDay } from '../types'
import { stampKey } from '../utils/syncStamps'

const STORAGE_KEY = 'ba_day_swaps'

interface SwapBase {
  /** Stable identity for the cross-device union. Absent on records written
   *  before this existed; the merge falls back to a content-derived key for
   *  those, which is why it must never be dropped from the stored shape. */
  id?: string
  weekNum: number
  /** When the record was made — swaps are index-keyed against the plan
   *  that existed at the time, so a swap older than the current plan
   *  generation is pruned at load (same rule as pruneStaleEdits).
   *  Absent on legacy swaps, which are left alone. */
  at?: number
}

interface DaySwap extends SwapBase {
  fromIndex: number
  toIndex: number
  reset?: undefined
}

/** A TOMBSTONE for "reset this week".
 *
 *  Resetting used to filter the week's swaps out of the array. That is
 *  unrepresentable across devices — the other device still holds them, so a
 *  union-merge puts them straight back. Recording the reset as something
 *  ADDED makes it a fact both devices converge on. It revokes every swap in
 *  `weekNum` made before `at`, so a swap made after the reset survives.
 *
 *  Doubly load-bearing here: `applySwapsToWeeks` replays swaps in sequence,
 *  so a resurrected swap does not merely reappear — it applies a SECOND time
 *  and cancels the first out, leaving the week silently unswapped. */
interface SwapReset extends SwapBase {
  reset: true
}

type SwapEntry = DaySwap | SwapReset

function isReset(e: SwapEntry): e is SwapReset {
  return e.reset === true
}

/** The swaps still standing: everything that is not a tombstone and is not
 *  revoked by one, in deterministic replay order.
 *
 *  Order matters — swaps compose — and after a union the array's own order
 *  reflects nothing but which device happened to write last. Sorting by `at`
 *  makes both devices replay the same sequence. */
function liveSwaps(entries: SwapEntry[]): DaySwap[] {
  const resets = entries.filter(isReset)
  const live = entries.filter((e): e is DaySwap => !isReset(e))
  const kept = resets.length === 0 ? live : live.filter(
    s => !resets.some(r => r.weekNum === s.weekNum && (s.at ?? 0) < (r.at ?? 0)))
  return [...kept].sort((a, b) => {
    const at = (a.at ?? 0) - (b.at ?? 0)
    if (at !== 0) return at
    return swapKey(a) < swapKey(b) ? -1 : swapKey(a) > swapKey(b) ? 1 : 0
  })
}

/** Content identity for a swap with no `id` — see SwapBase.id. Must match
 *  `entryKey` in utils/syncMerge, which keys the union the same way. */
function swapKey(s: SwapEntry): string {
  return s.id ?? `${s.weekNum}:${(s as DaySwap).fromIndex ?? 'r'}:${(s as DaySwap).toIndex ?? 'r'}:${s.at ?? 0}`
}

/** Swaps that predate the current plan generation can only shuffle the
 *  wrong plan's days — drop them. Legacy swaps without a timestamp are
 *  kept (they're cleared by the redo path instead). */
/** A timestamp strictly greater than everything already in the log, floored
 *  at now. Two actions inside the same millisecond would otherwise leave a
 *  reset comparing as "not after" the swap it is meant to revoke. Wall-clock
 *  floored (not a counter) so `at` stays comparable across devices. */
function nextStamp(log: SwapEntry[]): number {
  let max = 0
  for (const e of log) if ((e.at ?? 0) > max) max = e.at ?? 0
  return Math.max(Date.now(), max + 1)
}

function pruneStaleSwaps(swaps: SwapEntry[], planGeneration?: string): SwapEntry[] {
  if (!planGeneration) return swaps
  const genMs = Date.parse(planGeneration)
  if (!Number.isFinite(genMs)) return swaps
  return swaps.filter(s => s.at === undefined || s.at >= genMs)
}

function loadSwaps(athleteId: string, planGeneration?: string): SwapEntry[] {
  const raw = localStorage.getItem(`${STORAGE_KEY}_${athleteId}`)
  if (!raw) return []
  const all = JSON.parse(raw) as SwapEntry[]
  const live = pruneStaleSwaps(all, planGeneration)
  if (live.length !== all.length) {
    // Persist the prune (stamped) so the clean list wins the sync LWW.
    saveSwaps(athleteId, live)
  }
  return live
}

function saveSwaps(athleteId: string, swaps: SwapEntry[]): void {
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
  const [log, setSwaps] = useState<SwapEntry[]>(() => loadSwaps(athleteId, planGeneration))
  const swaps = useMemo(() => liveSwaps(log), [log])

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
      const at = nextStamp(prev)
      const next: SwapEntry[] = [...prev, {
        id: `swap_${at}_${Math.random().toString(36).slice(2, 8)}`,
        weekNum, fromIndex, toIndex, at,
      }]
      saveSwaps(athleteId, next)
      return next
    })
  }, [athleteId])

  const resetWeek = useCallback((weekNum: number) => {
    // Appends a tombstone rather than filtering the week's swaps out — see
    // SwapReset for why an absence cannot survive a cross-device merge.
    setSwaps(prev => {
      const at = nextStamp(prev)
      const next: SwapEntry[] = [...prev, {
        id: `swapreset_${at}_${Math.random().toString(36).slice(2, 8)}`,
        weekNum, at, reset: true,
      }]
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
