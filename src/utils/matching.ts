import type { StravaActivity, TrainingWeek, ActualWorkout, PlannedDay, WorkoutType, GarminActivityDetail } from '../types'
import { garminDetailToActual } from './garmin'
import type { AppleActivity } from './apple'
import { dayIsoInWeek } from './planDates'

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
      const dayDate = dayIsoInWeek(day.day, week)
      if (!dayDate) return day

      const dayActivities = byDate.get(dayDate)
      if (!dayActivities || dayActivities.length === 0) return day

      const bestMatch = findBestMatch(day, dayActivities)
      if (!bestMatch) {
        // Nothing earned the claim (the e-bike-vs-station-circuit case):
        // the day stays incomplete, the activities still show as "other
        // activities recorded today" and still count toward load.
        return { ...day, secondaryActuals: dayActivities.map(stravaToActual) }
      }

      const others = dayActivities.filter(a => a.id !== bestMatch.id)
      return {
        ...day,
        actual: stravaToActual(bestMatch),
        ...(others.length > 0 ? { secondaryActuals: others.map(stravaToActual) } : {}),
      }
    }),
  }))
}

// ─── Claim eligibility ─────────────────────────────────────────
//
// Field bug: a 13-minute Oakland e-bike ride auto-completed a 45-minute
// gym Station circuit. Every source path (Strava, Garmin, Apple) shared
// the same flaw — a lone activity claimed the planned day UNCONDITIONALLY,
// and with several, a "best anyway" fallback claimed even when nothing
// matched. An activity must now EARN the claim; ones that don't surface
// as secondaryActuals ("other activities recorded today") and still count
// toward training load, but the planned workout stays honestly incomplete.

/** Station circuits and strength-flavored cross days live in the gym —
 *  no amount of riding or running completes them. Only cross/strength
 *  days qualify: a coach edit can retype a day to `run` while leaving the
 *  old `route: 'Gym'` behind, and an explicit run-class type must win. */
/**
 * A day whose MAIN work is an erg effort: an erg/row/ski-erg word
 * followed by a trial word in the workout title ("1km erg time trial",
 * "Row test", "SkiErg TT"). Deliberately order-sensitive — the combined
 * "1km time trial + erg baseline" benchmark day does NOT match, because
 * its headline effort is the run; the erg there is the add-on.
 */
export function ergPrimaryDay(day: PlannedDay): boolean {
  return /\b(?:ski\s*-?\s*erg|skierg|row(?:er|ing)?|erg)\b[^·|.]*\b(?:time[\s-]?trial|tt|test)\b/i.test(day.workout)
}

/** Erg-flavored recording types: rowing, indoor rowing, ski erg. */
function isErgActivity(lowerType: string): boolean {
  return /row|ski|erg/.test(lowerType)
}

export function isGymBasedDay(day: PlannedDay): boolean {
  if (day.type !== 'cross' && day.type !== 'strength') return false
  return day.route === 'Gym' || (day.type === 'cross' && /station|circuit|strength/i.test(day.workout))
}

/** Parse the plan's session length ("45 min", "1 hr", "1 hr 15 min") into
 *  seconds; 0 when unparseable — callers skip the duration gate then. */
export function plannedDurationSec(day: PlannedDay): number {
  if (!day.time || day.time === '—') return 0
  const hr = day.time.match(/(\d+)\s*h/i)
  const min = day.time.match(/(\d+)\s*min/i)
  if (hr || min) return (hr ? parseInt(hr[1]) * 3600 : 0) + (min ? parseInt(min[1]) * 60 : 0)
  const bare = day.time.match(/(\d+)/)
  return bare ? parseInt(bare[1]) * 60 : 0
}

/** An activity claiming LESS than this share of the planned session is a
 *  secondary activity (a commute, a warm-up spin), not the workout. */
const CLAIM_MIN_DURATION_SHARE = 0.4

/**
 * May an activity of this type/duration claim this planned day as its
 * completion? Modality first, then duration:
 *   - run-class days take runs;
 *   - strength days and gym-based cross days take gym-flavored work;
 *   - other cross days are broad (ride, swim, run, hike…) — the ONLY
 *     place an e-bike ride can complete anything;
 *   - rest days keep the old behavior: anything attaches, informationally
 *     (there is no prescription to falsely complete).
 */
