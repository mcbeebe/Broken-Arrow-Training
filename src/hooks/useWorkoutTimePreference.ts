import { useCallback, useEffect, useState } from 'react'

/**
 * Preferred training time of day. Drives the per-hour weather chip on
 * DayCards + Summary so the temperature/precip/wind the athlete sees
 * reflects when they actually run, not the daily peak.
 *
 * Per-athlete, per-device localStorage (same posture as
 * useAthleteLocation). The athlete picks one of five common slots or
 * 'varies' to fall back to the daily aggregate.
 */

export type WorkoutTimeSlot =
  | 'early-morning'  // 06:00 — pre-dawn runs
  | 'morning'        // 08:00 — most common
  | 'lunch'          // 12:00 — midday workouts
  | 'evening'        // 17:00 — after work
  | 'late-evening'   // 19:00 — post-dinner / late
  | 'varies'         // no fixed time → fall back to daily aggregate

export interface WorkoutTimeOption {
  slot: WorkoutTimeSlot
  /** Hour-of-day 0-23, or null for 'varies'. */
  hour: number | null
  label: string
  /** Short hint shown under the radio label. */
  description: string
}

export const WORKOUT_TIME_OPTIONS: WorkoutTimeOption[] = [
  { slot: 'early-morning', hour: 6,  label: 'Early morning', description: '~6 am · pre-dawn runs' },
  { slot: 'morning',       hour: 8,  label: 'Morning',       description: '~8 am · most common' },
  { slot: 'lunch',         hour: 12, label: 'Lunch',         description: 'Midday workouts' },
  { slot: 'evening',       hour: 17, label: 'Evening',       description: '~5 pm · after work' },
  { slot: 'late-evening',  hour: 19, label: 'Late evening',  description: '~7 pm · post-dinner' },
  { slot: 'varies',        hour: null, label: 'Varies',      description: 'Use daily aggregate forecast' },
]

const LS_PREFIX = 'ba_workout_time_pref_v1:'
const DEFAULT_SLOT: WorkoutTimeSlot = 'morning'

function lsKey(athleteId: string): string {
  return `${LS_PREFIX}${athleteId}`
}

function read(athleteId: string): WorkoutTimeSlot {
  try {
    const raw = localStorage.getItem(lsKey(athleteId))
    if (!raw) return DEFAULT_SLOT
    if (WORKOUT_TIME_OPTIONS.some(o => o.slot === raw)) return raw as WorkoutTimeSlot
    return DEFAULT_SLOT
  } catch {
    return DEFAULT_SLOT
  }
}

function write(athleteId: string, slot: WorkoutTimeSlot) {
  try {
    localStorage.setItem(lsKey(athleteId), slot)
  } catch {
    /* quota */
  }
}

export function hourForSlot(slot: WorkoutTimeSlot): number | null {
  return WORKOUT_TIME_OPTIONS.find(o => o.slot === slot)?.hour ?? null
}

export function labelForSlot(slot: WorkoutTimeSlot): string {
  return WORKOUT_TIME_OPTIONS.find(o => o.slot === slot)?.label ?? slot
}

export interface UseWorkoutTimePreferenceReturn {
  slot: WorkoutTimeSlot
  /** Hour-of-day or null when slot is 'varies'. */
  hour: number | null
  label: string
  save: (next: WorkoutTimeSlot) => void
}

export function useWorkoutTimePreference(athleteId: string): UseWorkoutTimePreferenceReturn {
  const [slot, setSlot] = useState<WorkoutTimeSlot>(() => read(athleteId))

  // Re-read when athleteId changes.
  useEffect(() => {
    setSlot(read(athleteId))
  }, [athleteId])

  const save = useCallback((next: WorkoutTimeSlot) => {
    write(athleteId, next)
    setSlot(next)
  }, [athleteId])

  return {
    slot,
    hour: hourForSlot(slot),
    label: labelForSlot(slot),
    save,
  }
}
