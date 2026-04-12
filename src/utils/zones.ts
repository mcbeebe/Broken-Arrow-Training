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
