import { describe, it, expect } from 'vitest'

import { hikingMIM } from '../../../engines/terrain/locomotion/hiking'
import { costRun, costWalk } from '../../../engines/terrain/locomotion/minetti'

import fixtureRaw from '../../__fixtures__/hill-running-multipliers.json'

interface Sample {
  grade: number
  runCost: number
  runMult: number
  walkMult: number
  ecc: number
}
interface Fixture {
  samples: Sample[]
}

const fixture = fixtureRaw as Fixture

describe('hikingMIM (Minetti walk polynomial / flat-run reference)', () => {
  describe('reproduces the fixture walkMult column within 0.001', () => {
    for (const s of fixture.samples) {
      it(`grade ${s.grade.toFixed(2)} → ${s.walkMult}`, () => {
        expect(Math.abs(hikingMIM(s.grade) - s.walkMult)).toBeLessThan(0.001)
      })
    }
  })

  describe('reference points from the v1.1 research summary', () => {
    it('flat hiking (grade 0) ≈ 0.69× flat running', () => {
      expect(hikingMIM(0)).toBeCloseTo(0.694, 3)
    })

    it('optimal walking descent (-10%) ≈ 0.31× — the walking energy minimum', () => {
      expect(hikingMIM(-0.1)).toBeCloseTo(0.313, 2)
    })

    it('+20% climb crossover: hiking cheaper than running', () => {
      expect(hikingMIM(0.2)).toBeLessThan(costRun(0.2) / costRun(0))
    })

    it('+30% climb: power-hiking territory', () => {
      expect(hikingMIM(0.3)).toBeGreaterThan(3)
      expect(hikingMIM(0.3)).toBeLessThan(3.2)
    })
  })

  describe('definition: hikingMIM(grade) === costWalk(grade) / costRun(0)', () => {
    for (const grade of [-0.3, -0.1, 0, 0.1, 0.25]) {
      it(`grade ${grade}: matches the underlying ratio exactly`, () => {
        expect(hikingMIM(grade)).toBe(costWalk(grade) / costRun(0))
      })
    }
  })
})
