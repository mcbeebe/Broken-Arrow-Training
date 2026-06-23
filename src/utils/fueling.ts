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

/**
 * Append the carb target (and the rehearsal flag in the 4–6-week window) to the
 * long-run days of one week. Short races (target 0) are returned unchanged.
 */
export function applyFuelingToWeek(days: PlannedDay[], raceMiles: number, weeksToRace: number): PlannedDay[] {
  const g = carbTargetForRaceMiles(raceMiles)
  if (g <= 0) return days
  const rehearsal = isFuelingRehearsalWeek(weeksToRace)
  return days.map(d => d.type === 'long'
    ? { ...d, detail: appendDetail(d.detail, `Fuel ~${g} g carb/hr${rehearsal ? ' (practice race nutrition)' : ''}`) }
    : d)
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
