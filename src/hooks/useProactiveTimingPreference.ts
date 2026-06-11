import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Proactive-coaching timing preferences (per-athlete, per-device
 * localStorage — same posture as useWorkoutTimePreference).
 *
 * Two independently-configurable hours let the athlete decide WHEN the app
 * speaks up proactively:
 *
 *  - `cardHour` — hour-of-day (0–23) at/after which the Summary tab surfaces
 *    the "Tomorrow's Workout" preview card. Default 20 (8 PM).
 *
 *  - `coachEveningHour` — hour-of-day at/after which the coach switches from
 *    its MORNING read to its EVENING read. Drives both the TodayBriefing
 *    recommendation and the daily AI briefing's regeneration. Default 14
 *    (2 PM). Before this hour = morning; at/after = evening.
 *
 * The coach speaks in exactly two windows — morning and evening (no
 * afternoon) — plus the existing post-workout debrief, which is unaffected.
 */

export interface ProactiveTiming {
  cardHour: number
  coachEveningHour: number
}

export interface TimeOption {
  hour: number
  label: string
}

/** Presets for "show tomorrow's workout at" — evening hours. */
export const CARD_TIME_OPTIONS: TimeOption[] = [
  { hour: 17, label: '5 PM' },
  { hour: 18, label: '6 PM' },
  { hour: 19, label: '7 PM' },
  { hour: 20, label: '8 PM' },
  { hour: 21, label: '9 PM' },
]

/** Presets for "evening coaching starts at" — midday → evening. */
export const COACH_EVENING_OPTIONS: TimeOption[] = [
  { hour: 12, label: '12 PM' },
  { hour: 14, label: '2 PM' },
  { hour: 16, label: '4 PM' },
  { hour: 18, label: '6 PM' },
  { hour: 20, label: '8 PM' },
]

export const DEFAULT_CARD_HOUR = 20
export const DEFAULT_COACH_EVENING_HOUR = 14

const LS_PREFIX = 'ba_proactive_timing_v1:'

function lsKey(athleteId: string): string {
  return `${LS_PREFIX}${athleteId}`
}

function clampHour(n: unknown, fallback: number): number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback
}

function read(athleteId: string): ProactiveTiming {
  const fallback = { cardHour: DEFAULT_CARD_HOUR, coachEveningHour: DEFAULT_COACH_EVENING_HOUR }
  try {
    const raw = localStorage.getItem(lsKey(athleteId))
    if (!raw) return fallback
    const p = JSON.parse(raw) as Partial<ProactiveTiming>
    return {
      cardHour: clampHour(p.cardHour, DEFAULT_CARD_HOUR),
      coachEveningHour: clampHour(p.coachEveningHour, DEFAULT_COACH_EVENING_HOUR),
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
  saveCardHour: (hour: number) => void
  saveCoachEveningHour: (hour: number) => void
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

  const saveCardHour = useCallback((hour: number) => {
    const next = { ...timingRef.current, cardHour: clampHour(hour, DEFAULT_CARD_HOUR) }
    write(athleteId, next)
    setTiming(next)
  }, [athleteId])

  const saveCoachEveningHour = useCallback((hour: number) => {
    const next = { ...timingRef.current, coachEveningHour: clampHour(hour, DEFAULT_COACH_EVENING_HOUR) }
    write(athleteId, next)
    setTiming(next)
  }, [athleteId])

  return { ...timing, saveCardHour, saveCoachEveningHour }
}
