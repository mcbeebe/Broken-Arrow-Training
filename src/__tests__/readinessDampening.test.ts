// PLAN-vs-CODE drift (PR-13, BA_Terrain_Descent_IT_Project_Plan_v1.0.md §PR-13):
//
// 1. `athlete.referenceDose` doesn't exist on AthleteProfile. Same posture
//    as PR-09/10's `flatThresholdPaceMps` and PR-07's `lt1Bpm`: caller
//    passes `referenceDose` directly to the helper. Engine stays stateless.
// 2. `snapshot.engines.descent?.forecast24h` plumbing is OUT OF SCOPE for
//    PR-13 narrow. The caller computes the dampening factor and passes it
//    into `calculateReadiness` as an optional 5th param. The pipeline that
//    derives forecast24h from recent activities lands later (PR-15 or a
//    follow-on).
// 3. Default `loadDampening = 1` means every existing 4-arg call is
//    unchanged — production readiness numbers stay identical until a
//    downstream PR threads forecast24h through.

import { describe, it, expect } from 'vitest'

import {
  calculateReadiness,
  loadDampeningFactor,
} from '../utils/readiness'
import type { GarminHealthData, ReadinessBaselines } from '../types'

const TODAY: GarminHealthData = {
  date: '2026-05-02',
  hrv: { weeklyAvg: 56, lastNightAvg: 56, status: 'BALANCED' },
  rhr: 50,
  sleep: {
    durationSeconds: 7.5 * 3600,
    quality: 'GOOD',
    deepSeconds: 5400,
    lightSeconds: 12600,
    remSeconds: 4800,
    awakeSeconds: 600,
    score: 82,
  },
}

const BASELINES: ReadinessBaselines = {
  lnRmssd: { mean: Math.log(56), stdDev: 0.05, sampleSize: 14 },
  rhr: { mean: 50, stdDev: 2, sampleSize: 14 },
  sleepDuration: { mean: 7.5, stdDev: 0.5, sampleSize: 14 },
  sleepScore: { mean: 82, stdDev: 4, sampleSize: 14 },
  dailyTrimp: { mean: 80, stdDev: 20, sampleSize: 14 },
}

const ACWR = 1.0 // sweet spot — loadScore = 0
const HRV_CV = 0.05

describe('loadDampeningFactor (PR-13)', () => {
  describe('AC2: floor enforced at 0.7', () => {
    it('pathologically high forecast24h returns exactly 0.7', () => {
      expect(loadDampeningFactor(9999, 100)).toBe(0.7)
    })

    it('forecast24h = referenceDose still clamps to 0.7 floor (not 0)', () => {
      // raw: 1 - 100/100 = 0; floor wins
      expect(loadDampeningFactor(100, 100)).toBe(0.7)
    })
  })

  describe('linear regime (above floor)', () => {
    it('forecast24h = 10, referenceDose = 100 → 0.9', () => {
      expect(loadDampeningFactor(10, 100)).toBeCloseTo(0.9, 6)
    })

    it('forecast24h = 20, referenceDose = 100 → 0.8', () => {
      expect(loadDampeningFactor(20, 100)).toBeCloseTo(0.8, 6)
    })

    it('forecast24h = 30 ⇄ referenceDose = 100 → exactly 0.7 (boundary)', () => {
      // raw: 1 - 30/100 = 0.7; equal to floor
      expect(loadDampeningFactor(30, 100)).toBeCloseTo(0.7, 6)
    })

    it('forecast24h = 31, referenceDose = 100 → 0.7 (floor wins by 0.01)', () => {
      // raw: 1 - 0.31 = 0.69; floor 0.7 wins
      expect(loadDampeningFactor(31, 100)).toBe(0.7)
    })
  })

  describe('monotonicity: factor decreases as forecast/ref ratio rises', () => {
    it('strictly decreasing in the linear regime', () => {
      const samples = [0, 5, 10, 15, 20, 25].map(f => loadDampeningFactor(f, 100))
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i]).toBeLessThan(samples[i - 1])
      }
    })

    it('flat at floor once clamped', () => {
      const after = [30, 50, 80, 200, 9999].map(f => loadDampeningFactor(f, 100))
      for (const v of after) expect(v).toBe(0.7)
    })
  })

  describe('guards', () => {
    it('forecast24h = 0 → factor 1 (no dampening)', () => {
      expect(loadDampeningFactor(0, 100)).toBe(1)
    })

    it('negative forecast24h → factor 1 (no dampening)', () => {
      expect(loadDampeningFactor(-5, 100)).toBe(1)
    })

    it('referenceDose = 0 → factor 1 (no dampening)', () => {
      expect(loadDampeningFactor(50, 0)).toBe(1)
    })

    it('negative referenceDose → factor 1 (no dampening)', () => {
      expect(loadDampeningFactor(50, -1)).toBe(1)
    })
  })
})

