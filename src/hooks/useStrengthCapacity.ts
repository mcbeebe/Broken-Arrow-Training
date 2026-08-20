import { useCallback, useEffect, useState } from 'react'
import { stampKey } from '../utils/syncStamps'
import type { StrengthCapacity } from '../engines/strength/benchmark'

/**
 * What the athlete actually measured, persisted per athlete and synced
 * across devices (the key is on both sync allowlists).
 *
 * Deliberately NOT pruned by plan generation like plan edits are: a
 * measured capacity describes the ATHLETE, not the plan, so it survives a
 * plan rebuild. It expires on its own schedule (RETEST_WEEKS), which is
 * about the body changing rather than the plan changing.
 */

const STORAGE_KEY = 'ba_strength_capacity_v1'

function scopedKey(athleteId?: string) {
  return athleteId ? `${STORAGE_KEY}_${athleteId}` : STORAGE_KEY
}

function read(athleteId?: string): StrengthCapacity | null {
  try {
    const raw = localStorage.getItem(scopedKey(athleteId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StrengthCapacity
    return parsed && typeof parsed.measuredAt === 'string' ? parsed : null
  } catch {
    return null
  }
}

export function useStrengthCapacity(athleteId?: string) {
  const [capacity, setCapacity] = useState<StrengthCapacity | null>(() => read(athleteId))

  useEffect(() => {
    setCapacity(read(athleteId))
  }, [athleteId])

  // Re-read when the sync layer writes our key (it dispatches synthetic
  // storage events after a pull), so a benchmark logged on a phone shows
  // up on a laptop without a refresh.
  useEffect(() => {
    const watched = scopedKey(athleteId)
    function onStorage(e: StorageEvent) {
      if (e.key !== watched) return
      setCapacity(read(athleteId))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [athleteId])

  const save = useCallback((next: StrengthCapacity) => {
    try {
      const key = scopedKey(athleteId)
      localStorage.setItem(key, JSON.stringify(next))
      stampKey(key)
    } catch { /* quota */ }
    setCapacity(next)
  }, [athleteId])

  const clear = useCallback(() => {
    try {
      const key = scopedKey(athleteId)
      localStorage.removeItem(key)
      stampKey(key)
    } catch { /* quota */ }
    setCapacity(null)
  }, [athleteId])

  return { capacity, save, clear }
}
