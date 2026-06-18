/**
 * P2 improvements — method tie-break on fit (not alphabet), General-Fitness pace
 * anchoring, and long-runway base-building.
 */
import { describe, it, expect } from 'vitest'
import { selectMethods, type SelectionInputs } from '../../engines/planGenerator/methodSelection'
import { generateGeneralFitnessPlan } from '../../engines/generalFitness'
import { generatePlanFromMethod } from '../../engines/planGenerator/generatePlan'
import type { TrainingMethod } from '../../types/training-method'
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import danielsMethod from '../../data/methods/daniels.json'

const daniels = danielsMethod as unknown as TrainingMethod
const TODAY = '2026-06-14'

describe('P2-9: ties break on profile fit, not the alphabet', () => {
  const mk = (id: string, dist: string, exp: string, terr: string) =>
    ({ id, signature: '', restrictions: [], applicability: { byDistance: { marathon: dist }, byExperience: { intermediate: exp }, byTerrain: { road: terr } } }) as unknown as TrainingMethod
  const inputs: SelectionInputs = { raceDistance: 'marathon', experience: 'intermediate', terrain: 'road' }

  it('a tied method with the better experience fit wins even with a later id', () => {
    const aaa = mk('aaa', 'BEST', 'GOOD', 'BEST') // 12 + 6 + 4 = 22
    const zzz = mk('zzz', 'BEST', 'BEST', 'OK')   // 12 + 8 + 2 = 22 (tie), better experience
    const ranked = selectMethods([aaa, zzz], inputs)
    expect(ranked[0].score).toBe(ranked[1].score)   // genuinely tied on total
    expect(ranked[0].methodId).toBe('zzz')           // experience fit wins, not 'aaa'
  })
})

describe('P2-10: General Fitness anchors cardio to a tested effort', () => {
  const gf = (o: Partial<OnboardingConfig> = {}): OnboardingConfig => ({
    raceType: 'general', raceName: 'X', raceDate: '', generalGoal: 'build_endurance',
    experienceLevel: 'intermediate', trainingDaysPerWeek: 5, wearable: 'none',
    athleteName: 'T', age: 35, completedAt: '', ...o,
  })
  it('shows pace targets on cardio sessions when a race anchor is present', () => {
    const plan = generateGeneralFitnessPlan(gf({ fitnessAnchor: { type: 'race_marathon', valueSeconds: 3 * 3600 + 30 * 60 } }), TODAY)
    const paced = plan.weeks.flatMap(w => w.days).some(d => /Zone 2|easy aerobic/.test(d.workout) && /\/mi/.test(d.zone))
    expect(paced).toBe(true)
  })
  it('stays HR-only when there is no anchor', () => {
    const plan = generateGeneralFitnessPlan(gf(), TODAY)
    const anyPace = plan.weeks.flatMap(w => w.days).some(d => /\/mi/.test(d.zone))
    expect(anyPace).toBe(false)
  })
})

describe('P2-8: a long runway is base-built, not left as a dead zone', () => {
  const cfg = (raceDate: string): OnboardingConfig => ({
    raceType: 'road', raceName: 'X', raceDate, raceDistance: 'marathon',
    experienceLevel: 'intermediate', trainingDaysPerWeek: 5, currentWeeklyMileage: 25,
    wearable: 'none', athleteName: 'T', age: 35, completedAt: '',
  })
  it('prepends base weeks so the plan is longer than the periodized block', () => {
    // daniels caps at 24 wk; a race ~30 wk out should yield ~30 wk with a base block.
    const plan = generatePlanFromMethod(daniels, cfg('2027-01-10'), TODAY)
    expect(plan.weeks.length).toBeGreaterThan(24)
    expect(plan.weeks.length).toBeLessThanOrEqual(40) // capped
    // The peak is in the periodized block, not the base weeks at the front.
    const miles = plan.weeks.map(w => Number(w.miles))
    const peakIdx = miles.indexOf(Math.max(...miles))
    expect(peakIdx).toBeGreaterThan(6) // not in the first (base) weeks
  })
  it('a normal runway is unaffected (no base padding)', () => {
    const plan = generatePlanFromMethod(daniels, cfg('2026-10-18'), TODAY) // ~18 wk
    expect(plan.weeks.length).toBeLessThanOrEqual(24)
  })
})
