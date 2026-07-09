import type { TrainingWeek, WorkoutType } from '../types'
import { parseDayToDate } from './planDates'

/**
 * Realignment detection (G4 — docs/gap-closure-build-plan.md §3).
 *
 * Detects when the plan and reality have drifted far enough that the coach
 * should OFFER a rebalanced week: 1 missed KEY session (long run /
 * quality / race) or 2 missed sessions of any type inside the trailing
 * 7 days. Runna's benchmark prompt fires only after >3 misses — ours is
 * deliberately tighter, and always a negotiation (proposal card with
 * Apply / Modify / Keep + undo), never a silent rewrite.
 *
 * Pure function: the result feeds `realignmentContext` on the coach
 * snapshot, which `build_context_block` (api/coach/_core.py) renders as a
 * REALIGNMENT section instructing the coach to author a plan-edit
 * proposal touching FUTURE days only.
 */

/** Sessions whose loss changes the week's training purpose. */
const KEY_TYPES: ReadonlySet<WorkoutType> = new Set(['long', 'quality', 'race'])

/** Day types that can be "missed" at all (rest/travel are compliance ✓,
 *  `limited` is already an accommodation, not a target). */
const MISSABLE_TYPES: ReadonlySet<WorkoutType> = new Set([
  'run', 'quality', 'long', 'race', 'strength', 'cross',
])

export interface MissedSession {
  isoDate: string
  day: string
  type: WorkoutType
  workout: string
  isKey: boolean
}

export interface RealignmentAssessment {
  qualifies: boolean
  missed: MissedSession[]
  missedKey: MissedSession[]
  /** ISO date of the trailing window's start (inclusive). */
  windowStart: string
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

/**
 * Scan the trailing 7 days (yesterday inclusive, today exclusive — today's
 * session isn't "missed" while there's still daylight to do it; the
 * evening skipped-workout ping owns today).
 */
export function assessRealignment(
  weeks: TrainingWeek[],
  todayIso: string,
): RealignmentAssessment {
  const windowStart = shiftIso(todayIso, -7)
  const missed: MissedSession[] = []

  for (const week of weeks) {
    for (const day of week.days) {
      if (!MISSABLE_TYPES.has(day.type)) continue
      if (day.actual) continue
      const isoDate = parseDayToDate(day.day, week.dates, todayIso)
      if (!isoDate || isoDate >= todayIso || isoDate < windowStart) continue
      missed.push({
        isoDate,
        day: day.day,
        type: day.type,
        workout: day.workout,
        isKey: KEY_TYPES.has(day.type),
      })
    }
  }

  missed.sort((a, b) => a.isoDate.localeCompare(b.isoDate))
  const missedKey = missed.filter(m => m.isKey)
  return {
    qualifies: missedKey.length >= 1 || missed.length >= 2,
    missed,
    missedKey,
    windowStart,
  }
}

/** One-line context string for the coach snapshot. Null when the week is
 *  on track — the REALIGNMENT section must not render for a compliant
 *  athlete (the L4 guard). */
export function buildRealignmentContext(a: RealignmentAssessment): string | null {
  if (!a.qualifies) return null
  const list = a.missed
    .map(m => `${m.workout} (${m.day}${m.isKey ? ', key session' : ''})`)
    .join('; ')
  const headline = a.missedKey.length > 0
    ? `missed a key session this week — ${a.missedKey[0].workout}`
    : `missed ${a.missed.length} sessions this week`
  return `Athlete ${headline}. All misses in the last 7 days: ${list}.`
}

/** Convenience: assessment → context in one call (what App.tsx uses). */
export function realignmentContextForWeeks(
  weeks: TrainingWeek[],
  todayIso: string,
): string | null {
  return buildRealignmentContext(assessRealignment(weeks, todayIso))
}
