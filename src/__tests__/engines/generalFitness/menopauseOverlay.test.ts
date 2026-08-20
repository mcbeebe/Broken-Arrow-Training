import { describe, it, expect } from 'vitest'
import { generateGeneralFitnessPlan } from '../../../engines/generalFitness'
import { GOAL_PRESETS } from '../../../engines/generalFitness/presets'
import type { OnboardingConfig, GeneralGoal, MenopauseStatus } from '../../../hooks/useOnboarding'

const TODAY = '2026-06-08'
const GOALS: GeneralGoal[] = ['stay_healthy', 'lose_fat', 'build_muscle', 'build_endurance']

function makeConfig(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'general',
    raceName: 'My Fitness Plan',
    raceDate: '',
    generalGoal: 'stay_healthy',
    cardioModality: 'running',
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5,
    longRunDay: 'Saturday',
    wearable: 'none',
    athleteName: 'Test',
    age: 50,
    maxHR: 175,
    completedAt: '',
    ...overrides,
  }
}

describe('generateGeneralFitnessPlan — menopause overlay', () => {
  describe('strength bone-loading (Strong for bone; volume preserved)', () => {
    it.each(GOALS)('adds a heavy bone finisher on %s without dropping the goal volume', goal => {
      const plan = generateGeneralFitnessPlan(
        makeConfig({ generalGoal: goal, menopauseStatus: 'postmenopause' }),
        TODAY,
      )
      const week1 = plan.weeks[0] // never a deload week
      const strength = week1.days.find(d => d.type === 'strength' && !/STRENGTH BENCHMARK/i.test(d.workout))!
      expect(strength.workout).toContain('+ bone')
      expect(strength.detail).toContain('load bone')
      // The goal's own set count is still present → volume not reduced.
      expect(strength.detail).toContain(`${GOAL_PRESETS[goal].strengthSetsN}×`)
    })
  })

  it('renders the hard day as SIT (replacing VO₂max intervals) on full weeks', () => {
    const plan = generateGeneralFitnessPlan(
      makeConfig({ generalGoal: 'stay_healthy', menopauseStatus: 'perimenopause' }),
      TODAY,
    )
    const week1 = plan.weeks[0]
    const sit = week1.days.find(d => d.workout === 'Sprint intervals (SIT)')
    expect(sit).toBeTruthy()
    expect(sit!.detail).toContain('20s near-max')
    expect(week1.days.some(d => d.workout === 'VO₂max intervals')).toBe(false)
  })

  it('applies to the premenopausal stage too (build-the-base)', () => {
    const plan = generateGeneralFitnessPlan(
      makeConfig({ generalGoal: 'stay_healthy', menopauseStatus: 'premenopause' }),
      TODAY,
    )
    const week1 = plan.weeks[0]
    expect(week1.focus).toContain('Midlife tuning')
    expect(week1.days.some(d => d.workout.includes('+ bone'))).toBe(true)
    expect(week1.days.some(d => d.workout === 'Sprint intervals (SIT)')).toBe(true)
  })

  it('surfaces the midlife tuning rationale on the week-1 focus', () => {
    const plan = generateGeneralFitnessPlan(makeConfig({ menopauseStatus: 'menopause' }), TODAY)
    expect(plan.weeks[0].focus).toContain('Midlife tuning')
  })

  describe('recovery nudge is keyed to symptoms, not status', () => {
    it('appears when sleep/energy symptoms are reported', () => {
      const plan = generateGeneralFitnessPlan(
        makeConfig({ menopauseStatus: 'postmenopause', menopauseSymptoms: ['sleep_disruption'] }),
        TODAY,
      )
      expect(plan.weeks[0].focus).toContain('Recovery:')
    })

    it('is absent when only non-recovery symptoms are reported', () => {
      const plan = generateGeneralFitnessPlan(
        makeConfig({ menopauseStatus: 'postmenopause', menopauseSymptoms: ['hot_flashes'] }),
        TODAY,
      )
      expect(plan.weeks[0].focus).toContain('Midlife tuning') // overlay still active
      expect(plan.weeks[0].focus).not.toContain('Recovery:')
    })
  })

  it('does not shorten the deload cadence — week 4 keeps the gentler protocol', () => {
    const plan = generateGeneralFitnessPlan(
      makeConfig({ generalGoal: 'stay_healthy', menopauseStatus: 'postmenopause' }),
      TODAY,
    )
    const deload = plan.weeks[3] // DELOAD_EVERY = 4
    expect(deload.focus).toContain('Deload week')
    expect(deload.days.some(d => d.workout.includes('+ bone'))).toBe(false)
    expect(deload.days.some(d => d.workout === 'Sprint intervals (SIT)')).toBe(false)
  })

  describe('no overlay without a disclosed stage', () => {
    const NON_STAGES: (MenopauseStatus | undefined)[] = ['not_applicable', 'prefer_not_to_say', undefined]
    it.each(NON_STAGES)('leaves the plan untouched for status=%s', status => {
      const plan = generateGeneralFitnessPlan(
        makeConfig(status ? { menopauseStatus: status } : {}),
        TODAY,
      )
      const week1 = plan.weeks[0]
      expect(week1.focus).not.toContain('Midlife tuning')
      expect(week1.days.some(d => d.workout.includes('+ bone'))).toBe(false)
      expect(week1.days.some(d => d.workout === 'Sprint intervals (SIT)')).toBe(false)
      // Baseline strength label is unchanged.
      expect(week1.days.some(d => d.type === 'strength' && d.workout === 'Strength — full body')).toBe(true)
    })
  })
})
