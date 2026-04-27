// PLAN-vs-CODE drift (PR-04, BA_Terrain_Descent_IT_Project_Plan_v1.0.md §PR-04):
//
// 1. Plan's example signature `computeWholeActivityGAP(activity: StravaActivity)`
//    references fields (`altitudeStream`, `distanceStream`, `totalSeconds`,
//    `totalDistance`) that do not exist on `StravaActivity` (Strava streams
//    are returned via a separate `StreamData` type). We use a pure function
//    on minimal inputs `{ altitude, distance, totalSeconds }` so callers
//    (Strava, Garmin) wire the adapter once.
// 2. Plan returns one number ("equivalent total time" via
//    `totalSeconds × (totalDistance / totalEqDist)`). AC1 asserts equivalent
//    flat distance AND a pace test asserts s/km — needs both. We return
//    `{ equivalentFlatDistanceM, gapSecondsPerKm }`.
// 3. Plan's pure-descent test ("GAP about 0.6× of raw pace") is mathematically
//    inverted: at -10% grade, runMult≈0.598, so on a pure descent GAP is
//    SLOWER than raw pace by ~1/0.598 ≈ 1.67×, not faster. We assert the
//    correct ratio (~1.67×).

import { describe, it, expect } from 'vitest'

import {
  computeWholeActivityGAP,
  type GAPInput,
} from '../../../engines/terrain/locomotion/gap'
import { savitzkyGolay } from '../../../engines/terrain/locomotion/smoothing'

interface Segment {
  label: string
  distanceM: number
  grade: number // signed decimal (e.g. 0.05 = +5%)
}

// docs/research/Hill_Running_Load_Multipliers_v1.0.xlsx → "Calculator" sheet,
// the 10 BA Skyrace 23K segments documented in spec §8.5.
const BA_SKYRACE_SEGMENTS: readonly Segment[] = [
  { label: 'Valley start to KT-22 base', distanceM: 2000, grade: 0.05 },
  { label: 'KT-22 climb', distanceM: 2500, grade: 0.22 },
  { label: 'KT-22 descent', distanceM: 1000, grade: -0.18 },
  { label: 'Stairway approach', distanceM: 1500, grade: 0.15 },
  { label: 'Stairway to Heaven ladder', distanceM: 300, grade: 0.4 },
  { label: 'Headwall traverse', distanceM: 1000, grade: 0.05 },
  { label: 'Granite Chief descent', distanceM: 2500, grade: -0.2 },
  { label: 'Mid-course rolling', distanceM: 4000, grade: 0.03 },
  { label: 'Final climb', distanceM: 3000, grade: 0.12 },
  { label: 'Final descent to village', distanceM: 3900, grade: -0.15 },
] as const

function buildStream(
  segments: readonly Segment[],
  samplesPerKm: number,
): { altitude: number[]; distance: number[] } {
  const altitude: number[] = [0]
  const distance: number[] = [0]
  for (const seg of segments) {
    const samples = Math.max(1, Math.round((seg.distanceM / 1000) * samplesPerKm))
    const dD = seg.distanceM / samples
    for (let i = 0; i < samples; i++) {
      distance.push(distance[distance.length - 1] + dD)
      altitude.push(altitude[altitude.length - 1] + dD * seg.grade)
    }
  }
  return { altitude, distance }
}