export function canClaimPlannedDay(day: PlannedDay, activityType: string, sessionSec: number): boolean {
  if (day.type === 'rest') return true

  const t = activityType.toLowerCase()
  const isRun = /run|trail|treadmill/.test(t)
  const isGymWork = /weight|strength|workout|crossfit|hiit|cardio|circuit|training/.test(t)
  const isEbike = /e-?bike/.test(t)
  const isRide = /ride|bike|cycl/.test(t)
  const isOtherCross = /swim|row|hike|walk|yoga|elliptical|ski|skate/.test(t)

  // An erg-primary day (e.g. "BENCHMARK: 1km erg time trial") is DONE on
  // the erg, whatever class the day was filed under — the erg recording
  // both passes modality and skips the duration-share gate, because a
  // time trial is intrinsically minutes long while the prescription
  // includes warm-up and rests. The 60s floor keeps out junk taps.
  if (ergPrimaryDay(day) && isErgActivity(t)) {
    return sessionSec >= 60
  }

  let modalityOk: boolean
  if (day.type === 'strength' || isGymBasedDay(day)) {
    modalityOk = isGymWork && !isRun && !isRide
  } else if (day.type === 'cross') {
    modalityOk = isRun || isRide || isOtherCross || isEbike
  } else {
    // run-class: run / quality / long / race
    modalityOk = isRun
  }
  if (!modalityOk) return false

  // E-bikes are transport more often than training (MIM already rates
  // them 0.30×) — eligible only on the broad cross days handled above.
  if (isEbike && (day.type !== 'cross' || isGymBasedDay(day))) return false

  // Compare the SESSION length (elapsed, callers pass max of moving/
  // elapsed) against the prescription — the prescription includes rests,
  // and in the gym most of a legit session is "not moving".
  const plannedSec = plannedDurationSec(day)
  if (plannedSec > 0 && sessionSec > 0 && sessionSec < plannedSec * CLAIM_MIN_DURATION_SHARE) {
    return false
  }
  return true
}

/**
 * Best-matching Strava activity that has EARNED the claim — or null, in
 * which case the day stays incomplete and the caller surfaces the
 * activities as secondaries. No claim-anyway fallback, ever again.
 */
