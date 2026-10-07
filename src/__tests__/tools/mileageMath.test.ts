/**
 * Initiative 003 PR 4c: the weekly mileage planner is the app's own plan
 * generator, run for one stated athlete. These tests hold it to that, and
 * hold the page's footnote to what the generator actually plans.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../engines/planGenerator/generatePlan'
import { getMethodById } from '../../data/methods'
import {
  mileagePlan,
  mileageAthlete,
  raceSaturday,
  MILEAGE_DISTANCES,
  MILEAGE_LIMITS,
  MILEAGE_METHOD_ID,
  type MileageDistance,
} from '../../tools/mileageMath'

const TODAY = '2026-08-17' // a Monday
const DISTANCES = MILEAGE_DISTANCES.map(d => d.id)
const MILEAGES = [5, 12, 20, 30, 45, 80]
const RUNWAYS = [4, 6, 8, 9, 12, 13, 16, 18, 21, 24]
const daniels = getMethodById(MILEAGE_METHOD_ID)!

function grid(fn: (d: MileageDistance, mi: number, n: number) => void) {
  for (const d of DISTANCES) for (const mi of MILEAGES) for (const n of RUNWAYS) fn(d, mi, n)
}

describe('it is the app’s plan', () => {
  it('weekly miles equal the generator’s targets for the stated athlete, everywhere on the grid', () => {
    grid((d, mi, n) => {
      const app = generatePlanFromMethod(daniels, mileageAthlete(d, mi, raceSaturday(TODAY, n)), TODAY)
      expect(mileagePlan(d, mi, n, TODAY)!.weeks.map(w => w.miles), `${d} ${mi} ${n}`).toEqual(app.weeks.map(w => w.targetMi))
    })
  })

  it('every week the app gives a long run has its miles read from the app’s card', () => {
    grid((d, mi, n) => {
      const app = generatePlanFromMethod(daniels, mileageAthlete(d, mi, raceSaturday(TODAY, n)), TODAY)
      const plan = mileagePlan(d, mi, n, TODAY)!
      app.weeks.forEach((w, i) => {
        const hasLong = w.days.some(day => day.type === 'long')
        expect(plan.weeks[i].longRunMi > 0, `${d} ${mi} ${n} week ${i + 1}`).toBe(hasLong)
      })
    })
  })

  it('the stated athlete is what the page says: intermediate, 5 days, healthy, no race time, Daniels', () => {
    const a = mileageAthlete('marathon', 30, raceSaturday(TODAY, 16))
    expect(a).toMatchObject({ experienceLevel: 'intermediate', trainingDaysPerWeek: 5, selectedMethodId: 'daniels', currentWeeklyMileage: 30 })
    expect(a.fitnessAnchor).toBeUndefined()
    expect(a.injuryStatus ?? 'none').toBe('none')
  })

  it('the race is on the Saturday that ends week N', () => {
    expect(raceSaturday(TODAY, 1)).toBe('2026-08-22')
    expect(raceSaturday('2026-08-20', 16)).toBe('2026-12-05')
  })
})

describe('the footnote, held to the app’s output', () => {
  it('“each building week is at most about 10% above the last full week”', () => {
    grid((d, mi, n) => {
      const plan = mileagePlan(d, mi, n, TODAY)!
      let lastFull = plan.weeks[0].miles
      for (const w of plan.weeks.slice(1, plan.peakWeek)) {
        if (w.easier) continue
        // Shown to 0.1 mi: allow each figure's rounding.
        expect(w.miles, `${d} ${mi} ${n} week ${w.week}`).toBeLessThanOrEqual((lastFull + 0.05) * 1.1 + 0.05)
        lastFull = w.miles
      }
    })
  })

  it('“every fourth week before the peak is easier”', () => {
    grid((d, mi, n) => {
      const plan = mileagePlan(d, mi, n, TODAY)!
      for (const w of plan.weeks) {
        if (w.week % 4 === 0 && w.week < plan.peakWeek) expect(w.easier, `${d} ${mi} ${n} week ${w.week}`).toBe(true)
      }
    })
  })

  it('“Lighter bars are easier weeks”: easier means lower than the week before', () => {
    grid((d, mi, n) => {
      const { weeks } = mileagePlan(d, mi, n, TODAY)!
      weeks.forEach((w, i) => expect(w.easier).toBe(i > 0 && w.miles < weeks[i - 1].miles))
    })
  })
})

describe('the summary', () => {
  it('start, peak and its week, and the longest run come from the weeks', () => {
    grid((d, mi, n) => {
      const p = mileagePlan(d, mi, n, TODAY)!
      expect(p.startMi).toBe(p.weeks[0].miles)
      expect(p.peakMi).toBe(Math.max(...p.weeks.map(w => w.miles)))
      expect(p.weeks[p.peakWeek - 1].miles).toBe(p.peakMi)
      expect(p.weeks.slice(0, p.peakWeek - 1).every(w => w.miles < p.peakMi)).toBe(true)
      expect(p.longestRunMi).toBe(Math.max(...p.weeks.map(w => w.longRunMi)))
    })
  })

  it('the longest run keeps to Daniels’ 30% rule in its own week', () => {
    grid((d, mi, n) => {
      for (const w of mileagePlan(d, mi, n, TODAY)!.weeks) {
        if (w.longRunMi) expect(w.longRunMi, `${d} ${mi} ${n} week ${w.week}`).toBeLessThanOrEqual(w.miles * 0.3 + 0.1)
      }
    })
  })
})

describe('input', () => {
  it.each([
    ['too few miles', 'marathon', MILEAGE_LIMITS.minMi - 0.5, 16],
    ['too many miles', 'marathon', MILEAGE_LIMITS.maxMi + 1, 16],
    ['not a number', 'marathon', NaN, 16],
    ['too few weeks', 'marathon', 20, MILEAGE_LIMITS.minWeeks - 1],
    ['too many weeks', 'marathon', 20, MILEAGE_LIMITS.maxWeeks + 1],
    ['part of a week', 'marathon', 20, 12.5],
  ] as const)('%s → null', (_why, d, mi, n) => {
    expect(mileagePlan(d, mi, n, TODAY)).toBeNull()
  })

  it('accepts the limits themselves and decimals', () => {
    expect(mileagePlan('5k', MILEAGE_LIMITS.minMi, MILEAGE_LIMITS.minWeeks, TODAY)).not.toBeNull()
    expect(mileagePlan('marathon', MILEAGE_LIMITS.maxMi, MILEAGE_LIMITS.maxWeeks, TODAY)).not.toBeNull()
    expect(mileagePlan('half_marathon', 20.5, 12, TODAY)).not.toBeNull()
  })
})
