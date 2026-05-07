import type { PlannedDay, PlannedTargets, SportType } from '../types'
import { getPlannedDrills } from './drills'
import { getSportHRZoneOffset } from './zones'

// ─── Target Parser ──────────────────────────────────────────────
// Derives structured numeric targets (distance/duration/HR range/elevation)
// from the existing free-text fields on PlannedDay (zone, detail, time).
// This preserves the plan authoring format (strings) while giving the
// compliance engine real numbers to compare against.

/**
 * Parse distance in miles from a zone string.
 * Matches patterns like:
 *   "3.0 mi · Z1–2 (108–148)"   → 3.0
 *   "3.5 mi · Z3 intervals (...)" → 3.5
 *   "Z1 (108–128)"               → undefined (strength/cross, no distance)
 */
export function parseDistance(zone: string): number | undefined {
  if (!zone || zone === '—') return undefined
  const m = zone.match(/(\d+(?:\.\d+)?)\s*mi\b/i)
  return m ? parseFloat(m[1]) : undefined
}

/**
 * Parse HR range from a zone string.
 * Matches "(108–148)" or "(108-148)" anywhere in the string.
 */
export function parseHRRange(zone: string): { low: number; high: number } | undefined {
  if (!zone || zone === '—') return undefined
  const m = zone.match(/\((\d+)\s*[–-]\s*(\d+)\)/)
  if (!m) return undefined
  return { low: parseInt(m[1], 10), high: parseInt(m[2], 10) }
}

/**
 * Parse duration in minutes from a time string.
 * Matches:
 *   "45 min"          → 45
 *   "1 hr"            → 60
 *   "1 hr 10 min"     → 70
 *   "1 hr 30 min"     → 90
 *   "2 hr 15 min"     → 135
 *   "1 hr+"           → 60 (conservative: lower bound)
 *   "—" | ""          → undefined
 */
export function parseDuration(time: string): number | undefined {
  if (!time || time === '—') return undefined
  let total = 0
  const hrMatch = time.match(/(\d+)\s*hr/i)
  if (hrMatch) total += parseInt(hrMatch[1], 10) * 60
  const minMatch = time.match(/(\d+)\s*min/i)
  if (minMatch) total += parseInt(minMatch[1], 10)
  return total > 0 ? total : undefined
}

/**
 * Parse elevation gain in feet from a detail string.
 * Matches "~760 ft gain", "~2,000 ft gain", "1528 ft gain", etc.
 */
export function parseElevation(detail: string): number | undefined {
  if (!detail) return undefined
  const m = detail.match(/([\d,]+)\s*(?:\+\s*)?ft/i)
  if (!m) return undefined
  const val = parseInt(m[1].replace(/,/g, ''), 10)
  return isNaN(val) ? undefined : val
}

/**
 * Estimate running-time range for a run day (low, high in minutes) based
 * on planned distance and effort zone. Mirrors utils/format.estimateRunTime
 * but returns structured numbers. Used so run duration grading ignores
 * drill/warmup time that isn't captured by the GPS watch.
 */
export function estimateRunTimeRange(
  zoneStr: string,
  type?: string,
): { low: number; high: number } | undefined {
  const mi = parseDistance(zoneStr)
  if (mi === undefined || mi === 0) return undefined
  const isHilly = zoneStr.includes('Z3') || zoneStr.includes('Z4')
  // Long-run terrain tends to be slower/hillier
  const isLong = type === 'long'
  const lowPace = isHilly || isLong ? 12.0 : 10.5
  const highPace = isHilly || isLong ? 14.0 : 12.5
  return { low: Math.round(mi * lowPace), high: Math.round(mi * highPace) }
}

const RUN_TYPES_FOR_RANGE = new Set(['run', 'long', 'quality', 'race'])

/**
 * Derive all structured targets for a single day.
 *
 * `actualSportType` lets the grader shift the HR target band when the
 * athlete completed the workout in a non-running sport (e.g. swapped a
 * run for an indoor bike session). Plan HR zones are calibrated to
 * running; cycling/swimming/etc. have lower steady-state HR at the same
 * effort, so we apply a sport-specific offset.
 */
export function parsePlannedTargets(day: PlannedDay, actualSportType?: SportType): PlannedTargets {
  const targets: PlannedTargets = {}
  const distance = parseDistance(day.zone)
  if (distance !== undefined) targets.distanceMi = distance
  const hr = parseHRRange(day.zone)
  if (hr) {
    const offset = getSportHRZoneOffset(actualSportType)
    targets.hrLow = hr.low - offset
    targets.hrHigh = hr.high - offset
  }
  const duration = parseDuration(day.time)
  if (duration !== undefined) targets.durationMin = duration
  // For run days, prefer the estimated running-time range — the plan's
  // `time` field often includes warmup/drills/cooldown that don't show up
  // on the GPS watch, so grading against total plan time unfairly misses.
  if (RUN_TYPES_FOR_RANGE.has(day.type) && distance !== undefined) {
    const range = estimateRunTimeRange(day.zone, day.type)
    if (range) {
      targets.durationMinLow = range.low
      targets.durationMinHigh = range.high
    }
  }
  const elev = parseElevation(day.detail)
  if (elev !== undefined) targets.elevationFt = elev
  const drills = getPlannedDrills(day)
  if (drills.length > 0) targets.drillItems = drills
  return targets
}
