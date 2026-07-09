/**
 * R2 — fueling prescription. Carbohydrate targets scale with race duration
 * (fact-checked, v1.3): under ~90 min needs no per-hour fueling; longer efforts
 * ramp toward ~90 g/hr via multiple-transportable carbs (200–300 cal/hr ≈
 * 50–75 g/hr; up to ~90 for long ultras). The long run is the fueling-practice
 * session; a long run 4–6 weeks out is flagged as the race-nutrition rehearsal.
 */
import type { PlannedDay } from '../types'

function appendDetail(detail: string, add: string): string { return detail ? `${detail} · ${add}` : add }

/**
 * Per-hour carbohydrate target (grams) by race distance in miles. 0 for races
 * under ~90 min (5K/10K), ramping to a 90 g/hr cap for 50-mile-plus efforts.
 */
export function carbTargetForRaceMiles(miles: number): number {
  if (miles < 13) return 0   // 5K / 10K — under ~90 min, fuel afterward
  if (miles < 26) return 45  // half marathon
  if (miles < 31) return 60  // marathon
  if (miles < 50) return 75  // 50K
  return 90                  // 50 mile and up (multiple-transportable ceiling)
}

/** True for the long runs 4–6 weeks out — the race-nutrition dress rehearsal. */
export function isFuelingRehearsalWeek(weeksToRace: number): boolean {
  return weeksToRace >= 4 && weeksToRace <= 6
}

/** Per-hour fueling only makes sense on runs long enough to need it — the
 *  module's own doctrine says under ~90 min needs none. Gate at 75 min so
 *  runs approaching the line still practice the habit. */
const MIN_FUELED_RUN_MINUTES = 75

/** Estimated duration in minutes of a plan day, from its `time` string
 *  ("45-52 min" / "1 hr 10 min" / "~90 min" → midpoint/total), else from a
 *  mileage estimate at easy pace. Null when neither is available. */
export function estimateRunMinutes(day: Pick<PlannedDay, 'time'>, fallbackMiles?: number, easyPaceMinPerMile = 11): number | null {
  const time = day.time || ''
  const hrMatch = time.match(/(\d+(?:\.\d+)?)\s*hr/)
  const minMatches = time.match(/(\d+)(?:\s*[-–]\s*(\d+))?\s*min/)
  if (hrMatch || minMatches) {
    const hrs = hrMatch ? parseFloat(hrMatch[1]) * 60 : 0
    const lo = minMatches ? parseInt(minMatches[1], 10) : 0
    const hi = minMatches?.[2] ? parseInt(minMatches[2], 10) : lo
    return hrs + (lo + hi) / 2
  }
  if (fallbackMiles && fallbackMiles > 0) return fallbackMiles * easyPaceMinPerMile
  return null
}

/**
 * Append the carb target (and the rehearsal flag in the 4–6-week window) to the
 * long-run days of one week. Short races (target 0) are returned unchanged —
 * and so is any individual long run too short to need per-hour fueling (a
 * 4-mile early-build "long" run got carb-per-hour advice in the field; the
 * gate is on the RUN, not just the race).
 */
export function applyFuelingToWeek(
  days: PlannedDay[],
  raceMiles: number,
  weeksToRace: number,
  opts: { longRunMi?: number; easyPaceMinPerMile?: number } = {},
): PlannedDay[] {
  const g = carbTargetForRaceMiles(raceMiles)
  if (g <= 0) return days
  const rehearsal = isFuelingRehearsalWeek(weeksToRace)
  return days.map(d => {
    if (d.type !== 'long') return d
    const minutes = estimateRunMinutes(d, opts.longRunMi, opts.easyPaceMinPerMile)
    // No duration signal at all → skip: better to omit advice than to
    // stamp a possibly 40-minute run with hourly fueling.
    if (minutes === null || minutes < MIN_FUELED_RUN_MINUTES) return d
    return { ...d, detail: appendDetail(d.detail, `Fuel ~${g} g carb/hr${rehearsal ? ' (practice race nutrition)' : ''}`) }
  })
}

/**
 * One-line fueling guidance for the coach surface (drink-to-thirst, no fixed
 * hourly volume, per the fact-checked iRunFar stance). Null for short races.
 */
export function fuelingSummaryLine(raceMiles: number): string | null {
  const g = carbTargetForRaceMiles(raceMiles)
  if (g <= 0) return null
  return `aim for ~${g} g carbohydrate/hour on long efforts (multiple-transportable carbs, gut-trained 4–6 weeks out), drink to thirst, and consider caffeine 3–6 mg/kg`
}
