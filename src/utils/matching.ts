import type { StravaActivity, TrainingWeek, ActualWorkout, PlannedDay, WorkoutType, GarminActivityDetail } from '../types'
import { garminDetailToActual } from './garmin'

/**
 * Match Strava activities to planned workout days by date and type.
 * Returns a new weeks array with `actual` fields populated.
 */
export function matchActivitiesToPlan(
  weeks: TrainingWeek[],
  activities: StravaActivity[],
): TrainingWeek[] {
  // Index activities by local date (YYYY-MM-DD)
  const byDate = new Map<string, StravaActivity[]>()
  for (const act of activities) {
    const date = act.start_date_local.slice(0, 10)
    const existing = byDate.get(date) || []
    existing.push(act)
    byDate.set(date, existing)
  }

  return weeks.map(week => ({
    ...week,
    days: week.days.map(day => {
      const dayDate = parseDayDate(day.day)
      if (!dayDate) return day

      const dayActivities = byDate.get(dayDate)
      if (!dayActivities || dayActivities.length === 0) return day

      const bestMatch = findBestMatch(day, dayActivities)
      if (!bestMatch) return day

      return { ...day, actual: stravaToActual(bestMatch) }
    }),
  }))
}

/**
 * Parse "Mon 4/13" style day label into "2026-04-13" ISO date.
 * Assumes 2026 training year.
 */
function parseDayDate(dayLabel: string): string | null {
  const match = dayLabel.match(/(\d+)\/(\d+)/)
  if (!match) return null
  const month = parseInt(match[1], 10)
  const date = parseInt(match[2], 10)
  return `2026-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`
}

/**
 * Find the best-matching Strava activity for a planned day.
 * Matches by activity type affinity, falls back to first activity.
 */
function findBestMatch(day: PlannedDay, activities: StravaActivity[]): StravaActivity | null {
  if (activities.length === 1) return activities[0]

  const expectedTypes = getExpectedStravaTypes(day.type)
  const typed = activities.find(a =>
    expectedTypes.some(t =>
      a.type.toLowerCase().includes(t) || a.sport_type.toLowerCase().includes(t)
    )
  )
  return typed || activities[0]
}

/**
 * Map planned workout types to expected Strava activity type keywords.
 */
function getExpectedStravaTypes(type: WorkoutType): string[] {
  switch (type) {
    case 'run':
    case 'quality':
    case 'long':
    case 'race':
      return ['run', 'trail']
    case 'cross':
      return ['ride', 'bike', 'swim', 'row', 'hike', 'walk', 'yoga']
    case 'strength':
      return ['weight', 'workout', 'crossfit']
    default:
      return []
  }
}

/**
 * Convert a Strava API activity to our ActualWorkout shape.
 */
function stravaToActual(activity: StravaActivity): ActualWorkout {
  return {
    stravaId: activity.id,
    source: 'strava',
    distance: metersToMiles(activity.distance),
    movingTime: activity.moving_time,
    elapsedTime: activity.elapsed_time,
    avgHR: activity.average_heartrate,
    maxHR: activity.max_heartrate,
    avgCadence: activity.average_cadence,
    avgSpeed: activity.average_speed,
    maxSpeed: activity.max_speed,
    sufferScore: activity.suffer_score,
    calories: activity.calories,
    elevationGain: metersToFeet(activity.total_elevation_gain),
    elevHigh: activity.elev_high ? metersToFeet(activity.elev_high) : undefined,
    elevLow: activity.elev_low ? metersToFeet(activity.elev_low) : undefined,
    type: activity.type,
    name: activity.name,
    startDate: activity.start_date_local,
    notes: activity.description?.trim() || undefined,
    deviceName: activity.device_name,
    splits: activity.splits_metric?.map(s => ({
      split: s.split,
      pace: formatPaceFromSpeed(s.average_speed),
      hr: s.average_heartrate,
      elev: metersToFeet(s.elevation_difference),
    })),
    laps: activity.laps?.map(l => ({
      name: l.name,
      distance: metersToMiles(l.distance),
      pace: formatPaceFromSpeed(l.average_speed),
      hr: l.average_heartrate,
      elev: l.total_elevation_gain ? metersToFeet(l.total_elevation_gain) : undefined,
    })),
  }
}

function metersToMiles(meters: number): number {
  return Math.round((meters / 1609.344) * 100) / 100
}

function metersToFeet(meters: number): number {
  return Math.round(meters * 3.28084)
}

