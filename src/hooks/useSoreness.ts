import { useState, useCallback, useMemo, useEffect } from 'react'
import { localDateStr } from '../utils/format'
import { stampKey } from '../utils/syncStamps'
import { checkInWindowAt } from '../utils/checkInWindow'

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
  /** The day's latest answer — what every existing reader (the readiness
   *  load adjustment, the coach, the briefing) sees. */
  level: SorenessLevel
  timestamp: string
  /** The two check-ins a day can hold: morning (before 10 AM) and evening
   *  (from the evening hour). Each is one answer; answering again in the
   *  same window replaces it. Absent on entries logged before windows
   *  existed, and on legacy single-answer logs. */
  morning?: { level: SorenessLevel; timestamp: string }
  evening?: { level: SorenessLevel; timestamp: string }
}

export type SorenessWindow = 'morning' | 'evening'

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

  /** One answer for a window. The day's top-level `level` becomes this
   *  answer when it is the later of the two, so the latest always wins. */
  const logCheckIn = useCallback((date: string, window: SorenessWindow, level: SorenessLevel) => {
    setEntries(prev => {
      const timestamp = new Date().toISOString()
      const cur = prev[date]
      const stamped = { level, timestamp }
      const other = window === 'morning' ? cur?.evening : cur?.morning
      const latest = other && other.timestamp > timestamp ? other : stamped
      const next = {
        ...prev,
        [date]: { ...(cur ?? {}), level: latest.level, timestamp: latest.timestamp, [window]: stamped },
      }
      saveEntries(athleteId, next)
      return next
    })
  }, [athleteId])

  /** The legacy single-answer log (the readiness briefing still calls it).
   *  It lands in whichever window is open right now, so a briefing answer
   *  at 7 AM is the morning check-in, not a third entry. Outside a window
   *  it updates the day's answer without claiming a window. */
  const logSoreness = useCallback((date: string, level: SorenessLevel, eveningHour = 18) => {
    const window: SorenessWindow | null = checkInWindowAt(new Date(), eveningHour)
    if (window) { logCheckIn(date, window, level); return }
    setEntries(prev => {
      const next = { ...prev, [date]: { ...(prev[date] ?? {}), level, timestamp: new Date().toISOString() } }
      saveEntries(athleteId, next)
      return next
    })
  }, [athleteId, logCheckIn])

  // Today's entry (for UI display)
  const todaySoreness = useMemo(() => {
    const today = localDateStr()
    return entries[today]?.level ?? null
  }, [entries])

  /** Today's two windows, for the Today card and the evening close. */
  const todayCheckIns = useMemo(() => {
    const e = entries[localDateStr()]
    return {
      morning: e?.morning?.level ?? null,
      evening: e?.evening?.level ?? null,
      morningAt: e?.morning?.timestamp,
      eveningAt: e?.evening?.timestamp,
    }
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
    logCheckIn,
    todaySoreness,
    todayCheckIns,
    sorenessLoadByDate,
    entries,
  }
}
