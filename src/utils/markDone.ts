import type { ActualWorkout, PlannedDay } from '../types'

/**
 * "Mark as done" — the one-tap completion for a session done without a
 * watch: a walk, a foam roll, a strength session in the garage. It writes
 * an ordinary manual log for the planned duration, so downstream (the
 * rhythm strip, the evening close, compliance, the coach) cannot tell it
 * from any other logged session — and a later watch sync merges onto it
 * rather than fighting it.
 */

/** Minutes a planned time string asks for: "20-30 min" → 25, "~90 min" →
 *  90, "45-60 min" → 52, "1 hr" → 60. Null when it names no duration. */
export function plannedMinutes(time: string | undefined | null): number | null {
  if (!time) return null
  const t = time.toLowerCase()
  const range = t.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(min|h)/)
  if (range) {
    const a = parseFloat(range[1]), b = parseFloat(range[2])
    const mins = range[3] === 'h' ? ((a + b) / 2) * 60 : (a + b) / 2
    return Math.round(mins)
  }
  const hours = t.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hour)/)
  if (hours) return Math.round(parseFloat(hours[1]) * 60)
  const mins = t.match(/(\d+)\s*min/)
  if (mins) return parseInt(mins[1], 10)
  return null
}

const ACTIVITY_TYPE: Partial<Record<PlannedDay['type'], string>> = {
  run: 'run', long: 'run', quality: 'run', race: 'run',
  strength: 'workout', cross: 'workout', limited: 'walk', travel: 'walk',
}

/** The manual log "Mark as done" writes: the planned session, for its
 *  planned duration, on today's date. A walk-shaped day logs as a walk. */
export function actualFromPlanned(day: PlannedDay, dayIso: string, now: number): ActualWorkout {
  const minutes = plannedMinutes(day.time) ?? 30
  const seconds = minutes * 60
  const walkish = /\bwalk\b/i.test(day.workout) || /\bwalk\b/i.test(day.detail ?? '')
  const type = walkish ? 'walk' : (ACTIVITY_TYPE[day.type] ?? 'workout')
  const d = new Date(now)
  const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0')
  return {
    stravaId: now,
    source: 'manual',
    distance: 0,
    movingTime: seconds,
    elapsedTime: seconds,
    elevationGain: 0,
    type,
    name: day.workout,
    startDate: `${dayIso}T${hh}:${mm}:00`,
    notes: 'Marked as done',
  }
}

/** One line for the receipt: "24 min · 1.6 mi · from Garmin". */
export function completionSummary(a: ActualWorkout): string {
  const parts: string[] = []
  const mins = Math.round((a.movingTime || a.elapsedTime || 0) / 60)
  if (mins > 0) parts.push(`${mins} min`)
  if (a.distance > 0) parts.push(`${Math.round(a.distance * 10) / 10} mi`)
  if (a.avgHR) parts.push(`${Math.round(a.avgHR)} bpm avg`)
  const from = a.source === 'garmin' ? 'from Garmin' : a.source === 'strava' ? 'from Strava' : a.source === 'apple' ? 'from Apple Health'
    : a.notes === 'Marked as done' ? 'marked done' : 'logged by you'
  parts.push(from)
  return parts.join(' · ')
}
