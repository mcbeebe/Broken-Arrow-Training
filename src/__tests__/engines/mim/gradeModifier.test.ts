// PLAN-vs-CODE drift (PR-14, BA_Terrain_Descent_IT_Project_Plan_v1.0.md §PR-14):
//
// 1. SportType naming. Plan's running set `'trail_run', 'road_run',
//    'race_trail', 'hill_repeat', 'hike'` doesn't match the actual
//    SportType union (`'running', 'trail_running', 'running_steep',
//    'hiking', 'hiking_steep', ...`). Real names used; `hill_repeat`
//    has no equivalent and is dropped.
// 2. mimEffective signature simplified. Plan code takes the whole
//    `matrix: Record<SportType, number>` as a third arg, but `MIM_MATRIX`
//    in src/utils/trimp.ts is module-private. Public accessor is
//    `getSportMultiplier(sportType, athleteId?)` which respects per-
//    athlete overrides. We take a single `baseMultiplier: number`
//    instead — caller passes whatever the right multiplier is for that
//    activity (typically getSportMultiplier output).
// 3. GradeModifier type is a simple `type GradeModifier = number`
//    alias — plan says to add the type but doesn't define semantics.
//    Minimal scope; richer breakdown type can come later if needed.

import { describe, it, expect } from 'vitest'

import {
  gradeModifier,
  mimEffective,
  CLIMB_MSK_MULT,
  DESCENT_MSK_MULT,
  RUNNING_SPORTS,
} from '../../../engines/mim/gradeModifier'
import type { SportType, TerrainProfile, TerrainSegment } from '../../../types'

/** Build a minimal TerrainProfile from a list of (distanceM, gradePct) tuples. */
function profileOf(segs: ReadonlyArray<{ distanceM: number; gradePct: number }>): TerrainProfile {
  const segments: TerrainSegment[] = segs.map((s, i) => ({
    startSec: i * 60,
    endSec: (i + 1) * 60,
    distanceM: s.distanceM,
    meanGradePct: s.gradePct,
    runMultiplier: 1,
    paceMps: s.distanceM / 60,
  }))
  const total = segs.reduce((sum, s) => sum + s.distanceM, 0)
  return {
    equivalentFlatDistanceM: total,
    gapSecondsPerKm: 300,
    segments,
    verticalGainM: 0,
    verticalLossM: 0,
    gradeHistogramBands: [],
  }
}

describe('gradeModifier (PR-14)', () => {
  describe('AC2: flat trail run → 1.0', () => {
    it('all segments at 0 % grade → 1.0', () => {
      const flat = profileOf([
        { distanceM: 1000, gradePct: 0 },
        { distanceM: 1000, gradePct: 1 },
        { distanceM: 1000, gradePct: -2 },
      ])
      expect(gradeModifier(flat)).toBeCloseTo(1.0, 6)
    })

    it('empty profile → 1.0 (no division by zero)', () => {
      const empty = profileOf([])
      expect(gradeModifier(empty)).toBe(1)
    })
  })

  describe('AC3: BA Skyrace 23K → in [1.15, 1.40]', () => {
    // Same 10 segments as PR-05 / PR-09 fixtures; matches the xlsx
    // Calculator sheet with the loop-closure adjustment on the final descent.
    const ba = profileOf([
      { distanceM: 2000, gradePct: 5 },
      { distanceM: 2500, gradePct: 22 },
      { distanceM: 1000, gradePct: -18 },
      { distanceM: 1500, gradePct: 15 },
      { distanceM: 300, gradePct: 40 },
      { distanceM: 1000, gradePct: 5 },
      { distanceM: 2500, gradePct: -20 },
      { distanceM: 4000, gradePct: 3 }, // < +5 % → flat
      { distanceM: 3000, gradePct: 12 },
      { distanceM: 3900, gradePct: -16 },
    ])

    it('returns a value in [1.15, 1.40]', () => {
      const m = gradeModifier(ba)
      expect(m).toBeGreaterThanOrEqual(1.15)
      expect(m).toBeLessThanOrEqual(1.4)
    })
  })

  describe('component multipliers (T3 first-principles)', () => {
    it('CLIMB_MSK_MULT.value === 1.40', () => {
      expect(CLIMB_MSK_MULT.value).toBe(1.4)
      expect(CLIMB_MSK_MULT.tier).toBe('T3')
    })

    it('DESCENT_MSK_MULT.value === 1.60', () => {
      expect(DESCENT_MSK_MULT.value).toBe(1.6)
      expect(DESCENT_MSK_MULT.tier).toBe('T3')
    })
  })

  describe('weighting math', () => {
    it('100 % climb at +10 % → 1.40', () => {
      const climb = profileOf([{ distanceM: 5000, gradePct: 10 }])
      expect(gradeModifier(climb)).toBeCloseTo(1.4, 6)
    })

    it('100 % descent at −10 % → 1.60', () => {
      const descent = profileOf([{ distanceM: 5000, gradePct: -10 }])
      expect(gradeModifier(descent)).toBeCloseTo(1.6, 6)
    })

    it('50 % climb / 50 % flat → 0.5 × 1.4 + 0.5 × 1.0 = 1.20', () => {
      const mixed = profileOf([
        { distanceM: 1000, gradePct: 10 },
        { distanceM: 1000, gradePct: 0 },
      ])
      expect(gradeModifier(mixed)).toBeCloseTo(1.2, 6)
    })

    it('25 % climb / 25 % descent / 50 % flat → 0.25(1.4) + 0.25(1.6) + 0.5(1.0) = 1.25', () => {
      const mixed = profileOf([
        { distanceM: 1000, gradePct: 10 },
        { distanceM: 1000, gradePct: -10 },
        { distanceM: 2000, gradePct: 0 },
      ])
      expect(gradeModifier(mixed)).toBeCloseTo(1.25, 6)
    })
  })

  describe('grade thresholds (climb ≥ +5 %, descent ≤ −5 %)', () => {
    it('+4 % grade counts as flat (just below threshold)', () => {
      const justBelow = profileOf([{ distanceM: 1000, gradePct: 4.99 }])
      expect(gradeModifier(justBelow)).toBeCloseTo(1.0, 6)
    })

    it('+5 % grade exactly counts as climb (boundary inclusive)', () => {
      const atBoundary = profileOf([{ distanceM: 1000, gradePct: 5 }])
      expect(gradeModifier(atBoundary)).toBeCloseTo(1.4, 6)
    })

    it('−4 % grade counts as flat', () => {
      const justAbove = profileOf([{ distanceM: 1000, gradePct: -4.99 }])
      expect(gradeModifier(justAbove)).toBeCloseTo(1.0, 6)
    })

    it('−5 % grade exactly counts as descent', () => {
      const atBoundary = profileOf([{ distanceM: 1000, gradePct: -5 }])
      expect(gradeModifier(atBoundary)).toBeCloseTo(1.6, 6)
    })
  })
})

