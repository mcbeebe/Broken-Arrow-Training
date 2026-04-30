// PLAN-vs-CODE drift (PR-09, BA_Terrain_Descent_IT_Project_Plan_v1.0.md §PR-09):
//
// 1. Pure-function input. Plan signature
//    `eccentricTrimpForActivity(activity, athlete)` doesn't fit because
//    StravaActivity has no `terrainProfile` and AthleteProfile has no
//    `flatThresholdPaceMps`. We pass `{ activityId, segments,
//    flatThresholdPaceMps } → EccentricDose`.
// 2. `flatThresholdPaceMps` as a direct param, not added to AthleteProfile —
//    same posture as PR-07's `lt1Bpm`.
// 3. Calibration constant is /250, not the plan's /1000. Plan's /1000
//    produces ~25 AU for the BA 23K sample at paceFactor=1.0, which
//    contradicts plan AC2 ([80, 130]) and spec §8.5 (≈110 AU). The "AU"
//    is arbitrary (T4 calibration) so this is just a unit shift; AC3
//    monotonicity is preserved.

import { describe, it, expect } from 'vitest'

import { eccentricTrimpForActivity, ECCENTRIC_TRIMP_CALIBRATION } from '../../../engines/descent/eccentricTrimp'
import { computeTerrainProfile } from '../../../engines/terrain/locomotion/gap'
import type { EccentricDose } from '../../../types'

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

