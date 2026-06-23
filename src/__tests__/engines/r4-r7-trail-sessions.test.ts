/**
 * R4 / R7 (PR-4) — the generated plan carries a dress-rehearsal predictor 4–6
 * weeks out and power-hiking on climby races, and neither when not warranted.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../engines/planGenerator/generatePlan'
import { isPredictorWeek } from '../../engines/planGenerator/trailSessions'
import { daysMatching } from '../helpers/planAssert'
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import type { TrainingMethod } from '../../types/training-method'
import danielsMethod from '../../data/methods/daniels.json'
import koopMethod from '../../data/methods/koop.json'

const daniels = danielsMethod as unknown as TrainingMethod
const koop = koopMethod as unknown as TrainingMethod
const TODAY = '2026-06-14'

function base(o: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'road', raceName: 'X', raceDate: '2026-10-18', raceDistance: 'marathon',
    raceDescription: 'a road marathon', experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5, currentWeeklyMileage: 30, wearable: 'none',
    athleteName: 'T', age: 35, completedAt: '', ...o,
  }
}
const climby100 = base({
  raceType: 'trail', raceName: 'Mtn 100', raceDate: '2026-12-26', raceDistance: '100_mile',
  raceDescription: 'rugged mountain 100', elevationGainFt: 20000, experienceLevel: 'advanced',
  trainingDaysPerWeek: 6, currentWeeklyMileage: 45,
})

describe('R4 — dress-rehearsal predictor', () => {
  it('schedules a dress rehearsal on a long run 4–6 weeks out', () => {
    const plan = generatePlanFromMethod(daniels, base(), TODAY)
    const total = plan.weeks.length
    const found = plan.weeks
      .filter(w => total - w.num >= 4 && total - w.num <= 6)
      .flatMap(w => w.days)
      .some(d => d.type === 'long' && /dress rehearsal/i.test(d.detail))
    expect(found).toBe(true)
  })
  it('GUARD: a 5K plan gets no dress rehearsal', () => {
    const plan = generatePlanFromMethod(daniels, base({ raceDistance: '5k' }), TODAY)
    expect(daysMatching(plan, /dress rehearsal/i)).toEqual([])
  })
  it('isPredictorWeek fires only 4–6 weeks out', () => {
    expect([4, 5, 6].every(isPredictorWeek)).toBe(true)
    expect([3, 7].some(isPredictorWeek)).toBe(false)
  })
})

describe('R7 — power-hiking', () => {
  it('prescribes power-hiking on a climby race', () => {
    const plan = generatePlanFromMethod(koop, climby100, TODAY)
    expect(daysMatching(plan, /power.?hike/i).length).toBeGreaterThan(0)
  })
  it('GUARD: a flat road race gets no power-hiking', () => {
    const plan = generatePlanFromMethod(daniels, base(), TODAY)
    expect(daysMatching(plan, /power.?hike/i)).toEqual([])
  })
  it('never prescribes power-hiking in the taper', () => {
    const plan = generatePlanFromMethod(koop, climby100, TODAY)
    const taperNums = plan.weeks.filter(w => w.focus === 'Taper').map(w => w.num)
    const phWeeks = plan.weeks.filter(w => w.days.some(d => /power.?hike/i.test(d.detail))).map(w => w.num)
    expect(phWeeks.some(n => taperNums.includes(n))).toBe(false)
  })
})
