import { describe, it, expect } from 'vitest'
import {
  ALL_STEPS, STEP_NAMES, stepName, visibleSteps, showsMenopauseStep,
  STEP_GOAL_MODE, STEP_RACE_TYPE, STEP_RACE_NAME, STEP_SEASON_RACES,
  STEP_GENERAL_GOAL, STEP_GENERAL_CARDIO, STEP_EXPERIENCE, STEP_PROFILE,
  STEP_MENOPAUSE, STEP_REVIEW,
} from '../components/onboarding/steps'

/**
 * The step registry used to live inside a 2700-line component, where the only
 * way to check a gate was to drive the whole flow through the DOM. Every rule
 * here is age-, sex- or mode-gated, and getting one wrong shows an athlete a
 * step that does not apply to them — or hides one that does.
 */

/** A first-time athlete training for one trail race: every gate at its default. */
const FIRST_TIMER = { raceType: 'trail', goalMode: 'race' as const }

describe('the step registry itself', () => {
  it('every step in the flow has a telemetry name', () => {
    // A raw `17` in an analytics rollup is unreadable, and stepName falls back
    // silently — so a step added to ALL_STEPS without a name would ship as
    // `step_17` and nobody would notice until the funnel was read.
    for (const s of ALL_STEPS) {
      expect(STEP_NAMES[s], `step ${s} has no telemetry name`).toBeTruthy()
    }
  })

  it('no two steps share a telemetry name', () => {
    // Two steps under one name silently merge in the funnel.
    const names = ALL_STEPS.map(s => STEP_NAMES[s])
    expect(new Set(names).size).toBe(names.length)
  })

  it('no step appears twice in the flow', () => {
    expect(new Set(ALL_STEPS).size).toBe(ALL_STEPS.length)
  })

  it('names an unknown step rather than throwing — instrumentation never breaks the flow', () => {
    expect(stepName(9999)).toBe('step_9999')
  })

  it('goal mode is always the first question and review is always the last', () => {
    expect(ALL_STEPS[0]).toBe(STEP_GOAL_MODE)
    expect(ALL_STEPS[ALL_STEPS.length - 1]).toBe(STEP_REVIEW)
  })
})

describe('visibleSteps — who sees what', () => {
  it('a first-time racer sees neither the general-fitness steps nor the season builder', () => {
    const steps = visibleSteps(FIRST_TIMER)
    expect(steps).not.toContain(STEP_GENERAL_GOAL)
    expect(steps).not.toContain(STEP_GENERAL_CARDIO)
    expect(steps).not.toContain(STEP_SEASON_RACES)
    expect(steps).toContain(STEP_RACE_TYPE)
    expect(steps).toContain(STEP_RACE_NAME)
  })

  it('general fitness swaps the race-type question for the goal questions', () => {
    const steps = visibleSteps({ raceType: 'general', goalMode: 'general' })
    expect(steps).toContain(STEP_GENERAL_GOAL)
    expect(steps).toContain(STEP_GENERAL_CARDIO)
    // Goal mode already fixed the race type; asking again is the redundancy.
    expect(steps).not.toContain(STEP_RACE_TYPE)
  })

  it('season mode adds the multi-race builder', () => {
    const steps = visibleSteps({ raceType: 'trail', goalMode: 'season' })
    expect(steps).toContain(STEP_SEASON_RACES)
    expect(steps).toContain(STEP_RACE_TYPE)
  })

  it('an account holder redoing onboarding never retypes who they are', () => {
    expect(visibleSteps({ ...FIRST_TIMER, hasProfilePrefill: true })).not.toContain(STEP_PROFILE)
    expect(visibleSteps(FIRST_TIMER)).toContain(STEP_PROFILE)
  })

  it('experience carries over on a redo', () => {
    expect(visibleSteps({ ...FIRST_TIMER, previousExperienceLevel: 'intermediate' }))
      .not.toContain(STEP_EXPERIENCE)
    expect(visibleSteps({ ...FIRST_TIMER, previousExperienceLevel: null }))
      .toContain(STEP_EXPERIENCE)
  })

  it('keeps flow order — hiding a step shifts nothing else', () => {
    const steps = visibleSteps({ ...FIRST_TIMER, hasProfilePrefill: true })
    const expected = ALL_STEPS.filter(s => steps.includes(s))
    expect([...steps]).toEqual([...expected])
  })
})

describe('the menopause gate', () => {
  it('opens at 38, not 40 — early perimenopause begins in the late 30s', () => {
    expect(showsMenopauseStep({ age: '37', sex: 'female' })).toBe(false)
    expect(showsMenopauseStep({ age: '38', sex: 'female' })).toBe(true)
    expect(showsMenopauseStep({ age: '52', sex: 'female' })).toBe(true)
  })

  it('an explicit male answer skips it outright', () => {
    expect(showsMenopauseStep({ age: '52', sex: 'male' })).toBe(false)
  })

  it('keeps the age default for anyone who did not answer sex', () => {
    // Hiding it from someone who declined to say is the worse error of the two.
    for (const sex of [undefined, null, 'prefer_not_to_say', 'not_applicable']) {
      expect(showsMenopauseStep({ age: '45', sex }), String(sex)).toBe(true)
    }
  })

  it('an unparseable or missing age reads as 0 and keeps the step hidden', () => {
    expect(showsMenopauseStep({ sex: 'female' })).toBe(false)
    expect(showsMenopauseStep({ age: '', sex: 'female' })).toBe(false)
    expect(showsMenopauseStep({ age: 'forty', sex: 'female' })).toBe(false)
  })

  it('the flow honours the same gate', () => {
    expect(visibleSteps({ ...FIRST_TIMER, age: '45', sex: 'female' })).toContain(STEP_MENOPAUSE)
    expect(visibleSteps({ ...FIRST_TIMER, age: '45', sex: 'male' })).not.toContain(STEP_MENOPAUSE)
    expect(visibleSteps(FIRST_TIMER)).not.toContain(STEP_MENOPAUSE)
  })
})
