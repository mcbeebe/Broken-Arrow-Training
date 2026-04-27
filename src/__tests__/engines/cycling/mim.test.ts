import { describe, it, expect } from 'vitest'

import {
  CYCLING_MIM_COEFFS,
  CYCLING_MIM_DOMAIN_MAX,
  CYCLING_MIM_DOMAIN_MIN,
  cyclingMIM,
} from '../../../engines/cycling/mim'

import fixtureRaw from '../../__fixtures__/cycling-mim.json'

interface Sample {
  label: string
  description: string
  intensityFactor: number
  kneeCompressionBW: number
  mim: number
}
interface Fixture {
  version: string
  source: string
  formula: { a: number; b: number }
  samples: Sample[]
}

const fixture = fixtureRaw as Fixture

describe('Cycling MIM (D\'Lima 2013, Ericson & Nisell 1986/87)', () => {
  describe('coefficients carry T2 + cycling-biomechanics citations', () => {
    it('intercept is tier T2 with the D\'Lima 2013 citation', () => {
      expect(CYCLING_MIM_COEFFS.a.tier).toBe('T2')
      expect(CYCLING_MIM_COEFFS.a.citation).toMatch(/D'Lima 2013/)
    })

    it('slope is tier T2 with an Ericson & Nisell citation', () => {
      expect(CYCLING_MIM_COEFFS.b.tier).toBe('T2')
      expect(CYCLING_MIM_COEFFS.b.citation).toMatch(/Ericson & Nisell/)
    })

    it('coefficient values match the source spreadsheet exactly', () => {
      expect(CYCLING_MIM_COEFFS.a.value).toBe(fixture.formula.a)
      expect(CYCLING_MIM_COEFFS.b.value).toBe(fixture.formula.b)
    })
  })

  describe('cyclingMIM reproduces the fixture intensity zones within 0.005', () => {
    for (const s of fixture.samples) {
      it(`IF ${s.intensityFactor.toFixed(2)} (${s.label}) → ${s.mim}`, () => {
        expect(Math.abs(cyclingMIM(s.intensityFactor) - s.mim)).toBeLessThan(0.005)
      })
    }
  })

  describe('edge cases', () => {
    it('cyclingMIM(0) === 0.4 (the intercept, true recovery floor)', () => {
      expect(cyclingMIM(0)).toBe(0.4)
    })

    it('IF below 0 clamps to the 0 boundary value', () => {
      expect(cyclingMIM(-0.5)).toBe(cyclingMIM(0))
      expect(cyclingMIM(-99)).toBe(cyclingMIM(0))
    })

    it('IF above the 1.5 cap clamps to the 1.5 boundary value', () => {
      expect(cyclingMIM(1.6)).toBe(cyclingMIM(1.5))
      expect(cyclingMIM(99)).toBe(cyclingMIM(1.5))
    })

    it('clamping does not throw', () => {
      expect(() => cyclingMIM(-10)).not.toThrow()
      expect(() => cyclingMIM(10)).not.toThrow()
    })

    it('domain constants are consistent with the formula bounds', () => {
      expect(CYCLING_MIM_DOMAIN_MIN).toBe(0)
      expect(CYCLING_MIM_DOMAIN_MAX).toBe(1.5)
    })
  })
})