describe('eccentricTrimpForActivity (PR-09)', () => {
  describe('AC1: flat activity → doseAU === 0', () => {
    it('flat treadmill (constant altitude)', () => {
      const totalSeconds = 1800
      const time = Array.from({ length: totalSeconds + 1 }, (_, i) => i)
      const distance = time.map(t => t * 3) // 3 m/s
      const altitude = time.map(() => 100)
      const profile = computeTerrainProfile({ altitude, distance, time })
      const result = eccentricTrimpForActivity({
        activityId: 'treadmill-1',
        segments: profile.segments,
        flatThresholdPaceMps: 4,
      })
      expect(result.doseAU).toBe(0)
      expect(result.descentDistanceM).toBe(0)
      expect(Object.values(result.bucketHistogram).every(v => v === 0)).toBe(true)
    })

    it('pure-climb activity also yields zero descent dose', () => {
      const totalSeconds = 1200
      const time = Array.from({ length: totalSeconds + 1 }, (_, i) => i)
      const distance = time.map(t => t * 2)
      const altitude = time.map(t => t * 2 * 0.1) // +10 % climb
      const profile = computeTerrainProfile({ altitude, distance, time })
      const result = eccentricTrimpForActivity({
        activityId: 'climb-1',
        segments: profile.segments,
        flatThresholdPaceMps: 4,
      })
      expect(result.doseAU).toBe(0)
    })
  })

  describe('AC2: BA 23K with flatThresholdPaceMps=4.0 → doseAU ∈ [80, 130]', () => {
    // Race time at flat threshold: 21.7 km / 4 m/s = 5425 s ≈ 1:30:25.
    const stream = buildStream(BA_SEGMENTS, 5425)
    const profile = computeTerrainProfile(stream)

    it('returns a finite doseAU within the spec\'s ≈110 AU range', () => {
      const result = eccentricTrimpForActivity({
        activityId: 'ba-23k',
        segments: profile.segments,
        flatThresholdPaceMps: 4,
      })
      expect(Number.isFinite(result.doseAU)).toBe(true)
      expect(result.doseAU).toBeGreaterThanOrEqual(80)
      expect(result.doseAU).toBeLessThanOrEqual(130)
    })

    it('reports descent distance ≈ 7,400 m (1k + 2.5k + 3.9k)', () => {
      const result = eccentricTrimpForActivity({
        activityId: 'ba-23k',
        segments: profile.segments,
        flatThresholdPaceMps: 4,
      })
      // ±50 m for SG smoothing and bucket-edge effects.
      expect(result.descentDistanceM).toBeGreaterThan(7350)
      expect(result.descentDistanceM).toBeLessThan(7450)
    })

    it('histogram sums equal descentDistanceM within 1 m', () => {
      const result = eccentricTrimpForActivity({
        activityId: 'ba-23k',
        segments: profile.segments,
        flatThresholdPaceMps: 4,
      })
      const histSum = Object.values(result.bucketHistogram).reduce((a, b) => a + b, 0)
      expect(Math.abs(histSum - result.descentDistanceM)).toBeLessThan(1)
    })

    it('mean descent grade is around −18 % (weighted by descent distance)', () => {
      const result = eccentricTrimpForActivity({
        activityId: 'ba-23k',
        segments: profile.segments,
        flatThresholdPaceMps: 4,
      })
      // Hand-computed: (1000×−18 + 2500×−20 + 3900×−16) / 7400 ≈ −17.6 %.
      expect(result.meanDescentGrade).toBeLessThan(-17)
      expect(result.meanDescentGrade).toBeGreaterThan(-18)
    })
  })

  describe('AC3: paceFactor monotonicity', () => {
    it('faster descent pace yields strictly higher dose', () => {
      // Same segments, different flatThresholdPaceMps so paceFactor changes.
      // Lower threshold → higher paceFactor → higher dose.
      const stream = buildStream(BA_SEGMENTS, 5425)
      const profile = computeTerrainProfile(stream)
      const slow = eccentricTrimpForActivity({
        activityId: 'ba-slow',
        segments: profile.segments,
        flatThresholdPaceMps: 5, // makes athlete's actual pace LOWER vs threshold
      })
      const fast = eccentricTrimpForActivity({
        activityId: 'ba-fast',
        segments: profile.segments,
        flatThresholdPaceMps: 3, // makes athlete's actual pace HIGHER vs threshold
      })
      expect(fast.doseAU).toBeGreaterThan(slow.doseAU)
    })
  })

  describe('paceFactor clamping', () => {
    it('paceFactor is clamped to [0.6, 1.6] — extreme thresholds saturate', () => {
      const stream = buildStream(BA_SEGMENTS, 5425)
      const profile = computeTerrainProfile(stream)
      const ratioMin = eccentricTrimpForActivity({
        activityId: 'min-clamp',
        segments: profile.segments,
        flatThresholdPaceMps: 999, // paceFactor would be ~0.004 → clamp to 0.6
      })
      const ratioMax = eccentricTrimpForActivity({
        activityId: 'max-clamp',
        segments: profile.segments,
        flatThresholdPaceMps: 0.5, // paceFactor would be ~8 → clamp to 1.6
      })
      // 1.6 / 0.6 = 2.667× upper-vs-lower bound on dose.
      const ratio = ratioMax.doseAU / ratioMin.doseAU
      expect(ratio).toBeCloseTo(1.6 / 0.6, 1)
    })
  })

  describe('EccentricDose shape', () => {
    it('exposes the spec\'d fields', () => {
      const stream = buildStream(BA_SEGMENTS, 5425)
      const profile = computeTerrainProfile(stream)
      const result: EccentricDose = eccentricTrimpForActivity({
        activityId: 'shape-test',
        segments: profile.segments,
        flatThresholdPaceMps: 4,
      })
      expect(result.activityId).toBe('shape-test')
      expect(typeof result.doseAU).toBe('number')
      expect(typeof result.meanDescentGrade).toBe('number')
      expect(typeof result.descentDistanceM).toBe('number')
      expect(result.bucketHistogram).toEqual(expect.objectContaining({ 1: expect.any(Number) }))
      expect(Object.keys(result.bucketHistogram).sort()).toEqual(['1', '2', '3', '4', '5'])
    })

    it('exposes the calibration constant for callers / tests', () => {
      expect(ECCENTRIC_TRIMP_CALIBRATION).toBe(250)
    })
  })

  describe('defensive contracts', () => {
    it('throws on non-positive flatThresholdPaceMps', () => {
      const stream = buildStream(BA_SEGMENTS, 5425)
      const profile = computeTerrainProfile(stream)
      expect(() =>
        eccentricTrimpForActivity({
          activityId: 'bad',
          segments: profile.segments,
          flatThresholdPaceMps: 0,
        }),
      ).toThrow()
      expect(() =>
        eccentricTrimpForActivity({
          activityId: 'bad',
          segments: profile.segments,
          flatThresholdPaceMps: -1,
        }),
      ).toThrow()
    })

    it('handles segments without eccentricBucket by deriving from grade', () => {
      // Strip eccentricBucket from a segment to test the fallback path.
      const stream = buildStream(BA_SEGMENTS, 5425)
      const profile = computeTerrainProfile(stream)
      const segmentsNoBucket = profile.segments.map(s => ({
        ...s,
        eccentricBucket: undefined,
      }))
      const result = eccentricTrimpForActivity({
        activityId: 'fallback',
        segments: segmentsNoBucket,
        flatThresholdPaceMps: 4,
      })
      // Without eccentricBucket on segments, the function must derive it
      // from grade — the dose should be in the same range as with it.
      expect(result.doseAU).toBeGreaterThanOrEqual(80)
      expect(result.doseAU).toBeLessThanOrEqual(130)
    })

    it('empty segments array → zero dose', () => {
      const result = eccentricTrimpForActivity({
        activityId: 'empty',
        segments: [],
        flatThresholdPaceMps: 4,
      })
      expect(result.doseAU).toBe(0)
      expect(result.descentDistanceM).toBe(0)
      expect(result.meanDescentGrade).toBe(0)
    })
  })
})
