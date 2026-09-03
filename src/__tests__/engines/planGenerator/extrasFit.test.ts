import { describe, it, expect } from 'vitest'
import {
  assessExtrasFit, assessExtrasFitForConfig, resolveRunMethodMeta,
} from '../../../engines/planGenerator/extrasFit'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { RECOMMENDABLE_METHODS } from '../../../data/methods'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import type { TrainingPlan } from '../../../types'

/**
 * Decision 6c — the onboarding fit forecast. Its one job is to agree with the
 * plan the generator actually builds, so the athlete is warned before
 * committing and never told a different story afterward (the #415 advisory).
 */

const TODAY = '2026-09-07'

const config = (over: Partial<OnboardingConfig>): OnboardingConfig => ({
  athleteName: 'X', age: 35, sex: 'male', wearable: 'garmin',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 4,
  longRunDay: 'Sunday', equipmentAccess: ['gym'], completedAt: '',
  raceType: 'road', raceName: 'Test', raceDate: '2026-12-26',
  raceDistance: 'marathon', maxHR: 185, currentWeeklyMileage: 30,
  ...over,
} as unknown as OnboardingConfig)

/** Strength + cross days in a typical FULL build week (7 days, not a
 *  taper / cutback / recovery / race week). */
function typicalExtras(plan: TrainingPlan): number {
  const build = plan.weeks
    .slice(0, -1)
    .filter(w => w.days.length === 7 && !/taper|cutback|recover|race\s*week|deload/i.test(w.focus))
  // The mode across build weeks — one cutback dropping its extra must not
  // define "typical".
  const counts = build.map(w => w.days.filter(d => d.type === 'strength' || d.type === 'cross').length)
  if (counts.length === 0) return 0
  const tally = new Map<number, number>()
  for (const c of counts) tally.set(c, (tally.get(c) ?? 0) + 1)
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
}

describe('assessExtrasFit — pure arithmetic', () => {
  it('everything fits when the method floor leaves room', () => {
    const a = assessExtrasFit({ minRunDays: 3, maxRunDays: 6, extrasRequested: 2, dayBudget: 6 })
    expect(a.overBudget).toBe(false)
    expect(a.noneFit).toBe(false)
    expect(a.extrasThatFit).toBe(2)
    expect(a.runningDaysActual).toBe(4)
  })

  it('none fit when the running floor alone exceeds the budget', () => {
    // 5-day method, 4-day athlete, 2 strength: running takes 5, budget is 4.
    const a = assessExtrasFit({ minRunDays: 5, maxRunDays: 6, extrasRequested: 2, dayBudget: 4 })
    expect(a.noneFit).toBe(true)
    expect(a.overBudget).toBe(true)
    expect(a.extrasThatFit).toBe(0)
    expect(a.runningDaysActual).toBe(5)
    expect(a.daysForAll).toBe(7)
  })

  it('one extra survives, over budget by a day, when the floor exactly fills it', () => {
    // 5-day method, 5-day athlete, 2 extras: one extra fits by running 6 days.
    const a = assessExtrasFit({ minRunDays: 5, maxRunDays: 6, extrasRequested: 2, dayBudget: 5 })
    expect(a.noneFit).toBe(false)
    expect(a.overBudget).toBe(true)
    expect(a.extrasThatFit).toBe(1)
  })

  it('no extras requested is never over budget', () => {
    const a = assessExtrasFit({ minRunDays: 6, maxRunDays: 6, extrasRequested: 0, dayBudget: 4 })
    expect(a.overBudget).toBe(false)
    expect(a.noneFit).toBe(false)
  })
})

describe('resolveRunMethodMeta', () => {
  it('resolves a running method for road and trail, null for hyrox and general', () => {
    expect(resolveRunMethodMeta(config({ raceType: 'road' }))).not.toBeNull()
    expect(resolveRunMethodMeta(config({ raceType: 'trail', raceDistance: '50k' }))).not.toBeNull()
    expect(resolveRunMethodMeta(config({ raceType: 'hyrox' }))).toBeNull()
    expect(resolveRunMethodMeta(config({ raceType: 'general', raceDistance: undefined }))).toBeNull()
  })

  it('reports the method min/max running days from its weekly patterns', () => {
    const meta = resolveRunMethodMeta(config({ raceDistance: 'marathon' }))!
    expect(meta.minRunDays).toBeGreaterThanOrEqual(3)
    expect(meta.maxRunDays).toBeGreaterThanOrEqual(meta.minRunDays)
    expect(meta.methodName.length).toBeGreaterThan(0)
  })
})

