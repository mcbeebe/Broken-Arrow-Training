// PLAN-vs-CODE drift (PR-11, BA_Terrain_Descent_IT_Project_Plan_v1.0.md §PR-11):
//
// 1. Plan declares the `DescentLoadForecast` type with 24/48/72h fields
//    but only writes the single-value `forecastDOMS(dose, state, deltaHours)`
//    function. Without a producer, the type is unused. We add a sister
//    `forecastDOMSWindow(dose, state) → DescentLoadForecast` (3-line wrapper
//    that calls forecastDOMS three times) so PR-15's "Tomorrow's Forecast"
//    UI can consume the bundled object directly.
// 2. Otherwise the plan is internally consistent: inputs (`EccentricDose`,
//    `RepeatedBoutState`) are already shipping types from PR-09/10, and
//    the `KINETIC_CURVE` lookup is a fixed 6-row table with no calibration
//    mismatch.

import { describe, it, expect } from 'vitest'

import {
  forecastDOMS,
  forecastDOMSWindow,
  KINETIC_CURVE,
} from '../../../engines/descent/forecast'
import type {
  DescentLoadForecast,
  EccentricDose,
  RepeatedBoutState,
} from '../../../types'

function makeDose(doseAU: number): EccentricDose {
  return {
    activityId: 'test',
    doseAU,
    bucketHistogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    meanDescentGrade: 0,
    descentDistanceM: 0,
  }
}

function makeState(protectionFactor: number): RepeatedBoutState {
  return { recentBouts: [], protectionFactor }
}

describe('KINETIC_CURVE table (PR-11)', () => {
  it('matches the spec values at 12, 24, 48, 72, 96, 120 h', () => {
    expect(KINETIC_CURVE[12]).toBe(0.55)
    expect(KINETIC_CURVE[24]).toBe(1.0)
    expect(KINETIC_CURVE[48]).toBe(0.85)
    expect(KINETIC_CURVE[72]).toBe(0.55)
    expect(KINETIC_CURVE[96]).toBe(0.25)
    expect(KINETIC_CURVE[120]).toBe(0.1)
  })

  it('peaks at 24 h (Vernillo 2020 / CK literature)', () => {
    expect(KINETIC_CURVE[24]).toBe(Math.max(...Object.values(KINETIC_CURVE)))
  })

  it('decays monotonically after the peak', () => {
    const after = [24, 48, 72, 96, 120].map(h => KINETIC_CURVE[h])
    for (let i = 1; i < after.length; i++) {
      expect(after[i]).toBeLessThan(after[i - 1])
    }
  })
})

describe('forecastDOMS (PR-11)', () => {
  describe('AC1: dose 100, no protection, 24 h → 100', () => {
    it('exact', () => {
      const dose = makeDose(100)
      const state = makeState(0)
      expect(forecastDOMS(dose, state, 24)).toBeCloseTo(100, 6)
    })
  })

  describe('AC2: dose 100, protection 0.45, 24 h → 55', () => {
    it('full attenuation reduces by exactly 45 %', () => {
      const dose = makeDose(100)
      const state = makeState(0.45)
      expect(forecastDOMS(dose, state, 24)).toBeCloseTo(55, 6)
    })

    it('half protection reduces by 22.5 %', () => {
      const dose = makeDose(100)
      const state = makeState(0.225)
      expect(forecastDOMS(dose, state, 24)).toBeCloseTo(77.5, 6)
    })
  })

  describe('AC3: deltaHours not in the curve table → 0', () => {
    it('8 h returns 0', () => {
      expect(forecastDOMS(makeDose(100), makeState(0), 8)).toBe(0)
    })
    it('-12 h (past) returns 0', () => {
      expect(forecastDOMS(makeDose(100), makeState(0), -12)).toBe(0)
    })
    it('200 h (beyond curve) returns 0', () => {
      expect(forecastDOMS(makeDose(100), makeState(0), 200)).toBe(0)
    })
  })

  describe('zero dose → all forecasts 0', () => {
    it('any deltaHours, any protection', () => {
      const zero = makeDose(0)
      for (const h of [12, 24, 48, 72, 96, 120]) {
        expect(forecastDOMS(zero, makeState(0), h)).toBe(0)
        expect(forecastDOMS(zero, makeState(0.3), h)).toBe(0)
      }
    })
  })

  describe('all curve points reproduce dose × k × (1 − protection)', () => {
    for (const [hStr, k] of Object.entries(KINETIC_CURVE)) {
      const h = Number(hStr)
      it(`${h} h → 100 × ${k} × 0.55 = ${100 * k * 0.55}`, () => {
        expect(forecastDOMS(makeDose(100), makeState(0.45), h)).toBeCloseTo(100 * k * 0.55, 6)
      })
    }
  })
})

describe('forecastDOMSWindow (PR-11)', () => {
  it('returns a DescentLoadForecast with 24 / 48 / 72 h values', () => {
    const dose = makeDose(100)
    const state = makeState(0)
    const f: DescentLoadForecast = forecastDOMSWindow(dose, state)
    expect(f.forecast24h).toBeCloseTo(100, 6)
    expect(f.forecast48h).toBeCloseTo(85, 6)
    expect(f.forecast72h).toBeCloseTo(55, 6)
  })

  it('threads doseAU and protectionFactor through for telemetry', () => {
    const dose = makeDose(110)
    const state = makeState(0.3)
    const f = forecastDOMSWindow(dose, state)
    expect(f.doseAU).toBe(110)
    expect(f.protectionFactor).toBe(0.3)
  })

  it('protection 0.45 reduces every horizon by 45 %', () => {
    const dose = makeDose(100)
    const naked = forecastDOMSWindow(dose, makeState(0))
    const protected_ = forecastDOMSWindow(dose, makeState(0.45))
    expect(protected_.forecast24h / naked.forecast24h).toBeCloseTo(0.55, 6)
    expect(protected_.forecast48h / naked.forecast48h).toBeCloseTo(0.55, 6)
    expect(protected_.forecast72h / naked.forecast72h).toBeCloseTo(0.55, 6)
  })

  it('zero dose → all horizons zero', () => {
    const f = forecastDOMSWindow(makeDose(0), makeState(0))
    expect(f.forecast24h).toBe(0)
    expect(f.forecast48h).toBe(0)
    expect(f.forecast72h).toBe(0)
  })
})
