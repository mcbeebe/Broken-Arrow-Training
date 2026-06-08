import { describe, it, expect } from 'vitest'
import { generateGeneralFitnessPlan } from '../../../engines/generalFitness'
import { getGeneralFitnessCoaching } from '../../../engines/generalFitness/coaching'
import { getCoaching } from '../../../utils/coaching'
import { parseRoutine } from '../../../utils/exercises'
import { buildMethodologyContext } from '../../../utils/methodologyContext'
import type { OnboardingConfig, GeneralGoal } from '../../../hooks/useOnboarding'
import type { PlannedDay } from '../../../types'

const TODAY = '2026-06-08'

function makeConfig(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'general',
    raceName: 'My Fitness Plan',
    raceDate: '',
    generalGoal: 'stay_healthy',
    cardioModality: 'running',
    experienceLevel: 'beginner',
    trainingDaysPerWeek: 4,
    longRunDay: 'Saturday',
    wearable: 'none',
    athleteName: 'Test',
    age: 55,
    maxHR: 165,
    completedAt: '',
    ...overrides,
  }
}

const GOALS: GeneralGoal[] = ['stay_healthy', 'lose_fat', 'build_muscle', 'build_endurance']

// Tokens that would mean trail-race / mountain copy leaked into a General
// Fitness surface. "race" alone is allowed ("a prescription, not a race"); we
// ban the race-SPECIFIC phrases.
const RACE_TOKENS = [
  /mountain/i,
  /uphill athlete/i,
  /3,?800/,
  /shirley/i,
  /siberia/i,
  /broken arrow/i,
  /\bdescent\b/i,
  /\baltitude\b/i,
  /\bpoles\b/i,
  /race day/i,
  /race-specific/i,
]

function assertNoRaceTokens(text: string) {
  for (const re of RACE_TOKENS) {
    expect(text, `expected no race token ${re} in: ${text}`).not.toMatch(re)
  }
}

describe('General Fitness — strength exercises resolve to form-cue guides', () => {
  // Regression for "No detailed guide available for this exercise yet": every
  // exercise the engine emits on a strength day must match a guide.
  for (const goal of GOALS) {
    it(`${goal}: every strength exercise has a guide`, () => {
      const plan = generateGeneralFitnessPlan(makeConfig({ generalGoal: goal }), TODAY)
      const strengthDays = plan.weeks.flatMap(w => w.days).filter(d => d.type === 'strength')
      expect(strengthDays.length).toBeGreaterThan(0)
      for (const day of strengthDays) {
        const parsed = parseRoutine(day.detail)
        expect(parsed.length).toBeGreaterThanOrEqual(6) // squat/hinge/pull/push/carry/core
        for (const ex of parsed) {
          expect(ex.guide, `no guide for "${ex.name}" in: ${day.detail}`).not.toBeNull()
        }
      }
    })
  }
})

describe('General Fitness — coaching is goal-aware and race-free', () => {
  for (const goal of GOALS) {
    it(`${goal}: no day's coaching leaks mountain/race copy`, () => {
      const plan = generateGeneralFitnessPlan(makeConfig({ generalGoal: goal }), TODAY)
      const days = plan.weeks.flatMap(w => w.days)
      for (const day of days) {
        const c = getGeneralFitnessCoaching(day, goal, 'beginner')
        const blob = [c.title, c.purpose, ...c.execution, c.mindset, c.nutrition, c.recovery].join(' \n ')
        assertNoRaceTokens(blob)
      }
    })
  }

  it('routes through getCoaching when generalGoal is supplied', () => {
    const plan = generateGeneralFitnessPlan(makeConfig({ generalGoal: 'lose_fat' }), TODAY)
    const strength = plan.weeks[0].days.find(d => d.type === 'strength')!
    const viaGet = getCoaching(strength, 1, { generalGoal: 'lose_fat', experienceLevel: 'beginner' })
    const direct = getGeneralFitnessCoaching(strength, 'lose_fat', 'beginner')
    expect(viaGet).toEqual(direct)
  })

  it('carries goal-specific flavor (lose_fat strength → deficit/fat)', () => {
    const strength: PlannedDay = { day: 'Mon', type: 'strength', workout: 'Strength — full body', detail: '', zone: '', route: '', time: '' }
    const c = getGeneralFitnessCoaching(strength, 'lose_fat', 'beginner')
    expect(`${c.purpose} ${c.mindset}`.toLowerCase()).toMatch(/deficit|fat|muscle/)
  })

  it('leaves the race coaching path unchanged when no generalGoal', () => {
    // A strength day with no goal context still gets the trail-race narrative.
    const strength: PlannedDay = { day: 'Mon', type: 'strength', workout: 'STRENGTH', detail: '', zone: '', route: '', time: '' }
    const c = getCoaching(strength, 1)
    expect(c.purpose).toMatch(/mountain/i)
  })
})

describe('General Fitness — methodology context discriminator', () => {
  it('marks a general plan as goalKind "general" with a goal label', () => {
    const plan = generateGeneralFitnessPlan(makeConfig({ generalGoal: 'build_muscle' }), TODAY)
    const ctx = buildMethodologyContext(plan)
    expect(ctx.goalKind).toBe('general')
    expect(ctx.generalGoal).toBe('build_muscle')
    expect(ctx.generalGoalLabel).toBe('Build Muscle')
  })

  it('a plan without generalGoal stays goalKind "race"', () => {
    const plan = generateGeneralFitnessPlan(makeConfig(), TODAY)
    const racey = { ...plan, generalGoal: undefined }
    const ctx = buildMethodologyContext(racey)
    expect(ctx.goalKind).toBe('race')
    expect(ctx.generalGoalLabel).toBeUndefined()
  })
})