describe('calculateReadiness loadDampening parameter (PR-13)', () => {
  describe('AC1: loadDampening = 1 → identical to undampened baseline', () => {
    it('explicit 1 matches default (4-arg) call', () => {
      const baseline = calculateReadiness(TODAY, BASELINES, ACWR, HRV_CV)
      const dampened = calculateReadiness(TODAY, BASELINES, ACWR, HRV_CV, 1)
      expect(dampened.composite).toBe(baseline.composite)
      expect(dampened.displayScore).toBe(baseline.displayScore)
      expect(dampened.status).toBe(baseline.status)
    })

    it('omitting the param matches passing 1 (default behavior preserved)', () => {
      const omitted = calculateReadiness(TODAY, BASELINES, ACWR, HRV_CV)
      const explicit = calculateReadiness(TODAY, BASELINES, ACWR, HRV_CV, 1)
      expect(omitted).toEqual(explicit)
    })
  })

  describe('dampening with non-zero load score', () => {
    // Use ACWR in the danger zone so loadScore = -1 (max negative contribution)
    const DANGER_ACWR = 1.6

    it('loadDampening = 0.7 attenuates the Load contribution by 30 %', () => {
      const baseline = calculateReadiness(TODAY, BASELINES, DANGER_ACWR, HRV_CV)
      const dampened = calculateReadiness(TODAY, BASELINES, DANGER_ACWR, HRV_CV, 0.7)

      // Load contribution = loadScore × WEIGHT_LOAD = -1 × 0.20 = -0.20
      // Dampened: -1 × 0.7 × 0.20 = -0.14
      // Δcomposite = (-0.14) - (-0.20) = +0.06 (less negative)
      const diff = dampened.composite - baseline.composite
      expect(diff).toBeCloseTo(0.06, 2)
    })

    it('loadDampening only affects the Load component, not HRV / RHR / Sleep', () => {
      const baseline = calculateReadiness(TODAY, BASELINES, DANGER_ACWR, HRV_CV)
      const dampened = calculateReadiness(TODAY, BASELINES, DANGER_ACWR, HRV_CV, 0.7)
      expect(dampened.components.hrv).toBe(baseline.components.hrv)
      expect(dampened.components.rhr).toBe(baseline.components.rhr)
      expect(dampened.components.sleep).toBe(baseline.components.sleep)
    })

    it('components.trainingLoad reports the RAW loadScore (dampening separated)', () => {
      // The dampening is a debt-attenuation, not a re-scoring of training
      // load. The raw component stays raw so UI can show both numbers.
      const baseline = calculateReadiness(TODAY, BASELINES, DANGER_ACWR, HRV_CV)
      const dampened = calculateReadiness(TODAY, BASELINES, DANGER_ACWR, HRV_CV, 0.7)
      expect(dampened.components.trainingLoad).toBe(baseline.components.trainingLoad)
    })
  })

  describe('AC3: existing readiness suite stays green', () => {
    // Sentinel: the existing suite at src/__tests__/readiness.test.ts uses
    // 4-arg calls everywhere. This test asserts that omitting the new param
    // preserves the entire return shape verbatim.
    it('full ReadinessScore keys are unchanged when loadDampening is omitted', () => {
      const result = calculateReadiness(TODAY, BASELINES, ACWR, HRV_CV)
      const keys = Object.keys(result).sort()
      expect(keys).toEqual(
        [
          'acwr',
          'adjustment',
          'components',
          'composite',
          'date',
          'displayScore',
          'message',
          'status',
          'trainingState',
        ],
      )
      expect(Object.keys(result.components).sort()).toEqual(
        ['hrv', 'rhr', 'sleep', 'trainingLoad'].sort(),
      )
    })
  })

  describe('end-to-end: helper + calculateReadiness composed', () => {
    it('large forecast24h dampens at the 0.7 floor', () => {
      const factor = loadDampeningFactor(500, 100) // way above ratio
      expect(factor).toBe(0.7)
      const dampened = calculateReadiness(TODAY, BASELINES, 1.6, HRV_CV, factor)
      const baseline = calculateReadiness(TODAY, BASELINES, 1.6, HRV_CV)
      expect(dampened.composite).toBeGreaterThan(baseline.composite)
    })

    it('zero forecast24h is a no-op', () => {
      const factor = loadDampeningFactor(0, 100)
      expect(factor).toBe(1)
      const dampened = calculateReadiness(TODAY, BASELINES, 1.6, HRV_CV, factor)
      const baseline = calculateReadiness(TODAY, BASELINES, 1.6, HRV_CV)
      expect(dampened.composite).toBe(baseline.composite)
    })
  })
})
