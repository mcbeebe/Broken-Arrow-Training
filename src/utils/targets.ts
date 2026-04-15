import type { PlannedDay, PlannedTargets } from '../types'

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
 * Derive all structured targets for a single day.
 */
export function parsePlannedTargets(day: PlannedDay): PlannedTargets {
  const targets: PlannedTargets = {}
  const distance = parseDistance(day.zone)
  if (distance !== undefined) targets.distanceMi = distance
  const hr = parseHRRange(day.zone)
  if (hr) {
    targets.hrLow = hr.low
    targets.hrHigh = hr.high
  }
  const duration = parseDuration(day.time)
  if (duration !== undefined) targets.durationMin = duration
  const elev = parseElevation(day.detail)
  if (elev !== undefined) targets.elevationFt = elev
  return targets
}