function findBestMatch(day: PlannedDay, activities: StravaActivity[]): StravaActivity | null {
  const eligible = activities.filter(a =>
    canClaimPlannedDay(day, `${a.type} ${a.sport_type}`, Math.max(a.moving_time ?? 0, a.elapsed_time ?? 0)),
  )
  if (eligible.length === 0) return null
  if (eligible.length === 1) return eligible[0]

  // Erg-primary day: the erg recording IS the workout — a longer warm-up
  // run must not outrank the 3-minute time trial it warmed up for.
  if (ergPrimaryDay(day)) {
    const ergs = eligible.filter(a => /row|ski|erg/.test(`${a.type} ${a.sport_type}`.toLowerCase()))
    if (ergs.length > 0) {
      return ergs.reduce((best, a) => (a.moving_time ?? 0) > (best.moving_time ?? 0) ? a : best)
    }
  }

  const expectedTypes = getExpectedStravaTypes(day.type)
  const typed = eligible.filter(a =>
    expectedTypes.some(t =>
      a.type.toLowerCase().includes(t) || a.sport_type.toLowerCase().includes(t)
    )
  )
  const pool = typed.length > 0 ? typed : eligible
  return pool.reduce((best, a) => (a.moving_time ?? 0) > (best.moving_time ?? 0) ? a : best)
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
      const dayDate = dayIsoInWeek(day.day, week)
      if (!dayDate) return day

      const allDetails = detailsByDate[dayDate]
      if (!allDetails || allDetails.length === 0) return day

      const details = allDetails.filter(d => activityDuration(d) >= MIN_ACTIVITY_DURATION_SEC)
      if (details.length === 0) return day

      // Find the detail that has EARNED the claim (same gate as Strava).
      // For an already-claimed day, fall back to the highest-scored detail
      // for ENRICHMENT only — layering biometrics on an existing actual is
      // low-stakes; falsely completing an empty day is not.
      const bestDetail = findBestGarminMatch(day, details)
        ?? (day.actual ? details.reduce((b, d) => activityScore(d) > activityScore(b) ? d : b) : null)
      if (!bestDetail) {
        const secondaries = details.map(d => garminDetailToActual(d))
        return { ...day, secondaryActuals: secondaries }
      }

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

/** Pick the best Garmin activity that has EARNED the claim: among
 *  eligible activities prefer plan-type matches, then highest score.
 *  Returns null when nothing is eligible — the caller decides whether an
 *  already-claimed day still gets enriched. Caller has already filtered
 *  out sub-MIN_ACTIVITY_DURATION_SEC stubs. */
export function findBestGarminMatch(day: PlannedDay, details: GarminActivityDetail[]): GarminActivityDetail | null {
  const eligible = details.filter(d =>
    canClaimPlannedDay(day, d.type, Math.max(d.movingDurationSeconds || 0, d.durationSeconds || 0)),
  )
  if (eligible.length === 0) return null
  if (eligible.length === 1) return eligible[0]

  // Erg-primary day: the erg recording IS the workout (see findBestMatch).
  if (ergPrimaryDay(day)) {
    const ergs = eligible.filter(d => /row|ski|erg/.test(d.type.toLowerCase()))
    if (ergs.length > 0) {
      return ergs.reduce((best, d) => activityScore(d) > activityScore(best) ? d : best)
    }
  }

  const expectedTypes = getExpectedGarminTypes(day.type)
  const matching = eligible.filter(d =>
    expectedTypes.some(t => d.type.toLowerCase().includes(t))
  )
  const pool = matching.length > 0 ? matching : eligible
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

// ─── Apple Watch Activity Merge ────────────────────────────────

/**
 * Attach Apple Watch workouts to planned days that have no actual yet. Runs
 * AFTER Strava/Garmin matching so those richer sources (real EPOC, HR zones,
 * splits) always win; Apple fills the gap for athletes whose only wearable is
 * an Apple Watch.
 */
export function mergeAppleActivitiesIntoWeeks(
  weeks: TrainingWeek[],
  activities: AppleActivity[],
): TrainingWeek[] {
  if (activities.length === 0) return weeks
  const byDate = new Map<string, AppleActivity[]>()
  for (const a of activities) {
    if (a.durationMinutes * 60 < MIN_ACTIVITY_DURATION_SEC) continue
    const existing = byDate.get(a.date) || []
    existing.push(a)
    byDate.set(a.date, existing)
  }
  return weeks.map(week => ({
    ...week,
    days: week.days.map(day => {
      if (day.actual) return day  // Strava/Garmin/manual already populated this day
      const dayDate = dayIsoInWeek(day.day, week)
      if (!dayDate) return day
      const dayActivities = byDate.get(dayDate)
      if (!dayActivities || dayActivities.length === 0) return day
      const best = pickBestApple(day, dayActivities)
      if (!best) {
        return day.secondaryActuals?.length
          ? day
          : { ...day, secondaryActuals: dayActivities.map(a => appleActivityToActual(a)) }
      }
      return { ...day, actual: appleActivityToActual(best) }
    }),
  }))
}

function pickBestApple(day: PlannedDay, activities: AppleActivity[]): AppleActivity | null {
  const eligible = activities.filter(a =>
    canClaimPlannedDay(day, a.type, a.durationMinutes * 60),
  )
  if (eligible.length === 0) return null
  if (eligible.length === 1) return eligible[0]
  // getExpectedStravaTypes' keyword set works for Apple's lowercase types too.
  const expected = getExpectedStravaTypes(day.type)
  const typed = eligible.filter(a => expected.some(t => a.type.toLowerCase().includes(t)))
  const pool = typed.length > 0 ? typed : eligible
  return [...pool].sort((a, b) => b.durationMinutes - a.durationMinutes)[0]
}

function appleActivityToActual(a: AppleActivity): ActualWorkout {
  const sec = Math.round(a.durationMinutes * 60)
  return {
    stravaId: 0,
    source: 'apple',
    distance: a.distanceMi ?? 0,
    movingTime: sec,
    elapsedTime: sec,
    avgHR: a.avgHR,
    maxHR: a.maxHR,
    calories: a.calories,
    elevationGain: a.elevationGainFt,
    type: a.type,
    name: a.name,
    // Apple normalization carries only the local day; noon keeps date math
    // stable (slice(0,10) → the day; new Date() → local noon, not prior-day UTC).
    startDate: `${a.date}T12:00:00`,
  }
}
