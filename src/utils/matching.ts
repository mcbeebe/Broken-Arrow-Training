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

export function mergeGarminDetailIntoWeeks(
  weeks: TrainingWeek[],
  detailsByDate: Record<string, GarminActivityDetail[]>,
): TrainingWeek[] {
  return weeks.map(week => ({
    ...week,
    days: week.days.map(day => {
      const dayDate = parseDayDate(day.day)
      if (!dayDate) return day

      const details = detailsByDate[dayDate]
      if (!details || details.length === 0) return day

      // Find best matching detail for this day's workout type
      const bestDetail = findBestGarminMatch(day, details)
      if (!bestDetail) return day

      const garminActual = garminDetailToActual(bestDetail)

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
            // Garmin exercise sets are more detailed (from watch sensors)
            strengthLog: garminActual.strengthLog?.length ? garminActual.strengthLog : day.actual.strengthLog,
          },
        }
      }

      // No existing actual — Garmin becomes the actual
      return { ...day, actual: garminActual }
    }),
  }))
}

function findBestGarminMatch(day: PlannedDay, details: GarminActivityDetail[]): GarminActivityDetail | null {
  if (details.length === 1) return details[0]

  const expectedTypes = getExpectedGarminTypes(day.type)
  const typed = details.find(d =>
    expectedTypes.some(t => d.type.toLowerCase().includes(t))
  )
  return typed || details[0]
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
