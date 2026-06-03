import { useState, useCallback, useMemo, useEffect } from 'react'
import { localDateStr } from '../utils/format'
import { stampKey } from '../utils/syncStamps'

// ─── Muscle Soreness Check-In ─────────────────────────────────
//
// Science: DOMS (Delayed Onset Muscle Soreness) peaks 24-48h post-exercise
// (Clarkson & Hubal 2002). Perceived soreness is the most reliable
// real-time indicator of musculoskeletal recovery status — more responsive
// than HRV or RHR for eccentric damage (Twist & Highton 2013).
//
// The check-in supplements the model-based DOMS carry-forward with
// actual user perception, closing the feedback loop.

export type SorenessLevel = 1 | 2 | 3 | 4 | 5

export interface SorenessEntry {
  level: SorenessLevel
  timestamp: string
}

const STORAGE_KEY = 'ba_soreness'

// Load adjustment per soreness level (additive TRIMP)
// Level 2 (Normal) = baseline = 0 adjustment
// Higher = body is recovering slower than model predicts
// Lower = recovered faster than expected
export const SORENESS_LOAD_ADJUSTMENT: Record<SorenessLevel, number> = {
  1: -15,  // Fresh — model overestimated DOMS, reduce today's load
  2: 0,    // Normal — model is accurate
  3: 20,   // Sore — mild DOMS, add moderate load
  4: 40,   // Very sore — significant DOMS, add substantial load
  5: 65,   // Wrecked — severe DOMS, major load addition
}

function loadEntries(athleteId: string): Record<string, SorenessEntry> {
  const raw = localStorage.getItem(`${STORAGE_KEY}_${athleteId}`)
  if (!raw) return {}
  return JSON.parse(raw)
}

function saveEntries(athleteId: string, entries: Record<string, SorenessEntry>): void {
  const key = `${STORAGE_KEY}_${athleteId}`
  localStorage.setItem(key, JSON.stringify(entries))
  stampKey(key)
}

export function useSoreness(athleteId: string) {
  const [entries, setEntries] = useState<Record<string, SorenessEntry>>(
    () => loadEntries(athleteId)
  )

  // Re-read on cross-device sync pulls (synthetic `storage` events).
  useEffect(() => {
    const watched = `${STORAGE_KEY}_${athleteId}`
    function onStorage(e: StorageEvent) {
      if (e.key !== watched) return
      setEntries(loadEntries(athleteId))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [athleteId])

  const logSoreness = useCallback((date: string, level: SorenessLevel) => {
    setEntries(prev => {
      const next = { ...prev, [date]: { level, timestamp: new Date().toISOString() } }
      saveEntries(athleteId, next)
      return next
    })
  }, [athleteId])

  // Today's entry (for UI display)
  const todaySoreness = useMemo(() => {
    const today = localDateStr()
    return entries[today]?.level ?? null
  }, [entries])

  // Map of date → load adjustment for the readiness engine
  const sorenessLoadByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const [date, entry] of Object.entries(entries)) {
      const adj = SORENESS_LOAD_ADJUSTMENT[entry.level]
      if (adj !== 0) {
        map.set(date, adj)
      }
    }
    return map
  }, [entries])

  return {
    logSoreness,
    todaySoreness,
    sorenessLoadByDate,
    entries,
  }
}
