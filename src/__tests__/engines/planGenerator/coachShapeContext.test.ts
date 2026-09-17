/**
 * What the coach sees of the week's layout: the shape in force this week
 * (the athlete's own, or the engine's — and it says which), the plan's
 * week span, and the roles in the plan family's words.
 */
import { describe, it, expect } from 'vitest'
import { buildCoachWeekShapeContext } from '../../../engines/planGenerator/coachShapeContext'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'

const config = {
  raceType: 'road', raceName: 'Test Half', raceDate: '2026-11-15', raceDistance: 'half_marathon',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 5, longRunDay: 'Sunday', selectedMethodId: 'daniels',
  wearable: 'none', athleteName: 'Test', age: 38, maxHR: 184, completedAt: '2026-06-01T00:00:00Z',
} as OnboardingConfig

describe('buildCoachWeekShapeContext', () => {
  it('describes the engine\'s own layout when the athlete has not reshaped, with the long run on the chosen day', () => {
    const ctx = buildCoachWeekShapeContext(config, 4, 18)!
    expect(ctx.athleteShaped).toBe(false)
    expect(ctx.shape[7]).toBe('long')
    expect(ctx.current).toMatch(/Sun long run$/)
    expect(ctx.currentWeekNum).toBe(4)
    expect(ctx.lastWeekNum).toBe(18)
    expect(ctx.roles.find(r => r.role === 'cross')?.label).toBe('Cross-train')
  })

  it('describes the athlete\'s reshape once one is in force for the current week, in the plan family\'s words', () => {
    const hyrox = {
      ...config, raceType: 'hyrox', raceDistance: undefined, selectedMethodId: undefined, raceDate: '2026-12-12',
      weekReshapes: [{ fromWeek: 3, shape: { 1: 'run', 2: 'strength', 3: 'cross', 4: 'rest', 5: 'quality', 6: 'rest', 7: 'long' }, at: 1 }],
    } as OnboardingConfig
    expect(buildCoachWeekShapeContext(hyrox, 2, 12)!.athleteShaped).toBe(false)
    const ctx = buildCoachWeekShapeContext(hyrox, 3, 12)!
    expect(ctx.athleteShaped).toBe(true)
    expect(ctx.current).toBe('Mon easy run · Tue strength · Wed stations · Thu rest · Fri run intervals · Sat rest · Sun long / simulation')
  })
})
