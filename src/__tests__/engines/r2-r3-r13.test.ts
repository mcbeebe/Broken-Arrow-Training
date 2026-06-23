/**
 * R2 / R3 / R13 (PR-3) — the generated plan actually carries fueling targets,
 * a heat block, and altitude/heat advisories when warranted, and NONE of them
 * when not (the guards).
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../engines/planGenerator/generatePlan'
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

describe('R2 — fueling on the plan (apply + guard)', () => {
  it('puts a carb/hr target on long runs for a marathon', () => {
    const plan = generatePlanFromMethod(daniels, base(), TODAY)
    const fuelDays = daysMatching(plan, /g carb\/hr/i)
    expect(fuelDays.length).toBeGreaterThan(0)
    expect(fuelDays.every(d => d.type === 'long')).toBe(true)
  })
  it('flags a race-nutrition rehearsal 4–6 weeks out', () => {
    const plan = generatePlanFromMethod(daniels, base(), TODAY)
    const total = plan.weeks.length
    const rehearsal = plan.weeks
      .filter(w => total - w.num >= 4 && total - w.num <= 6)
      .flatMap(w => w.days)
      .some(d => /practice race nutrition/i.test(d.detail))
    expect(rehearsal).toBe(true)
  })
  it('GUARD: a 5K plan has no per-hour fueling', () => {
    const plan = generatePlanFromMethod(daniels, base({ raceDistance: '5k' }), TODAY)
    expect(daysMatching(plan, /g carb\/hr/i)).toEqual([])
  })
})

describe('R3 — heat prep on the plan (apply + guard)', () => {
  it('adds a heat_prep advisory + a heat block in the final ~2 weeks for a hot race', () => {
    const plan = generatePlanFromMethod(daniels, base({ raceDescription: 'brutally hot desert marathon' }), TODAY)
    expect((plan.advisories ?? []).some(a => a.id === 'heat_prep')).toBe(true)
    const total = plan.weeks.length
    const heatDay = plan.weeks.filter(w => total - w.num <= 2).flatMap(w => w.days)
      .some(d => /heat|sauna/i.test(d.detail))
    expect(heatDay).toBe(true)
  })
  it('GUARD: a temperate race gets no heat prep', () => {
    const plan = generatePlanFromMethod(daniels, base({ raceDescription: 'cool autumn road marathon' }), TODAY)
    expect((plan.advisories ?? []).some(a => a.id === 'heat_prep')).toBe(false)
    expect(daysMatching(plan, /heat prep|sauna/i)).toEqual([])
  })
})

describe('R13 — altitude prep on the plan (apply + guard)', () => {
  it('adds an altitude_prep advisory for a high-altitude race', () => {
    const plan = generatePlanFromMethod(koop, base({
      raceType: 'trail', raceDistance: '50_mile',
      raceDescription: 'alpine 50-miler at 10,000 ft elevation', currentWeeklyMileage: 40,
    }), TODAY)
    expect((plan.advisories ?? []).some(a => a.id === 'altitude_prep')).toBe(true)
  })
  it('GUARD: a sea-level race gets no altitude prep', () => {
    const plan = generatePlanFromMethod(daniels, base({ raceDescription: 'flat coastal sea-level marathon' }), TODAY)
    expect((plan.advisories ?? []).some(a => a.id === 'altitude_prep')).toBe(false)
  })
})
