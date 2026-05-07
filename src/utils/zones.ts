import type { HRZone, SportType } from '../types'

export const HR_ZONE_TOLERANCE_BPM = 3

// Plan HR zones are calibrated to running. At equivalent perceived effort,
// steady-state HR is lower in sports that engage less muscle mass or support
// body weight (saddle, water). Joe Friel's rule of thumb: cycling LTHR ≈
// running LTHR − 10 bpm; swimming runs even lower due to horizontal posture
// and water cooling. We shift the workout's target HR band by this offset
// when the actual sport differs from running, so a Z4 bike interval isn't
// graded against a target band the rider physiologically can't reach.
const SPORT_HR_OFFSET_BPM: Partial<Record<SportType, number>> = {
  cycling: 10,
  ebike: 10,
  mountain_biking: 10,
  rowing: 5,
  indoor_rowing: 5,
  elliptical: 5,
  swimming: 12,
  lap_swimming: 12,
  aqua_jogging: 12,
}

export function getSportHRZoneOffset(sportType?: SportType | string): number {
  if (!sportType) return 0
  return SPORT_HR_OFFSET_BPM[sportType as SportType] ?? 0
}

/**
 * Shift the parenthesized HR range in a plan zone string downward by the
 * sport-specific offset. Returns the input unchanged when no offset applies
 * or no parenthesized range is present.
 *
 *   adjustZoneStringForSport('4.0 mi · Z4 (167–177)', 'cycling')
 *     → '4.0 mi · Z4 (157–167)'
 */
export function adjustZoneStringForSport(zoneString: string, sportType?: SportType | string): string {
  const offset = getSportHRZoneOffset(sportType)
  if (offset === 0 || !zoneString) return zoneString
  return zoneString.replace(/\((\d+)(\s*[–-]\s*)(\d+)\)/, (_, low, sep, high) => {
    return `(${parseInt(low, 10) - offset}${sep}${parseInt(high, 10) - offset})`
  })
}

/**
 * Replace the parenthesized HR range in a plan zone string with an explicit
 * range. Used when we've resolved the actual target band (from user zones
 * and/or sport offsets) and want the display string to match what the
 * grader is using.
 */
export function replaceZoneStringHR(zoneString: string, low: number, high: number): string {
  if (!zoneString) return zoneString
  if (zoneString.match(/\(\d+\s*[–-]\s*\d+\)/)) {
    return zoneString.replace(/\(\d+(\s*[–-]\s*)\d+\)/, (_, sep) => `(${low}${sep}${high})`)
  }
  // No existing range — append one so HRChart / ZoneBreakdownTable can parse it.
  return `${zoneString} (${low}–${high})`
}

/**
 * Extract zone numbers from a plan zone string label.
 *   "4.0 mi · Z4 bounds (167–177)"  → [4]
 *   "3.0 mi · Z1–2 (108–148)"       → [1, 2]
 *   "Z3–4 (148–177)"                → [3, 4]
 *   "Easy spin"                     → []
 */
export function parsePlanZoneLabels(zoneString: string): number[] {
  if (!zoneString) return []
  const multi = zoneString.match(/Z(\d)\s*[–-]\s*(\d)/i)
  if (multi) {
    const lo = parseInt(multi[1], 10)
    const hi = parseInt(multi[2], 10)
    if (lo <= hi) {
      const out: number[] = []
      for (let i = lo; i <= hi; i++) out.push(i)
      return out
    }
  }
  const single = zoneString.match(/Z(\d)\b/i)
  if (single) return [parseInt(single[1], 10)]
  return []
}

/**
 * Resolve the HR target range for a plan day's zone string, preferring the
 * athlete's customized HR zones when available.
 *
 * Plan zone strings embed both a zone label ("Z4") and a hardcoded HR range
 * computed from the plan's default maxHR. When the athlete has customized
 * their zones (e.g. set maxHR=200), the label still applies but the
 * parenthetical numbers are stale — look the label up in the user's zones
 * and use that range instead. Falls back to the parenthetical range when
 * no label/user-zone match is found.
 */
export function resolveTargetHRFromPlanZone(
  zoneString: string,
  userZones?: HRZone[],
): { low: number; high: number } | undefined {
  if (!zoneString || zoneString === '—') return undefined
  if (userZones && userZones.length > 0) {
    const labels = parsePlanZoneLabels(zoneString)
    if (labels.length > 0) {
      const ranges: { low: number; high: number }[] = []
      for (const num of labels) {
        const range = lookupUserZoneRange(userZones, num)
        if (range) ranges.push(range)
      }
      if (ranges.length > 0) {
        return {
          low: Math.min(...ranges.map(r => r.low)),
          high: Math.max(...ranges.map(r => r.high)),
        }
      }
    }
  }
  const m = zoneString.match(/\((\d+)\s*[–-]\s*(\d+)\)/)
  if (!m) return undefined
  return { low: parseInt(m[1], 10), high: parseInt(m[2], 10) }
}

