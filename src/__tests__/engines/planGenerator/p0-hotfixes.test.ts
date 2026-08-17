/**
 * P0 correctness hotfixes — regression tests for the defects found in the
 * 2026-08-16 generated plan review (docs: product plan, P0.3 / P0.5).
 * The Mike scenario: Roche SWAP, half marathon, easy-pace anchor 9:30/mi.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import type { TrainingMethod } from '../../../types/training-method'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import rocheMethod from '../../../data/methods/roche_swap.json'

const roche = rocheMethod as unknown as TrainingMethod
const TODAY = '2026-08-16'

function mikeConfig(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'trail',
    raceName: 'Oakland Hills Trail Run',
    raceDate: '2026-10-24', // 10 weeks out — reproduces the v1 runway
    raceDistance: 'half_marathon',
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5,
    longRunDay: 'Sunday',
    wearable: 'garmin',
    athleteName: 'Mike',
    age: 45,
    maxHR: 200,
    fitnessAnchor: { type: 'easy_pace', valueSeconds: 9 * 60 + 30 },
    completedAt: '',
    ...overrides,
  }
}

const parseTime = (t: string): [number, number] => {
  const range = t.match(/(\d+)-(\d+)\s*min/)
  if (range) return [parseInt(range[1]), parseInt(range[2])]
  const single = t.match(/(\d+)\s*min/)
  return single ? [parseInt(single[1]), parseInt(single[1])] : [0, 0]
}

describe('P0.3 — no method-wide placeholder duration ranges', () => {
  it('never emits a duration range wider than 1.5x on any running day', () => {
    const plan = generatePlanFromMethod(roche, mikeConfig(), TODAY)
    for (const week of plan.weeks) {
      for (const day of week.days) {
        if (!day.time || !day.plannedWorkout) continue
        const [lo, hi] = parseTime(day.time)
        if (lo === 0) continue
        expect(hi / lo, `${week.focus} ${day.day} "${day.workout}" shows ${day.time}`).toBeLessThanOrEqual(1.5)
      }
    }
  })

  it('the v1 "30-90 min" Wednesday bug does not reproduce', () => {
    const plan = generatePlanFromMethod(roche, mikeConfig(), TODAY)
    const offenders = plan.weeks.flatMap(w =>
      w.days.filter(d => d.time === '30-90 min').map(d => `${w.focus} ${d.day}`))
    expect(offenders).toEqual([])
  })
})

describe('P0.5 — taper volume sanity', () => {
  it('taper weeks never exceed the final build week and step down monotonically', () => {
    const plan = generatePlanFromMethod(roche, mikeConfig(), TODAY)
    const weeks = plan.weeks
    const taperStart = weeks.findIndex(w => /taper/i.test(w.focus))
    expect(taperStart).toBeGreaterThan(0)
    const lastBuildMi = weeks[taperStart - 1].miles
    let prev = lastBuildMi
    for (let i = taperStart; i < weeks.length; i++) {
      expect(weeks[i].miles, `week ${i + 1} (${weeks[i].focus})`).toBeLessThanOrEqual(prev + 0.01)
      prev = weeks[i].miles
    }
  })
})
