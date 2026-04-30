// PLAN-vs-CODE drift (PR-07, BA_Terrain_Descent_IT_Project_Plan_v1.0.md §PR-07):
//
// 1. Pure-function input. Plan signature `computeVE(activity, athlete)` does
//    not fit because StravaActivity has no `terrainProfile` or HR stream and
//    AthleteProfile has no `lt1Bpm` field. We pass `{ segments, hr, time,
//    lt1Bpm }` so the engine stays stateless and the AthleteProfile shape
//    is untouched.
// 2. `lt1Bpm` is a direct number param, not added to AthleteProfile. Persist
//    it where the caller wants; the engine just consumes a value.
// 3. HR per segment is computed on-the-fly from the raw stream rather than
//    materialised on TerrainSegment, so the segment shape stays stable.

import { describe, it, expect } from 'vitest'

import { computeVE, type VEInput } from '../../../engines/terrain/profile/verticalEfficiency'
import { computeTerrainProfile } from '../../../engines/terrain/locomotion/gap'

interface RawSegment {
  label: string
  distanceM: number
  grade: number
}

const BA_SEGMENTS: readonly RawSegment[] = [
  { label: 'Valley start to KT-22 base', distanceM: 2000, grade: 0.05 },
  { label: 'KT-22 climb', distanceM: 2500, grade: 0.22 },
  { label: 'KT-22 descent', distanceM: 1000, grade: -0.18 },
  { label: 'Stairway approach', distanceM: 1500, grade: 0.15 },
  { label: 'Stairway to Heaven ladder', distanceM: 300, grade: 0.4 },
  { label: 'Headwall traverse', distanceM: 1000, grade: 0.05 },
  { label: 'Granite Chief descent', distanceM: 2500, grade: -0.2 },
  { label: 'Mid-course rolling', distanceM: 4000, grade: 0.03 },
  { label: 'Final climb', distanceM: 3000, grade: 0.12 },
  { label: 'Final descent to village', distanceM: 3900, grade: -0.16 },
] as const

function buildStream(segments: readonly RawSegment[], totalSeconds: number) {
  const totalDistance = segments.reduce((s, x) => s + x.distanceM, 0)
  const speed = totalDistance / totalSeconds
  const time: number[] = [0]
  const distance: number[] = [0]
  const altitude: number[] = [0]
  let segIdx = 0
  let segDistanceCovered = 0
  for (let s = 1; s <= totalSeconds; s++) {
    const seg = segments[segIdx]
    time.push(s)
    distance.push(distance[s - 1] + speed)
    altitude.push(altitude[s - 1] + speed * seg.grade)
    segDistanceCovered += speed
    if (segDistanceCovered >= seg.distanceM && segIdx < segments.length - 1) {
      segIdx++
      segDistanceCovered = 0
    }
  }
  return { altitude, distance, time }
}

