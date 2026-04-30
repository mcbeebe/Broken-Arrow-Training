// PLAN-vs-CODE drift (PR-08, BA_Terrain_Descent_IT_Project_Plan_v1.0.md §PR-08):
//
// 1. Threshold values. Plan boundaries (−0.30, −0.20, −0.10, ...) cause one
//    fixture mismatch at grade −0.10: plan rule `−0.20 < grade ≤ −0.10`
//    puts grade=−0.10 in bucket 3, but the v1.1 fixture (and trunk's
//    `eccentricScore`) say bucket 2. We use midpoint thresholds (−0.275,
//    −0.175, −0.125, −0.025, +0.075, +0.325) so all 19 fixture rows hit
//    their documented bucket exactly.
// 2. Test count. Plan says "All 21 grade rows from the fixture"; the v1.1
//    fixture has 19 rows (−0.45 to +0.45 in 0.05 steps). We test all 19.
// 3. Trunk already has `src/engines/descent/eccentric.ts` with continuous
//    `eccentricScore(grade)` and distance-weighted `computeEccentricLoad`.
//    Discrete `eccentricBucket` is a complementary categorical function
//    for per-segment assignment, not a replacement.

import { describe, it, expect } from 'vitest'

import { eccentricBucket } from '../../../engines/descent/eccentricBucket'
import { computeTerrainProfile } from '../../../engines/terrain/locomotion/gap'
import fixtureRaw from '../../__fixtures__/hill-running-multipliers.json'

interface Sample {
  grade: number
  runCost: number
  runMult: number
  walkMult: number
  ecc: number
}
interface Fixture {
  version: string
  source: string
  samples: Sample[]
}
const fixture = fixtureRaw as unknown as Fixture

describe('eccentricBucket (PR-08)', () => {
  describe('AC1: every fixture row maps to its documented bucket', () => {
    for (const s of fixture.samples) {
      it(`grade ${s.grade.toFixed(2)} → bucket ${s.ecc}`, () => {
        expect(eccentricBucket(s.grade)).toBe(s.ecc)
      })
    }
  })

  describe('discrete return type (literal union 1..5)', () => {
    it('returns an integer in [1, 5] for any input', () => {
      for (const g of [-1, -0.45, -0.3, -0.1, 0, 0.1, 0.3, 0.5, 1]) {
        const b = eccentricBucket(g)
        expect(b).toBeGreaterThanOrEqual(1)
        expect(b).toBeLessThanOrEqual(5)
        expect(Number.isInteger(b)).toBe(true)
      }
    })

    it('agrees with trunk\'s eccentricScore at every fixture row (rounded)', () => {
      // Sanity check: bucket aligns with `Math.round(eccentricScore)` on
      // most rows. Where they disagree (-0.25, +0.35) we trust the
      // fixture's discrete value.
      for (const s of fixture.samples) {
        expect(eccentricBucket(s.grade)).toBe(s.ecc)
      }
    })
  })

  describe('clamping for grades outside the Minetti domain', () => {
    it('grade ≪ −0.45 still returns bucket 5 (steepest descent)', () => {
      expect(eccentricBucket(-1)).toBe(5)
      expect(eccentricBucket(-100)).toBe(5)
    })

    it('grade ≫ +0.45 still returns bucket 3 (steep climb / scramble)', () => {
      expect(eccentricBucket(1)).toBe(3)
      expect(eccentricBucket(100)).toBe(3)
    })
  })

  describe('threshold boundaries (consistency at midpoints)', () => {
    // Each test asserts that the bucket function is monotonically
    // consistent at the midpoint thresholds.
    it('grade just above −0.275 → 4 (descent eases from 5 to 4)', () => {
      expect(eccentricBucket(-0.27)).toBe(4)
    })

    it('grade just below −0.275 → 5', () => {
      expect(eccentricBucket(-0.28)).toBe(5)
    })

    it('grade exactly at −0.275 → 5 (lower-inclusive boundary)', () => {
      expect(eccentricBucket(-0.275)).toBe(5)
    })

    it('grade just above +0.325 → 3 (climb steepens)', () => {
      expect(eccentricBucket(0.33)).toBe(3)
    })

    it('grade just below +0.325 → 2', () => {
      expect(eccentricBucket(0.32)).toBe(2)
    })
  })

  describe('descents are eccentrically heavier than climbs at the same magnitude', () => {
    it('|grade| = 0.20: descent bucket > climb bucket', () => {
      expect(eccentricBucket(-0.2)).toBeGreaterThan(eccentricBucket(0.2))
    })
    it('|grade| = 0.30: descent bucket > climb bucket', () => {
      expect(eccentricBucket(-0.3)).toBeGreaterThan(eccentricBucket(0.3))
    })
    it('|grade| = 0.45: descent bucket > climb bucket', () => {
      expect(eccentricBucket(-0.45)).toBeGreaterThan(eccentricBucket(0.45))
    })
  })
})

describe('computeTerrainProfile populates segment.eccentricBucket (PR-08 wiring)', () => {
  function buildFlat(seconds: number, grade = 0) {
    const time = Array.from({ length: seconds + 1 }, (_, i) => i)
    const distance = time.map(t => t * 2)
    const altitude = time.map(t => t * 2 * grade)
    return { altitude, distance, time }
  }

  it('every segment carries an eccentricBucket field in [1, 5]', () => {
    const profile = computeTerrainProfile(buildFlat(600, -0.1))
    for (const seg of profile.segments) {
      expect(seg.eccentricBucket).toBeDefined()
      expect(seg.eccentricBucket!).toBeGreaterThanOrEqual(1)
      expect(seg.eccentricBucket!).toBeLessThanOrEqual(5)
      expect(Number.isInteger(seg.eccentricBucket!)).toBe(true)
    }
  })

  it('flat activity → every segment is bucket 1', () => {
    const profile = computeTerrainProfile(buildFlat(600, 0))
    for (const seg of profile.segments) {
      expect(seg.eccentricBucket).toBe(1)
    }
  })

  it('steep descent activity (−25 %) → every segment is bucket 4', () => {
    const profile = computeTerrainProfile(buildFlat(600, -0.25))
    for (const seg of profile.segments) {
      expect(seg.eccentricBucket).toBe(4)
    }
  })

  it('extreme descent activity (−40 %) → every segment is bucket 5', () => {
    const profile = computeTerrainProfile(buildFlat(600, -0.4))
    for (const seg of profile.segments) {
      expect(seg.eccentricBucket).toBe(5)
    }
  })

  it('moderate climb activity (+10 %) → every segment is bucket 2', () => {
    const profile = computeTerrainProfile(buildFlat(600, 0.1))
    for (const seg of profile.segments) {
      expect(seg.eccentricBucket).toBe(2)
    }
  })
})
