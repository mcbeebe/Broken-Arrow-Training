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
// R1 — periodized heavy→power schemes require a TRAINED lifter; novices
// get technique-first at every phase (audit C1/C2, NSCA older-adult and
// novice guidance). The periodization fixture is therefore experienced.
const cfg: OnboardingConfig = {
  raceType: 'road', raceName: 'X', raceDate: '2026-10-18', raceDistance: 'marathon',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 6, strengthDaysPerWeek: 2,
  equipmentAccess: ['gym'], currentWeeklyMileage: 30, wearable: 'none',
  athleteName: 'T', age: 35, completedAt: '', strengthExperience: 'experienced',
}

describe('R8 — strength periodization on the plan', () => {
  const plan = generatePlanFromMethod(daniels, cfg, TODAY)
  const strengthDays = allDays(plan).filter(d => d.type === 'strength')

  it('schedules strength days', () => {
    expect(strengthDays.length).toBeGreaterThan(0)
  })
  it('shifts from heavy (base) toward power (near the race)', () => {
    expect(strengthDays.some(d => /heavy/i.test(d.detail))).toBe(true)
    expect(strengthDays.some(d => /power/i.test(d.detail))).toBe(true)
    // R1 — the routine matches the emphasis now: heavy days really carry
    // low-rep main lifts. (Daniels' phase ids never reach the dedicated
    // POWER phase — its Phase III is the transition — so the jump/throw
    // routine is asserted at the unit level in r1-masters-personalization.)
    expect(strengthDays.some(d => /Squat 4×5/.test(d.detail))).toBe(true)
    // And RM language is gone for everyone (audit C2).
    for (const d of strengthDays) expect(d.detail).not.toMatch(/\bRM\b|maximal strength/i)
  })
  it('GUARD: race week has no strength day', () => {
    const raceWeek = plan.weeks[plan.weeks.length - 1]
    expect(raceWeek.days.some(d => d.type === 'strength')).toBe(false)
  })
})

describe('R8 — strengthPhaseEmphasis (unit)', () => {
  it('maps base → heavy, race-near → power, mid → transition, taper → maintenance (trained lifters)', () => {
    expect(strengthPhaseEmphasis('foundation', false, cfg)).toMatch(/heavy/i)
    expect(strengthPhaseEmphasis('base', false, cfg)).toMatch(/heavy/i)
    expect(strengthPhaseEmphasis('final_quality', false, cfg)).toMatch(/power|explosive/i)
    expect(strengthPhaseEmphasis('race_prep', false, cfg)).toMatch(/power|explosive/i)
    expect(strengthPhaseEmphasis('early_quality', false, cfg)).toMatch(/transition/i)
    expect(strengthPhaseEmphasis('taper', true, cfg)).toMatch(/maintenance/i)
  })

  it('R1 — without strength history, every phase reads technique-first (no config = safe default)', () => {
    expect(strengthPhaseEmphasis('base', false)).toMatch(/technique first/i)
    expect(strengthPhaseEmphasis('race_prep', false)).toMatch(/technique first/i)
    expect(strengthPhaseEmphasis('taper', true)).toMatch(/maintenance/i)
  })
})
