import { describe, it, expect } from 'vitest'
import { computeZoneCompliance, isIntervalSession, type HRStream } from '../utils/timeInZone'

/** Build a 1 Hz HR stream from {hr, seconds} segments. */
function stream(segments: { hr: number; seconds: number }[]): HRStream {
  const time: number[] = []
  const heartrate: number[] = []
  let t = 0
  for (const seg of segments) {
    for (let s = 0; s < seg.seconds; s++) {
      time.push(t)
      heartrate.push(seg.hr)
      t++
    }
  }
  return { time, heartrate }
}

describe('computeZoneCompliance', () => {
  it('credits interval work above the cap and excludes the warm-up', () => {
    // Z3 target 148–167 (band 145–170 with ±3). 15 min easy warm-up at Z1,
    // then 3×5 min hard reps at Z4 (178, above the band) with 2 min easy
    // recoveries between — a classic sharpener.
    const target = { low: 148, high: 167 }
    const c = computeZoneCompliance(
      stream([
        { hr: 120, seconds: 15 * 60 }, // warm-up
        { hr: 178, seconds: 5 * 60 },  // rep 1
        { hr: 120, seconds: 2 * 60 },  // recovery
        { hr: 178, seconds: 5 * 60 },  // rep 2
        { hr: 120, seconds: 2 * 60 },  // recovery
        { hr: 178, seconds: 5 * 60 },  // rep 3
      ]),
      target,
    )

    // Warm-up (≈15 min) is trimmed out of the denominator.
    expect(c.warmupSec).toBeGreaterThanOrEqual(14 * 60)
    expect(c.cooldownSec).toBe(0)
    // The hard reps overshoot the band, so strict in-band % is ~0 — the old
    // math that drove the unfair "29% in zone / D" grade.
    expect(c.inZonePct).toBeLessThan(10)
    // …but crediting time at/above target shows the work got done.
    expect(c.workingPct).toBeGreaterThan(70)
  })

  it('trims warm-up and cool-down on a steady run so in-band % reflects the work', () => {
    // Z2 target 128–148. Easy 10 min start, 40 min steady in band, 5 min
    // easy finish.
    const target = { low: 128, high: 148 }
    const c = computeZoneCompliance(
      stream([
        { hr: 115, seconds: 10 * 60 }, // warm-up (below band)
        { hr: 138, seconds: 40 * 60 }, // steady, in band
        { hr: 110, seconds: 5 * 60 },  // cool-down (below band)
      ]),
      target,
    )

    expect(c.warmupSec).toBeGreaterThanOrEqual(9 * 60)
    expect(c.cooldownSec).toBeGreaterThanOrEqual(4 * 60)
    // After trimming the easy bookends, the steady block is ~100% in zone —
    // whereas the naive whole-session number would be ~73%.
    expect(c.inZonePct).toBeGreaterThan(95)
    expect(c.workingPct).toBeGreaterThan(95)
  })

  it('grades the whole session when HR never reaches the band (all-easy jog)', () => {
    const c = computeZoneCompliance(
      stream([{ hr: 110, seconds: 30 * 60 }]),
      { low: 148, high: 167 },
    )
    expect(c.warmupSec).toBe(0)
    expect(c.cooldownSec).toBe(0)
    expect(c.inZonePct).toBe(0)
    expect(c.trimmedSec).toBeGreaterThan(0)
  })

  it('returns empty for missing or malformed streams', () => {
    expect(computeZoneCompliance(null, { low: 148, high: 167 }).trimmedSec).toBe(0)
    expect(computeZoneCompliance({ time: [0], heartrate: [150] }, { low: 148, high: 167 }).trimmedSec).toBe(0)
  })
})

describe('isIntervalSession', () => {
  it('treats quality days and rep-structured details as intervals', () => {
    expect(isIntervalSession('quality')).toBe(true)
    expect(isIntervalSession('run', '3×5 min @ Z3')).toBe(true)
    expect(isIntervalSession('run', '4x90 sec uphill')).toBe(true)
  })

  it('treats steady runs as non-interval', () => {
    expect(isIntervalSession('run', '5 mi easy Z2')).toBe(false)
    expect(isIntervalSession('long', '90 min Z2')).toBe(false)
  })
})