describe('mimEffective (PR-14)', () => {
  describe('AC1: non-running sports return baseMultiplier unchanged', () => {
    const climbHeavy = profileOf([
      { distanceM: 2000, gradePct: 10 },
      { distanceM: 1000, gradePct: -10 },
    ])
    const sports: SportType[] = [
      'strength_lower',
      'strength_upper',
      'cycling',
      'swimming',
      'yoga',
      'rowing',
    ]
    for (const s of sports) {
      it(`${s} returns base multiplier regardless of profile`, () => {
        expect(mimEffective(s, climbHeavy, 2.0)).toBe(2.0)
        expect(mimEffective(s, undefined, 2.0)).toBe(2.0)
      })
    }
  })

  describe('running sports apply gradeModifier', () => {
    const ba = profileOf([
      { distanceM: 2000, gradePct: 5 },
      { distanceM: 2500, gradePct: 22 },
      { distanceM: 1000, gradePct: -18 },
      { distanceM: 1500, gradePct: 15 },
      { distanceM: 300, gradePct: 40 },
      { distanceM: 1000, gradePct: 5 },
      { distanceM: 2500, gradePct: -20 },
      { distanceM: 4000, gradePct: 3 },
      { distanceM: 3000, gradePct: 12 },
      { distanceM: 3900, gradePct: -16 },
    ])

    for (const s of [
      'running',
      'trail_running',
      'running_steep',
      'hiking',
      'hiking_steep',
    ] as SportType[]) {
      it(`${s} multiplies base by gradeModifier`, () => {
        const base = 1.1
        const expected = base * gradeModifier(ba)
        expect(mimEffective(s, ba, base)).toBeCloseTo(expected, 6)
      })
    }
  })

  describe('missing profile → no modification', () => {
    it('running sport with undefined profile → base unchanged', () => {
      expect(mimEffective('trail_running', undefined, 1.1)).toBe(1.1)
    })
  })

  describe('RUNNING_SPORTS exposed for callers', () => {
    it('contains the five real running/hiking SportType values', () => {
      const expected: SportType[] = [
        'running',
        'trail_running',
        'running_steep',
        'hiking',
        'hiking_steep',
      ]
      for (const s of expected) {
        expect(RUNNING_SPORTS.has(s)).toBe(true)
      }
    })

    it('does not contain non-running sports', () => {
      const notRunning: SportType[] = [
        'strength_lower',
        'cycling',
        'swimming',
        'yoga',
      ]
      for (const s of notRunning) {
        expect(RUNNING_SPORTS.has(s)).toBe(false)
      }
    })
  })
})
