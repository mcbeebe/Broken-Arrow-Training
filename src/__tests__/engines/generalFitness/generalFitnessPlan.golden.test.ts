import { describe, it, expect } from 'vitest'
import { generateGeneralFitnessPlan } from '../../../engines/generalFitness'
import type { OnboardingConfig, GeneralGoal } from '../../../hooks/useOnboarding'

// Golden snapshots: pin the full generated plan for representative
// (goal × days/week × modality) cells. The engine is deterministic given
// (config, today), so these are stable across runs/timezones. They catch
// unintended output DRIFT; the invariant tests in
// generateGeneralFitnessPlan.test.ts assert MEANING. When the engine output
// changes on purpose, update with `npx vitest -u` and review the diff.
const TODAY = '2026-06-08'

function makeConfig(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'general',
    raceName: 'My Fitness Plan',
    raceDate: '',
    generalGoal: 'stay_healthy',
    cardioModality: 'running',
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 4,
    longRunDay: 'Saturday',
    wearable: 'none',
    athleteName: 'Test',
    age: 38,
    maxHR: 184,
    completedAt: '',
    ...overrides,
  }
}

const CASES: { name: string; cfg: Partial<OnboardingConfig> }[] = [
  { name: 'stay_healthy · 4 days · running', cfg: { generalGoal: 'stay_healthy' as GeneralGoal, trainingDaysPerWeek: 4, cardioModality: 'running' } },
  { name: 'lose_fat · 6 days · cycling', cfg: { generalGoal: 'lose_fat' as GeneralGoal, trainingDaysPerWeek: 6, cardioModality: 'cycling' } },
  { name: 'build_muscle · 4 days · mixed', cfg: { generalGoal: 'build_muscle' as GeneralGoal, trainingDaysPerWeek: 4, cardioModality: 'mixed' } },
  { name: 'build_endurance · 5 days · rowing', cfg: { generalGoal: 'build_endurance' as GeneralGoal, trainingDaysPerWeek: 5, cardioModality: 'rowing' } },
  { name: 'stay_healthy · 3 days · beginner · swimming', cfg: { generalGoal: 'stay_healthy' as GeneralGoal, trainingDaysPerWeek: 3, experienceLevel: 'beginner', cardioModality: 'swimming' } },
  { name: 'build_endurance · 5 days · ~8-week horizon', cfg: { generalGoal: 'build_endurance' as GeneralGoal, trainingDaysPerWeek: 5, raceDate: '2026-08-03' } },
]

describe('generateGeneralFitnessPlan — golden snapshots', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const plan = generateGeneralFitnessPlan(makeConfig(c.cfg), TODAY)
      expect(plan).toMatchSnapshot()
    })
  }
})
