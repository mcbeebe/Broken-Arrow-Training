import type { HRZone } from '../types'

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
  const match = hrString.match(/(\d+)\s*[–-]\s*(\d+)/)
  if (!match) return null
  return { low: parseInt(match[1], 10), high: parseInt(match[2], 10) }
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
