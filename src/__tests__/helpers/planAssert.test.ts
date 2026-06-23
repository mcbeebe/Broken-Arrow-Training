/**
 * PR-1 — the plan-assertion helpers work against a real generated plan, and the
 * baseline they capture (a flat road plan has ZERO prescribed vert today) is the
 * guard that R1 will preserve for flat races.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../engines/planGenerator/generatePlan'
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import type { TrainingMethod } from '../../types/training-method'
import danielsMethod from '../../data/methods/daniels.json'
import { allDays, daysMatching, weeklyVertFt, isNonDecreasing, maxWeekGap, weeksWith } from './planAssert'

const daniels = danielsMethod as unknown as TrainingMethod
const TODAY = '2026-06-14'
const flatRoad: OnboardingConfig = {
  raceType: 'road', raceName: 'Flat Marathon', raceDate: '2026-10-18', raceDistance: 'marathon',
  raceDescription: 'pancake-flat road marathon', experienceLevel: 'intermediate',
  trainingDaysPerWeek: 5, wearable: 'none', athleteName: 'T', age: 35, completedAt: '',
}

describe('planAssert helpers', () => {
  const plan = generatePlanFromMethod(daniels, flatRoad, TODAY)

  it('allDays flattens every week', () => {
    expect(allDays(plan).length).toBe(plan.weeks.reduce((n, w) => n + w.days.length, 0))
  })
  it('daysMatching finds easy runs', () => {
    expect(daysMatching(plan, /easy/i).length).toBeGreaterThan(0)
  })
  it('BASELINE GUARD: a flat road plan prescribes zero vert today', () => {
    expect(weeklyVertFt(plan).every(v => v === 0)).toBe(true)
    expect(weeksWith(plan, /ft (gain|climb)/i)).toEqual([])
  })
  it('isNonDecreasing', () => {
    expect(isNonDecreasing([1, 1, 2, 3])).toBe(true)
    expect(isNonDecreasing([2, 1])).toBe(false)
  })
  it('maxWeekGap measures recurrence incl. edges', () => {
    expect(maxWeekGap([2, 4, 6], 1, 7)).toBe(2)
    expect(maxWeekGap([], 1, 7)).toBe(Infinity)
  })
})