function lookupUserZoneRange(userZones: HRZone[], zoneNum: number): { low: number; high: number } | null {
  const zone = userZones.find(z => {
    const m = z.zone.match(/Z(\d)/i)
    return m && parseInt(m[1], 10) === zoneNum
  })
  if (!zone) return null
  return parseZoneRange(zone.hr)
}

export function getZoneForHR(hr: number, zones: HRZone[]): HRZone | null {
  for (const zone of zones) {
    const match = zone.hr.match(/(\d+)\s*[–-]\s*(\d+)/)
    if (match) {
      const low = parseInt(match[1], 10)
      const high = parseInt(match[2], 10)
      if (hr >= low && hr <= high) return zone
    }
  }
  return null
}

export function parseZoneRange(hrString: string): { low: number; high: number } | null {
  // Prefer the HR range inside parentheses: "(108–148)" — that's always
  // the actual HR target. Previous naive match grabbed "Z1–2" first and
  // returned {low: 1, high: 2}, which made every grade say 0% in zone.
  const parenMatch = hrString.match(/\((\d+)\s*[–-]\s*(\d+)\)/)
  if (parenMatch) {
    return { low: parseInt(parenMatch[1], 10), high: parseInt(parenMatch[2], 10) }
  }
  // Fallback: scan all digit-dash-digit pairs and pick the first with
  // plausible HR values (60-220 bpm).
  const allMatches = Array.from(hrString.matchAll(/(\d+)\s*[–-]\s*(\d+)/g))
  for (const m of allMatches) {
    const low = parseInt(m[1], 10)
    const high = parseInt(m[2], 10)
    if (low >= 60 && high <= 220 && low < high) {
      return { low, high }
    }
  }
  return null
}

export function isInTargetZone(avgHR: number, targetLow: number, targetHigh: number): boolean {
  return avgHR >= targetLow && avgHR <= targetHigh
}

// ─── Plan-zone helpers ──────────────────────────────────────────

export interface PlanZone {
  zone: number       // 1..5
  low: number        // inclusive
  high: number       // inclusive
}

/**
 * Parse plan zones into numeric bands. Appends an implicit Z5 that spans
 * from top-of-Z4 to maxHR when the plan defines only 4 zones.
 */
export function parsePlanZones(zones: HRZone[], maxHR?: number): PlanZone[] {
  const out: PlanZone[] = []
  for (const z of zones) {
    const m = z.zone.match(/Z(\d)/i)
    if (!m) continue
    const zoneNum = parseInt(m[1], 10)
    const range = parseZoneRange(z.hr)
    if (range) out.push({ zone: zoneNum, low: range.low, high: range.high })
  }
  out.sort((a, b) => a.zone - b.zone)
  if (out.length > 0 && maxHR !== undefined) {
    const top = out[out.length - 1]
    if (top.zone < 5 && maxHR > top.high) {
      out.push({ zone: top.zone + 1, low: top.high + 1, high: maxHR })
    }
  }
  return out
}

/**
 * Re-bucket a device-reported zone-time summary into the athlete's plan
 * zones via proportional HR-range overlap.
 *
 *   Garmin Z3=130-149 (540s) vs plan Z2=128-148, plan Z3=148-167:
 *     → plan Z2 gets 540 × 19/20 = 513s, plan Z3 gets 540 × 2/20 = 54s
 */
export function rebucketToPlanZones(
  summary: { zone: number; seconds: number; lowHR?: number; highHR?: number }[],
  planZones: PlanZone[],
): { zone: number; seconds: number; low: number; high: number }[] {
  const result = planZones.map(pz => ({ zone: pz.zone, seconds: 0, low: pz.low, high: pz.high }))
  if (summary.length === 0 || planZones.length === 0) return result

  const sorted = [...summary].sort((a, b) => (a.lowHR ?? 0) - (b.lowHR ?? 0))
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]
    if (s.lowHR === undefined) {
      // No boundary info — match by zone number directly
      const bucket = result.find(r => r.zone === s.zone)
      if (bucket) bucket.seconds += s.seconds
      continue
    }
    const high = s.highHR ?? (sorted[i + 1]?.lowHR !== undefined ? sorted[i + 1].lowHR! - 1 : s.lowHR + 20)
    const span = Math.max(1, high - s.lowHR + 1)
    for (const pz of result) {
      const overlapLow = Math.max(s.lowHR, pz.low)
      const overlapHigh = Math.min(high, pz.high)
      if (overlapHigh >= overlapLow) {
        const overlap = overlapHigh - overlapLow + 1
        pz.seconds += s.seconds * (overlap / span)
      }
    }
  }
  return result
}
