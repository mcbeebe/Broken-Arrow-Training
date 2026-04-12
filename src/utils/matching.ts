import type { StravaActivity, TrainingWeek, ActualWorkout, PlannedDay, WorkoutType } from '../types'

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
    distance: metersToMiles(activity.distance),
    movingTime: activity.moving_time,
    elapsedTime: activity.elapsed_time,
    avgHR: activity.average_heartrate,
    maxHR: activity.max_heartrate,
    elevationGain: metersToFeet(activity.total_elevation_gain),
    type: activity.type,
    name: activity.name,
    startDate: activity.start_date_local,
  }
}

function metersToMiles(meters: number): number {
  return Math.round((meters / 1609.344) * 100) / 100
}

function metersToFeet(meters: number): number {
  return Math.round(meters * 3.28084)
}