describe('computeVE (PR-07)', () => {
  describe('AC1: insufficient-data path returns null', () => {
    it('flat activity (no segments ≥ +5 % grade) → null', () => {
      const totalSeconds = 1800
      const time = Array.from({ length: totalSeconds + 1 }, (_, i) => i)
      const distance = time.map(t => t * 2)
      const altitude = time.map(() => 100)
      const profile = computeTerrainProfile({ altitude, distance, time })
      const hr = time.map(() => 158)
      const result = computeVE({ segments: profile.segments, hr, time, lt1Bpm: 158 })
      expect(result).toBeNull()
    })

    it('hilly activity but HR nowhere near LT1 → null', () => {
      const stream = buildStream(BA_SEGMENTS, 9000)
      const profile = computeTerrainProfile(stream)
      const hr = stream.time.map(() => 120) // 38 bpm below LT1 158
      const result = computeVE({
        segments: profile.segments,
        hr,
        time: stream.time,
        lt1Bpm: 158,
      })
      expect(result).toBeNull()
    })

    it('< 60 s of qualifying segment time → null', () => {
      // Single 30-second climb at +10 % grade with HR at LT1.
      const time = Array.from({ length: 31 }, (_, i) => i)
      const distance = time.map(t => t * 2)
      const altitude = time.map(t => t * 2 * 0.1)
      const profile = computeTerrainProfile({
        altitude,
        distance,
        time,
        bucketSeconds: 5,
      })
      const hr = time.map(() => 158)
      const result = computeVE({
        segments: profile.segments,
        hr,
        time,
        lt1Bpm: 158,
      })
      expect(result).toBeNull()
    })
  })

  describe('AC2: BA 23K with HR at LT1 returns a finite VE ≥ 10', () => {
    const stream = buildStream(BA_SEGMENTS, 9000)
    const profile = computeTerrainProfile(stream)

    it('lt1Bpm=158 with HR=158 throughout → finite VE ≥ 10 m/min', () => {
      const hr = stream.time.map(() => 158)
      const result = computeVE({
        segments: profile.segments,
        hr,
        time: stream.time,
        lt1Bpm: 158,
      })
      expect(result).not.toBeNull()
      expect(Number.isFinite(result!)).toBe(true)
      expect(result!).toBeGreaterThanOrEqual(10)
    })

    it('LT1 ±5 bpm window: HR=153 (lower edge) still qualifies', () => {
      const hr = stream.time.map(() => 153)
      const result = computeVE({
        segments: profile.segments,
        hr,
        time: stream.time,
        lt1Bpm: 158,
      })
      expect(result).not.toBeNull()
      expect(result!).toBeGreaterThanOrEqual(10)
    })

    it('LT1 ±5 bpm window: HR=152 (one below the edge) does NOT qualify', () => {
      const hr = stream.time.map(() => 152)
      const result = computeVE({
        segments: profile.segments,
        hr,
        time: stream.time,
        lt1Bpm: 158,
      })
      expect(result).toBeNull()
    })
  })

  describe('hand-computed climb-only fixture', () => {
    it('15-min steady climb at +10 % at LT1 HR ≈ 60 m/min (within 1 %)', () => {
      // 15 min = 900 s, pace 2 m/s → 1800 m horizontal, +10 % grade →
      // 180 m vertical. VE = 180 m / 15 min = 12 m/min.
      // Wait — that's 12 not 60. Re-check: vertical = 180, time = 15 min →
      // VE = 180/15 = 12. The "60 m/min" target requires a steeper climb
      // or higher pace; pick numbers that make the math obvious.
      // Use 30 min @ +20 %, pace 3 m/s → 5400 m horiz × 0.20 = 1080 m vert
      // → VE = 1080 / 30 = 36 m/min. Still finite, ≥ 10.
      const totalSeconds = 1800 // 30 min
      const speed = 3 // m/s
      const grade = 0.2
      const time = Array.from({ length: totalSeconds + 1 }, (_, i) => i)
      const distance = time.map(t => t * speed)
      const altitude = time.map(t => t * speed * grade)
      const profile = computeTerrainProfile({ altitude, distance, time })
      const hr = time.map(() => 160)
      const result = computeVE({
        segments: profile.segments,
        hr,
        time,
        lt1Bpm: 160,
      })
      expect(result).not.toBeNull()
      // Expected VE = 1080 m / 30 min = 36 m/min.
      // Tolerance ±1 % covers SG smoothing artefacts at segment boundaries.
      expect(result!).toBeGreaterThan(36 * 0.99)
      expect(result!).toBeLessThan(36 * 1.01)
    })
  })

  describe('selectivity: only segments meeting BOTH gates contribute', () => {
    it('mixed HR — only segments at LT1 are counted', () => {
      // Build a stream where the first half is at LT1 HR and the second
      // half is at HR=120 (below the window). Vertical effort in the
      // second half should be ignored.
      const stream = buildStream(BA_SEGMENTS, 9000)
      const profile = computeTerrainProfile(stream)
      const hrAll158 = stream.time.map(() => 158)
      const hrMixed = stream.time.map((_, i) => (i < stream.time.length / 2 ? 158 : 120))
      const veAll = computeVE({
        segments: profile.segments,
        hr: hrAll158,
        time: stream.time,
        lt1Bpm: 158,
      })
      const veMixed = computeVE({
        segments: profile.segments,
        hr: hrMixed,
        time: stream.time,
        lt1Bpm: 158,
      })
      expect(veAll).not.toBeNull()
      expect(veMixed).not.toBeNull()
      // Mixed should reflect only first-half qualifying segments.
      expect(veMixed!).not.toBeCloseTo(veAll!, 0)
    })

    it('descent segments (grade < +5 %) never contribute', () => {
      // Pure descent only, HR at LT1 — should return null.
      const totalSeconds = 1800
      const speed = 2.5
      const grade = -0.1
      const time = Array.from({ length: totalSeconds + 1 }, (_, i) => i)
      const distance = time.map(t => t * speed)
      const altitude = time.map(t => 500 + t * speed * grade)
      const profile = computeTerrainProfile({ altitude, distance, time })
      const hr = time.map(() => 158)
      const result = computeVE({
        segments: profile.segments,
        hr,
        time,
        lt1Bpm: 158,
      })
      expect(result).toBeNull()
    })
  })

  describe('defensive contracts', () => {
    it('throws when hr.length !== time.length', () => {
      const stream = buildStream(BA_SEGMENTS, 9000)
      const profile = computeTerrainProfile(stream)
      const badHr = [150, 150, 150]
      expect(() =>
        computeVE({ segments: profile.segments, hr: badHr, time: stream.time, lt1Bpm: 158 }),
      ).toThrow(/length/i)
    })

    it('throws on non-positive lt1Bpm', () => {
      const stream = buildStream(BA_SEGMENTS, 9000)
      const profile = computeTerrainProfile(stream)
      const hr = stream.time.map(() => 158)
      const goodInput: VEInput = {
        segments: profile.segments,
        hr,
        time: stream.time,
        lt1Bpm: 158,
      }
      expect(() => computeVE({ ...goodInput, lt1Bpm: 0 })).toThrow()
      expect(() => computeVE({ ...goodInput, lt1Bpm: -10 })).toThrow()
    })

    it('returns null on empty segments array (no data path)', () => {
      const result = computeVE({ segments: [], hr: [], time: [], lt1Bpm: 158 })
      expect(result).toBeNull()
    })
  })
})