describe('computeWholeActivityGAP (PR-04)', () => {
  describe('AC1: BA Skyrace 23K worked example', () => {
    const totalSeconds = 9000 // 2:30:00
    // 1000 samples/km → ~1 m spacing. Real Strava 1 Hz streams at ~2-3 m/s
    // pace land near 400 samples/km; at 1 m we keep the SG smoothing zone at
    // segment transitions (~15 m) below the AC1 ±0.05 km tolerance.
    const stream = buildStream(BA_SKYRACE_SEGMENTS, 1000)
    const input: GAPInput = { ...stream, totalSeconds }
    const result = computeWholeActivityGAP(input)

    it('equivalent flat distance is 28.99 ± 0.05 km', () => {
      expect(result.equivalentFlatDistanceM / 1000).toBeGreaterThan(28.94)
      expect(result.equivalentFlatDistanceM / 1000).toBeLessThan(29.04)
    })

    it('GAP for a 2:30 effort is 5:09 ± 0:02 / km', () => {
      expect(result.gapSecondsPerKm).toBeGreaterThan(307)
      expect(result.gapSecondsPerKm).toBeLessThan(311)
    })
  })

  describe('AC2: flat 10 km activity', () => {
    const stream = buildStream([{ label: 'flat', distanceM: 10000, grade: 0 }], 100)
    const totalSeconds = 3000 // 50:00 = 5:00/km
    const result = computeWholeActivityGAP({ ...stream, totalSeconds })

    it('equivalent flat distance equals real distance', () => {
      expect(result.equivalentFlatDistanceM).toBeCloseTo(10000, -1)
    })

    it('GAP equals raw pace within 0.5%', () => {
      const rawPace = totalSeconds / 10 // s/km
      expect(Math.abs(result.gapSecondsPerKm - rawPace) / rawPace).toBeLessThan(0.005)
    })
  })

  describe('pure +10% climb (200 m gain over 2 km)', () => {
    const stream = buildStream([{ label: 'climb', distanceM: 2000, grade: 0.1 }], 200)
    const totalSeconds = 1200 // 20:00 over 2 km = 10:00/km raw
    const result = computeWholeActivityGAP({ ...stream, totalSeconds })

    it('GAP is roughly 1.66× faster than raw pace (raw / GAP ≈ 1.66)', () => {
      const rawPace = totalSeconds / 2 // s/km
      const ratio = rawPace / result.gapSecondsPerKm
      expect(ratio).toBeGreaterThan(1.6)
      expect(ratio).toBeLessThan(1.7)
    })
  })

  describe('pure -10% descent (200 m loss over 2 km, optimal grade)', () => {
    const stream = buildStream([{ label: 'descent', distanceM: 2000, grade: -0.1 }], 200)
    const totalSeconds = 600 // 10:00 over 2 km = 5:00/km raw
    const result = computeWholeActivityGAP({ ...stream, totalSeconds })

    it('GAP is ~1.67× SLOWER than raw pace (GAP / raw ≈ 1/runMult(-0.10) ≈ 1.673)', () => {
      const rawPace = totalSeconds / 2 // s/km
      const ratio = result.gapSecondsPerKm / rawPace
      expect(ratio).toBeGreaterThan(1.6)
      expect(ratio).toBeLessThan(1.75)
    })
  })

  describe('AC3: defensive contracts', () => {
    it('throws a typed error when altitude.length !== distance.length', () => {
      const bad: GAPInput = { altitude: [0, 1, 2], distance: [0, 10], totalSeconds: 60 }
      expect(() => computeWholeActivityGAP(bad)).toThrow(/length/i)
    })

    it('throws when streams have fewer than 2 samples', () => {
      const bad: GAPInput = { altitude: [0], distance: [0], totalSeconds: 60 }
      expect(() => computeWholeActivityGAP(bad)).toThrow()
    })

    it('throws when totalSeconds is zero or negative', () => {
      const stream = buildStream([{ label: 'flat', distanceM: 1000, grade: 0 }], 50)
      expect(() => computeWholeActivityGAP({ ...stream, totalSeconds: 0 })).toThrow()
    })
  })
})

describe('savitzkyGolay (PR-04 helper)', () => {
  it('passes a constant signal through unchanged', () => {
    const input = Array(50).fill(7)
    const out = savitzkyGolay(input, 15, 3)
    for (const v of out) expect(v).toBeCloseTo(7, 8)
  })

  it('reproduces a linear ramp exactly within the polynomial domain (order ≥ 1)', () => {
    const input = Array.from({ length: 50 }, (_, i) => 2 * i + 3)
    const out = savitzkyGolay(input, 15, 3)
    for (let i = 0; i < input.length; i++) {
      expect(out[i]).toBeCloseTo(input[i], 6)
    }
  })

  it('reproduces a cubic exactly (since order = 3)', () => {
    const input = Array.from({ length: 50 }, (_, i) => i ** 3 - 4 * i ** 2 + 2)
    const out = savitzkyGolay(input, 15, 3)
    for (let i = 7; i < input.length - 7; i++) {
      expect(out[i]).toBeCloseTo(input[i], 4)
    }
  })

  it('rejects even windows', () => {
    expect(() => savitzkyGolay([1, 2, 3], 14, 3)).toThrow()
  })

  it('rejects window ≤ order', () => {
    expect(() => savitzkyGolay([1, 2, 3, 4, 5], 5, 5)).toThrow()
  })
})