function formatPaceFromSpeed(metersPerSec: number): string {
  if (!metersPerSec || metersPerSec === 0) return '--'
  const secsPerMile = 1609.344 / metersPerSec
  const mins = Math.floor(secsPerMile / 60)
  const secs = Math.round(secsPerMile % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}/mi`
}

// ─── Garmin Activity Detail Merge ──────────────────────────────

/** Activities under this duration (sec) are treated as Garmin sync stubs
 *  (e.g. user started, stopped, deleted on watch — Garmin's API may keep
 *  returning them for up to a sync cycle). Filtered out before matching
 *  AND before secondary-activity surfacing. */
const MIN_ACTIVITY_DURATION_SEC = 120

export function mergeGarminDetailIntoWeeks(
  weeks: TrainingWeek[],
  detailsByDate: Record<string, GarminActivityDetail[]>,
): TrainingWeek[] {
  return weeks.map(week => ({
    ...week,
    days: week.days.map(day => {
      const dayDate = parseDayDate(day.day)
      if (!dayDate) return day

      const allDetails = detailsByDate[dayDate]
      if (!allDetails || allDetails.length === 0) return day

      const details = allDetails.filter(d => activityDuration(d) >= MIN_ACTIVITY_DURATION_SEC)
      if (details.length === 0) return day

      // Find best matching detail for this day's workout type
      const bestDetail = findBestGarminMatch(day, details)
      if (!bestDetail) return day

      const garminActual = garminDetailToActual(bestDetail)

      // Surface other activities for the same day so the UI can show them.
      // Skip the chosen one and any that match by garminId (in case of dupes).
      const others = details
        .filter(d => d.activityId !== bestDetail.activityId)
        .map(d => garminDetailToActual(d))
      const secondaryActuals = others.length > 0 ? others : undefined

      if (day.actual) {
        // Enrich existing actual (Strava or manual) with Garmin biometric data.
        // Garmin always provides HR, TE, EPOC, HR zones, exercise sets — layer these
        // on top of whatever exists, preserving the original source's data as base.
        return {
          ...day,
          actual: {
            ...garminActual,           // Garmin as base (HR, TE, EPOC, exercises)
            ...day.actual,             // Strava/manual overrides on top (preserves manual edits)
            // Always use Garmin biometrics — these are device-measured, more reliable
            avgHR: garminActual.avgHR ?? day.actual.avgHR,
            maxHR: garminActual.maxHR ?? day.actual.maxHR,
            aerobicTE: garminActual.aerobicTE,
            anaerobicTE: garminActual.anaerobicTE,
            epoc: garminActual.epoc,
            recoveryTimeHours: garminActual.recoveryTimeHours,
            vo2max: garminActual.vo2max,
            hrZoneSummary: garminActual.hrZoneSummary,
            garminId: garminActual.garminId,
            // Prefer Strava laps if available (richer metadata), fall back to Garmin splits
            laps: day.actual.laps?.length ? day.actual.laps : garminActual.laps,
            // Garmin exercise sets are more detailed (from watch sensors)
            strengthLog: garminActual.strengthLog?.length ? garminActual.strengthLog : day.actual.strengthLog,
          },
          secondaryActuals,
        }
      }

      // No existing actual — Garmin becomes the actual
      return { ...day, actual: garminActual, secondaryActuals }
    }),
  }))
}

function activityDuration(d: GarminActivityDetail): number {
  return d.movingDurationSeconds || d.durationSeconds || 0
}

/** Score = duration × HR proxy. Captures total stimulus better than
 *  duration alone (a 20-min strength at 130 bpm beats a 25-min walk at
 *  95 bpm). Falls back to duration when no HR. */
function activityScore(d: GarminActivityDetail): number {
  const dur = activityDuration(d)
  const hr = d.averageHR ?? 100
  return dur * Math.max(hr, 100)
}

/** Pick the best Garmin activity for the planned day:
 *  1. Among activities whose type matches the plan, take the highest-scored.
 *  2. If none match, take the highest-scored overall.
 *  Caller has already filtered out sub-MIN_ACTIVITY_DURATION_SEC stubs. */
export function findBestGarminMatch(day: PlannedDay, details: GarminActivityDetail[]): GarminActivityDetail | null {
  if (details.length === 0) return null
  if (details.length === 1) return details[0]

  const expectedTypes = getExpectedGarminTypes(day.type)
  const matching = details.filter(d =>
    expectedTypes.some(t => d.type.toLowerCase().includes(t))
  )
  const pool = matching.length > 0 ? matching : details
  return pool.reduce((best, d) => activityScore(d) > activityScore(best) ? d : best)
}

function getExpectedGarminTypes(type: WorkoutType): string[] {
  switch (type) {
    case 'run': case 'quality': case 'long': case 'race':
      return ['running', 'trail_running', 'treadmill']
    case 'cross':
      return ['cycling', 'swimming', 'hiking', 'walking', 'yoga', 'elliptical', 'rowing']
    case 'strength':
      return ['strength', 'cardio', 'hiit']
    default:
      return []
  }
}