describe('the forecast agrees with the generated plan (cannot drift)', () => {
  // Span the boundaries: comfortable, exactly-full, and over-budget day counts
  // across several distances/experience levels so different methods resolve.
  const CASES: Partial<OnboardingConfig>[] = [
    { raceDistance: 'marathon', trainingDaysPerWeek: 6, strengthDaysPerWeek: 1 },
    { raceDistance: 'marathon', trainingDaysPerWeek: 4, strengthDaysPerWeek: 2 },
    { raceDistance: 'marathon', trainingDaysPerWeek: 5, strengthDaysPerWeek: 1, crossTrainingDaysPerWeek: 1 },
    { raceDistance: 'half_marathon', trainingDaysPerWeek: 4, strengthDaysPerWeek: 1 },
    { raceDistance: 'half_marathon', trainingDaysPerWeek: 5, strengthDaysPerWeek: 2 },
    { raceDistance: '10k', trainingDaysPerWeek: 3, strengthDaysPerWeek: 2 },
    { raceDistance: '10k', trainingDaysPerWeek: 6, strengthDaysPerWeek: 1 },
    { raceDistance: '5k', experienceLevel: 'beginner', trainingDaysPerWeek: 4, strengthDaysPerWeek: 1, crossTrainingDaysPerWeek: 1 },
    { raceDistance: '50k', raceType: 'trail', trainingDaysPerWeek: 4, strengthDaysPerWeek: 2 },
    { raceDistance: 'marathon', experienceLevel: 'advanced', trainingDaysPerWeek: 5, strengthDaysPerWeek: 1 },
  ]

  it.each(CASES.map(c => [JSON.stringify(c), c] as const))(
    'forecast extrasThatFit == plan typical-week extras for %s',
    (_label, over) => {
      const cfg = config(over)
      const assessment = assessExtrasFitForConfig(cfg)
      expect(assessment, 'expected a running-method assessment').not.toBeNull()
      // Build the plan with the SAME method the forecast resolved, so the two
      // sides are looking at one plan.
      const meta = resolveRunMethodMeta(cfg)!
      const method = RECOMMENDABLE_METHODS.find(m => m.name === meta.methodName)!
      const plan = generatePlanFromMethod(method, cfg, TODAY)
      expect(assessment!.extrasThatFit).toBe(typicalExtras(plan))
    },
  )

  it('the zero-fit forecast lines up with the plan that ships no strength', () => {
    // A busy road athlete on a high-floor method: this is the #415 case.
    const cfg = config({ raceDistance: 'marathon', trainingDaysPerWeek: 4, strengthDaysPerWeek: 2, experienceLevel: 'advanced' })
    const a = assessExtrasFitForConfig(cfg)!
    const meta = resolveRunMethodMeta(cfg)!
    const method = RECOMMENDABLE_METHODS.find(m => m.name === meta.methodName)!
    const plan = generatePlanFromMethod(method, cfg, TODAY)
    if (a.noneFit) {
      expect(typicalExtras(plan)).toBe(0)
      // …and the plan's own advisory says the same thing #415 shipped.
      expect((plan.advisories ?? []).some(x => x.id === 'extras_did_not_fit')).toBe(true)
    }
  })
})

describe('assessExtrasFitForConfig — guards', () => {
  it('is null when no extras were asked for', () => {
    expect(assessExtrasFitForConfig(config({ strengthDaysPerWeek: 0, crossTrainingDaysPerWeek: 0 }))).toBeNull()
  })
  it('is null for hyrox and general', () => {
    expect(assessExtrasFitForConfig(config({ raceType: 'hyrox', strengthDaysPerWeek: 2 }))).toBeNull()
    expect(assessExtrasFitForConfig(config({ raceType: 'general', raceDistance: undefined, strengthDaysPerWeek: 2 }))).toBeNull()
  })
})
