/**
 * The "Here's your week" step: registered with a telemetry name, placed
 * after the answers it is built from, optional (untouched → no weekShape
 * on the config, so the engines' own layout and the ground truth stand),
 * and an edited layout lands on the config.
 */
import { describe, it, expect } from 'vitest'
import { ALL_STEPS, STEP_NAMES, STEP_WEEK_SHAPE, STEP_STRENGTH, STEP_DAYS, STEP_VARIANT, STEP_SCHEDULE, visibleSteps } from '../components/onboarding/steps'

describe('the week-shape step', () => {
  it('is named, sits after days / long-run day / strength and before schedule, and is shown to everyone', () => {
    expect(STEP_NAMES[STEP_WEEK_SHAPE]).toBe('week_shape')
    const i = ALL_STEPS.indexOf(STEP_WEEK_SHAPE)
    expect(i).toBeGreaterThan(ALL_STEPS.indexOf(STEP_DAYS))
    expect(i).toBeGreaterThan(ALL_STEPS.indexOf(STEP_VARIANT))
    expect(i).toBeGreaterThan(ALL_STEPS.indexOf(STEP_STRENGTH))
    expect(i).toBeLessThan(ALL_STEPS.indexOf(STEP_SCHEDULE))
    for (const v of [{ raceType: 'trail', goalMode: 'race' as const }, { raceType: 'hyrox', goalMode: 'race' as const }, { raceType: 'general', goalMode: 'general' as const }]) {
      expect(visibleSteps(v)).toContain(STEP_WEEK_SHAPE)
    }
  })
})
