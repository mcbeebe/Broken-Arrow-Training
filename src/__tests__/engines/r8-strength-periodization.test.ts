/**
 * R8 (PR-6) — strength is periodized across phases (heavy in base → power near
 * the race → none on race week), proven on the generated plan + at the unit level.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../engines/planGenerator/generatePlan'
import { strengthPhaseEmphasis } from '../../engines/planGenerator/extraDays'
import { allDays } from '../helpers/planAssert'
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import type { TrainingMethod } from '../../types/training-method'
import danielsMethod from '../../data/methods/daniels.json'

const daniels = danielsMethod as unknown as TrainingMethod
const TODAY = '2026-06-14'
const cfg: OnboardingConfig = {
  raceType: 'road', raceName: 'X', raceDate: '2026-10-18', raceDistance: 'marathon',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 6, strengthDaysPerWeek: 2,
  equipmentAccess: ['gym'], currentWeeklyMileage: 30, wearable: 'none',
  athleteName: 'T', age: 35, completedAt: '',
}

describe('R8 — strength periodization on the plan', () => {
  const plan = generatePlanFromMethod(daniels, cfg, TODAY)
  const strengthDays = allDays(plan).filter(d => d.type === 'strength')

  it('schedules strength days', () => {
    expect(strengthDays.length).toBeGreaterThan(0)
  })
  it('shifts from heavy maximal (base) to explosive power (near the race)', () => {
    expect(strengthDays.some(d => /heavy|maximal/i.test(d.detail))).toBe(true)
    expect(strengthDays.some(d => /power|explosive/i.test(d.detail))).toBe(true)
  })
  it('GUARD: race week has no strength day', () => {
    const raceWeek = plan.weeks[plan.weeks.length - 1]
    expect(raceWeek.days.some(d => d.type === 'strength')).toBe(false)
  })
})

describe('R8 — strengthPhaseEmphasis (unit)', () => {
  it('maps base → heavy, race-near → power, mid → transition, taper → maintenance', () => {
    expect(strengthPhaseEmphasis('foundation', false)).toMatch(/heavy|maximal/i)
    expect(strengthPhaseEmphasis('base', false)).toMatch(/heavy|maximal/i)
    expect(strengthPhaseEmphasis('final_quality', false)).toMatch(/power|explosive/i)
    expect(strengthPhaseEmphasis('race_prep', false)).toMatch(/power|explosive/i)
    expect(strengthPhaseEmphasis('early_quality', false)).toMatch(/transition/i)
    expect(strengthPhaseEmphasis('taper', true)).toMatch(/maintenance/i)
  })
})
