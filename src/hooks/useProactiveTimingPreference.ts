import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Proactive-coaching timing preferences (per-athlete, per-device localStorage —
 * same posture as useWorkoutTimePreference).
 *
 * The coach speaks in two windows, each with a configurable start hour:
 *  - `morningHour` (5–9 AM) — when the MORNING read begins (today's plan).
 *  - `eveningHour` (5–9 PM) — when the EVENING read begins (tomorrow +
 *    recovery). This is ALSO when Summary reveals the "Tomorrow's Workout"
 *    preview card.
 *
 * The small hours before `morningHour` read as evening — the prior night's
 * read carries over. The post-workout debrief is separate and unaffected.
 */

export interface ProactiveTiming {
  morningHour: number
  eveningHour: number
}

export interface TimeOption {
  hour: number
  label: string
}

/** Morning-read start — 5–9 AM. */
export const MORNING_OPTIONS: TimeOption[] = [
  { hour: 5, label: '5 AM' },
  { hour: 6, label: '6 AM' },
  { hour: 7, label: '7 AM' },
  { hour: 8, label: '8 AM' },
  { hour: 9, label: '9 AM' },
]

/** Evening-read start (and tomorrow-card reveal) — 5–9 PM. */
export const EVENING_OPTIONS: TimeOption[] = [
  { hour: 17, label: '5 PM' },
  { hour: 18, label: '6 PM' },
  { hour: 19, label: '7 PM' },
  { hour: 20, label: '8 PM' },
  { hour: 21, label: '9 PM' },
]

export const DEFAULT_MORNING_HOUR = 7
export const DEFAULT_EVENING_HOUR = 18

const LS_PREFIX = 'ba_proactive_timing_v1:'

function lsKey(athleteId: string): string {
  return `${LS_PREFIX}${athleteId}`
}

function clampHour(n: unknown, fallback: number): number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback
}

function read(athleteId: string): ProactiveTiming {
  const fallback = { morningHour: DEFAULT_MORNING_HOUR, eveningHour: DEFAULT_EVENING_HOUR }
  try {
    const raw = localStorage.getItem(lsKey(athleteId))
    if (!raw) return fallback
    const p = JSON.parse(raw) as Partial<ProactiveTiming>
    return {
      morningHour: clampHour(p.morningHour, DEFAULT_MORNING_HOUR),
      eveningHour: clampHour(p.eveningHour, DEFAULT_EVENING_HOUR),
    }
  } catch {
    return fallback
  }
}

function write(athleteId: string, v: ProactiveTiming) {
  try {
    localStorage.setItem(lsKey(athleteId), JSON.stringify(v))
  } catch {
    /* quota — non-fatal */
  }
}

export interface UseProactiveTimingReturn extends ProactiveTiming {
  saveMorningHour: (hour: number) => void
  saveEveningHour: (hour: number) => void
}

export function useProactiveTimingPreference(athleteId: string): UseProactiveTimingReturn {
  const [timing, setTiming] = useState<ProactiveTiming>(() => read(athleteId))

  // Re-read when athleteId changes.
  useEffect(() => {
    setTiming(read(athleteId))
  }, [athleteId])

  // Ref keeps the savers stable (deps: athleteId only) while still writing the
  // other field's current value — matches useWorkoutTimePreference's posture.
  const timingRef = useRef(timing)
  timingRef.current = timing

  const saveMorningHour = useCallback((hour: number) => {
    const next = { ...timingRef.current, morningHour: clampHour(hour, DEFAULT_MORNING_HOUR) }
    write(athleteId, next)
    setTiming(next)
  }, [athleteId])

  const saveEveningHour = useCallback((hour: number) => {
    const next = { ...timingRef.current, eveningHour: clampHour(hour, DEFAULT_EVENING_HOUR) }
    write(athleteId, next)
    setTiming(next)
  }, [athleteId])

  return { ...timing, saveMorningHour, saveEveningHour }
}
