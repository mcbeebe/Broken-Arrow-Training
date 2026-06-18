/**
 * Feasibility advisories — assertions that the engine tells the athlete the
 * truth (goal realism, runway, goal-derived paces, cross-distance) and suggests
 * a realistic alternative rather than silently shipping a wrong plan.
 */
import { describe, it, expect } from 'vitest'
import { assessFeasibility, predictRaceTime } from '../../../engines/planGenerator/feasibility'
import { vdotFromRace } from '../../../engines/planGenerator/vdot'
import type { TrainingMethod } from '../../../types/training-method'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'

import danielsMethod from '../../../data/methods/daniels.json'
import koopMethod from '../../../data/methods/koop.json'

const daniels = danielsMethod as unknown as TrainingMethod
const koop = koopMethod as unknown as TrainingMethod
const TODAY = '2026-06-14'

function cfg(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'trail',
    raceName: 'Test',
    raceDate: '2026-10-18', // ~18 weeks out
    raceDistance: 'marathon',
    experienceLevel: 'advanced',
    trainingDaysPerWeek: 5,
    wearable: 'none',
    athleteName: 'Test',
    age: 34,
    completedAt: '',
    ...overrides,
  }
}
const ids = (c: OnboardingConfig, m?: TrainingMethod) => assessFeasibility(c, TODAY, m).map(a => a.id)

describe('predictRaceTime', () => {
  it('inverts vdotFromRace (round-trips a marathon time)', () => {
    const seconds = 10800 // 3:00
    const v = vdotFromRace({ distanceMiles: 26.2, timeSeconds: seconds })
    expect(predictRaceTime(v, 26.2)).toBeCloseTo(seconds, -1) // within ~5s
  })
})

describe('assessFeasibility', () => {
  it('flags a goal entered without a recent result', () => {
    const a = assessFeasibility(cfg({ goalRaceTimeSeconds: 10200 }), TODAY) // 2:50, no anchor
    expect(a.map(x => x.id)).toContain('goal_no_anchor')
    expect(a.find(x => x.id === 'goal_no_anchor')!.severity).toBe('info')
  })

  it('warns on an ambitious goal AND suggests a realistic time', () => {
    const a = assessFeasibility(
      cfg({ currentWeeklyMileage: 15, fitnessAnchor: { type: 'race_marathon', valueSeconds: 11400 }, goalRaceTimeSeconds: 10200 }),
      TODAY,
    )
    const goal = a.find(x => x.id === 'goal_ambitious')
    expect(goal).toBeTruthy()
    expect(goal!.suggestion).toMatch(/\d:\d\d/) // contains a concrete h:mm(:ss) alternative
  })

  it('does NOT warn for a realistic goal off a solid base', () => {
    const a = ids(cfg({ currentWeeklyMileage: 55, fitnessAnchor: { type: 'race_marathon', valueSeconds: 11100 }, goalRaceTimeSeconds: 10680 }))
    expect(a).not.toContain('goal_ambitious')
    expect(a).not.toContain('ultra_experience')
  })

  it('flags a beginner pointed at an ultra with a realistic alternative', () => {
    const a = assessFeasibility(cfg({ raceDistance: '100_mile', experienceLevel: 'beginner', currentWeeklyMileage: 12, raceDate: '2026-12-13' }), TODAY, koop)
    const u = a.find(x => x.id === 'ultra_experience')
    expect(u).toBeTruthy()
    expect(u!.severity).toBe('critical')
    expect(u!.suggestion).toBeTruthy()
  })

  it('flags cross-distance pace extrapolation (5K anchor → marathon)', () => {
    const a = ids(cfg({ fitnessAnchor: { type: 'race_5k', valueSeconds: 19 * 60 } }))
    expect(a).toContain('cross_distance')
  })

  it('flags a tight runway when the race is sooner than the method minimum', () => {
    const a = assessFeasibility(cfg({ raceDate: '2026-06-28' }), TODAY, daniels) // ~2 weeks; daniels min = 8
    const r = a.find(x => x.id === 'runway_short')
    expect(r).toBeTruthy()
    expect(r!.severity).toBe('critical') // < 4 weeks
  })

  it('does not flag runway when there is ample time', () => {
    const a = ids(cfg({ raceDate: '2026-10-18' }), daniels) // ~18 weeks
    expect(a).not.toContain('runway_short')
  })
})
