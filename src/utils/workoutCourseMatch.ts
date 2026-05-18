import type { PlannedDay, RaceInfo } from '../types'
import type { CourseSegment } from '../types/course'
import {
  matchTrainingToCourseSegments,
  type TrainingSegment,
  type SegmentMatch,
} from './courseMatching'
import { resolveCourseForRace } from './resolveCourse'
import { parsePlannedTargets } from './targets'

/**
 * "Today's workout looks like…" — projects a planned session onto the
 * race course by reusing the existing course-matching engine.
 *
 * Returns null whenever we can't say something useful: no curated course
 * for the race, no distance/elevation derivable from the plan, rest day,
 * or no course segment scores above the quality threshold.
 *
 * The threshold is intentionally conservative (above the matcher's
 * default 0.5) — a tautological "any 4-mile chunk matches your 4-mile
 * easy run" line is worse than silence. We want this line to surprise
 * the athlete with a specific course connection, not to render every
 * day at all costs.
 */

const QUALITY_THRESHOLD = 0.65

const SKIP_WORKOUT_TYPES = new Set(['rest', 'strength', 'mobility'])

export interface WorkoutCourseMatch {
  segment: CourseSegment
  score: number
  /** The `TrainingSegment` we synthesized from the plan — exposed for
   *  debugging / future expansion (per-segment cards). */
  training: TrainingSegment
}

/** Synthesize a TrainingSegment from a PlannedDay. Returns null when
 *  the day doesn't carry enough numeric structure to match meaningfully
 *  (no distance, or rest/strength/mobility). */
export function buildTrainingFromPlannedDay(day: PlannedDay): TrainingSegment | null {
  if (SKIP_WORKOUT_TYPES.has(day.type)) return null
  const targets = parsePlannedTargets(day)
  const lengthMi = targets.distanceMi
  if (!lengthMi || lengthMi <= 0) return null

  // Elevation: parser reports unsigned feet of gain. Net vertical here is
  // unsigned-positive for climbs; without per-day descent metadata we
  // assume a planned run with significant gain is a climb-skewed session
  // (matches existing plan format). Pure-flat runs get netVerticalFt 0
  // and match flat course segments.
  const netVerticalFt = targets.elevationFt ?? 0

  // Derive avg grade from net vert / horizontal distance. Crude (doesn't
  // account for descents on the same route) but enough signal for course
  // matching since the matcher cross-weights vertical, length, and grade.
  const horizontalFt = lengthMi * 5280
  const avgGradePct = horizontalFt > 0 ? (netVerticalFt / horizontalFt) * 100 : 0

  return {
    lengthMi,
    netVerticalFt,
    avgGradePct,
    // Surface unknown — let the matcher default to neutral. Plans don't
    // carry structured surface metadata yet.
  }
}

export function findBestCourseMatchForPlanned(
  day: PlannedDay | null | undefined,
  race: RaceInfo | null | undefined,
): WorkoutCourseMatch | null {
  if (!day || !race) return null
  const training = buildTrainingFromPlannedDay(day)
  if (!training) return null
  const resolution = resolveCourseForRace(race)
  if (!resolution) return null
  const matches: SegmentMatch[] = matchTrainingToCourseSegments(
    training,
    resolution.course.segments,
    { minScore: QUALITY_THRESHOLD },
  )
  if (matches.length === 0) return null
  const best = matches[0]
  return { segment: best.segment, score: best.score, training }
}

/** Render-ready one-liner. Returns null when there's no good match.
 *  Format: "Today's run is like the KT-22 Climb — miles 2.3–4.8 on race day"
 *  Falls back to a generic phrasing when the segment name is unavailable. */
export function formatLooksLikeLine(match: WorkoutCourseMatch | null): string | null {
  if (!match) return null
  const { segment } = match
  const start = formatMile(segment.startMile)
  const end = formatMile(segment.endMile)
  const name = segment.name?.trim()
  if (name) {
    return `Today's workout is like the ${name} — miles ${start}–${end} on race day`
  }
  return `Today's workout is like miles ${start}–${end} of the course`
}

function formatMile(mi: number): string {
  // Whole miles when very close to integer, otherwise one decimal.
  const rounded = Math.round(mi * 10) / 10
  return Math.abs(rounded - Math.round(rounded)) < 0.05
    ? String(Math.round(rounded))
    : rounded.toFixed(1)
}
