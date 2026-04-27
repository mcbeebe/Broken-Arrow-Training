import { describe, it, expect } from 'vitest'

import {
  MINETTI_RUN_COEFFS,
  MINETTI_WALK_COEFFS,
  costRun,
  costWalk,
} from '../../../engines/terrain/locomotion/minetti'

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
  polynomial: {
    run: { a0: number; a1: number; a2: number; a3: number; a4: number; a5: number }
    walk: { b0: number; b1: number; b2: number; b3: number; b4: number; b5: number }
  }
  samples: Sample[]
}

const fixture = fixtureRaw as Fixture

describe('Minetti polynomial (PR-03)', () => {
  describe('AC3: coefficients carry T1 + Minetti citation', () => {
    it('every run coefficient is tier T1 with the Minetti citation', () => {
      for (const k of ['a0', 'a1', 'a2', 'a3', 'a4', 'a5'] as const) {
        const tv = MINETTI_RUN_COEFFS[k]
        expect(tv.tier).toBe('T1')
        expect(tv.citation).toMatch(/Minetti 2002/)
      }
    })

    it('every walk coefficient is tier T1 with the Minetti citation', () => {
      for (const k of ['b0', 'b1', 'b2', 'b3', 'b4', 'b5'] as const) {
        const tv = MINETTI_WALK_COEFFS[k]
        expect(tv.tier).toBe('T1')
        expect(tv.citation).toMatch(/Minetti 2002/)
      }
    })

    it('coefficient values match the source spreadsheet exactly', () => {
      for (const k of ['a0', 'a1', 'a2', 'a3', 'a4', 'a5'] as const) {
        expect(MINETTI_RUN_COEFFS[k].value).toBe(fixture.polynomial.run[k])
      }
      for (const k of ['b0', 'b1', 'b2', 'b3', 'b4', 'b5'] as const) {
        expect(MINETTI_WALK_COEFFS[k].value).toBe(fixture.polynomial.walk[k])
      }
    })
  })

  describe('AC1: costRun/costWalk reproduce the fixture samples within 0.005 J/kg/m', () => {
    for (const s of fixture.samples) {
      it(`grade ${s.grade.toFixed(2)} → runCost ${s.runCost}`, () => {
        expect(Math.abs(costRun(s.grade) - s.runCost)).toBeLessThan(0.005)
      })
    }
  })

  describe('multiplier consistency: runMult and walkMult are referenced to costRun(0)', () => {
    for (const s of fixture.samples) {
      it(`grade ${s.grade.toFixed(2)} → runMult within 0.001`, () => {
        const computed = costRun(s.grade) / costRun(0)
        expect(Math.abs(computed - s.runMult)).toBeLessThan(0.001)
      })
      it(`grade ${s.grade.toFixed(2)} → walkMult within 0.001`, () => {
        const computed = costWalk(s.grade) / costRun(0)
        expect(Math.abs(computed - s.walkMult)).toBeLessThan(0.001)
      })
    }
  })

  describe('edge cases', () => {
    it('costRun(0) === 3.6 exactly (the a0 anchor)', () => {
      expect(costRun(0)).toBe(3.6)
    })

    it('costWalk(0) === 2.5 exactly (the b0 anchor)', () => {
      expect(costWalk(0)).toBe(2.5)
    })

    it('AC2: grade > +0.45 clamps to the +0.45 boundary value', () => {
      expect(costRun(0.5)).toBe(costRun(0.45))
      expect(costRun(0.99)).toBe(costRun(0.45))
    })

    it('AC2: grade < -0.45 clamps to the -0.45 boundary value', () => {
      expect(costRun(-0.5)).toBe(costRun(-0.45))
      expect(costWalk(-0.99)).toBe(costWalk(-0.45))
    })

    it('AC2: clamping does not throw', () => {
      expect(() => costRun(10)).not.toThrow()
      expect(() => costWalk(-10)).not.toThrow()
    })
  })
})
