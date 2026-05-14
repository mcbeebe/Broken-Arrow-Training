import type { HRZone, PlannedDay, TrainingWeek } from '../types'
import { parseZoneRange } from './zones'

// ─── Settings → text rewrite ──────────────────────────────────────
//
// Plan data (and the plan-generator output) bakes the athlete's HR
// bpm bounds into free-text strings — e.g. `zone: 'Z1–2 (108–148)'` and
// `detail: 'Stay below AeT (130)'`. When the athlete changes their Max
// HR or zone bands in Settings, those baked strings become stale and
// disagree with the Settings → HRZones tab → coach snapshot → grader.
//
// The transform below rewrites the parenthesized bpm numbers in
// `day.zone` and `day.detail` against the user's current zones so a
// single Settings change cascades to every display surface and to the
// compliance grader that reads `day.zone`.

export interface NumericZone {
  num: number
  low: number
  high: number
}

/** Pre-parsed numeric form of the user's current zones, sorted by zone#. */
export function toNumericZones(zones: HRZone[]): NumericZone[] {
  const out: NumericZone[] = []
  for (const z of zones) {
    const m = z.zone.match(/Z\s*(\d)/i)
    if (!m) continue
    const r = parseZoneRange(z.hr)
    if (!r) continue
    out.push({ num: parseInt(m[1], 10), low: r.low, high: r.high })
  }
  out.sort((a, b) => a.num - b.num)
  return out
}

function bandFor(lowZ: number, highZ: number, nz: NumericZone[]): { low: number; high: number } | null {
  const lo = nz.find(z => z.num === lowZ)
  const hi = nz.find(z => z.num === highZ)
  if (!lo || !hi) return null
  return { low: lo.low, high: hi.high }
}

/**
 * Rewrite the parenthesized bpm range in a zone string to match the
 * user's current zones. Handles all known plan formats:
 *
 *   "Z1 (108–128)"                 → "Z1 (<z1lo>–<z1hi>)"
 *   "3.0 mi · Z1–2 (108–148)"      → "3.0 mi · Z1–2 (<z1lo>–<z2hi>)"
 *   "3.5 mi · Z3 intervals (148–167)" → "3.5 mi · Z3 intervals (<z3lo>–<z3hi>)"
 *
 * Returns the original string when the zone label can't be resolved
 * against the supplied zones (e.g. plan refers to Z5 but the athlete
 * only configured 4 zones).
 */
export function rezoneZoneString(zoneStr: string, nz: NumericZone[]): string {
  if (!zoneStr || zoneStr === '—' || nz.length === 0) return zoneStr
  // Capture a Z-label (with an optional second zone number, optional
  // descriptor like "intervals") followed by an immediately-adjacent
  // parenthesized bpm range. Whitespace between the label and the
  // parens is preserved so the formatted output reads identically.
  const re = /(Z(\d))((?:\s*[–-]\s*Z?(\d))?(?:\s+[A-Za-z]+)?)(\s*)\(\d+\s*[–-]\s*\d+\)/g
  return zoneStr.replace(re, (match, _zLabel, lowDigit, tail, highDigit, gap) => {
    const lowZ = parseInt(lowDigit, 10)
    const highZ = highDigit ? parseInt(highDigit, 10) : lowZ
    const band = bandFor(lowZ, highZ, nz)
    if (!band) return match
    return `Z${lowZ}${tail}${gap}(${band.low}–${band.high})`
  })
}

/**
 * Rewrite threshold-anchored bpm refs inside a detail string against
 * the user's current zones. AeT (aerobic threshold) is the top of Z2;
 * AnT / LTHR (anaerobic / lactate threshold) is the top of Z3.
 *
 *   "Stay below AeT (130)"  → "Stay below AeT (<top of Z2>)"
 *   "4×5 min at AnT HR (145)" → "4×5 min at AnT HR (<top of Z3>)"
 *
 * Leaves AeT/AnT/LTHR references without a parenthesized bpm alone.
 */
export function rezoneDetailString(detail: string, nz: NumericZone[]): string {
  if (!detail || nz.length === 0) return detail
  const z2 = nz.find(z => z.num === 2)
  const z3 = nz.find(z => z.num === 3)
  let out = detail
  if (z2) {
    out = out.replace(/\bAeT(\s+HR)?(\s*)\(\d+\)/g, (_m, hr, gap) => {
      return `AeT${hr ?? ''}${gap}(${z2.high})`
    })
  }
  if (z3) {
    out = out.replace(/\b(AnT|LTHR)(\s+HR)?(\s*)\(\d+\)/g, (_m, label, hr, gap) => {
      return `${label}${hr ?? ''}${gap}(${z3.high})`
    })
  }
  return out
}

/** Returns a copy of the day with HR strings rewritten to current zones. */
export function rezonePlannedDay(day: PlannedDay, nz: NumericZone[]): PlannedDay {
  if (nz.length === 0) return day
  const nextZone = rezoneZoneString(day.zone, nz)
  const nextDetail = rezoneDetailString(day.detail, nz)
  if (nextZone === day.zone && nextDetail === day.detail) return day
  return { ...day, zone: nextZone, detail: nextDetail }
}

/** Apply rezone across every day in a weeks array. No-op when zones is empty. */
export function rezoneWeeks(weeks: TrainingWeek[], zones: HRZone[]): TrainingWeek[] {
  const nz = toNumericZones(zones)
  if (nz.length === 0) return weeks
  return weeks.map(w => ({
    ...w,
    days: w.days.map(d => rezonePlannedDay(d, nz)),
  }))
}
