/**
 * Field bug: "the updates pushed my start date for my plan to next week."
 *
 * Both engines counted runway from `today`, so every passing week dropped
 * a week off the front and slid week 1 forward — the plan re-anchored
 * under the athlete, weekly, forever. Pinning the first-week Monday once
 * makes the plan hold still; the athlete advances through it instead.
 */
import { describe, it, expect } from 'vitest'
import { generateHyroxPlan } from '../utils/planGenerator'
import { generatePlanFromMethod } from '../engines/planGenerator/generatePlan'
import { getMethodById } from '../data/methods'
import { effectivePlanStart, mondayOnOrBefore } from '../utils/planDates'
import { PERSONAS, buildConfig } from './helpers/roadPersonas'
import type { OnboardingConfig } from '../hooks/useOnboarding'

const hyrox = (over: Partial<OnboardingConfig> = {}) => ({
  raceType: 'hyrox', raceName: 'Anaheim Hyrox', raceDate: '2026-11-30',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 5, longRunDay: 'Saturday',
  wearable: 'garmin', athleteName: 'Mike', age: 45, maxHR: 200,
  equipmentAccess: ['gym'], completedAt: '', ...over,
} as OnboardingConfig)

const carmen = PERSONAS.find(p => p.label.startsWith('Carmen'))!
const WEEKS_LATER = ['2026-08-17', '2026-08-20', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-21']

describe('mondayOnOrBefore', () => {
  it('lands on the Monday of the given week, including from a Sunday', () => {
    expect(mondayOnOrBefore('2026-08-17')).toBe('2026-08-17') // Mon
    expect(mondayOnOrBefore('2026-08-20')).toBe('2026-08-17') // Thu
    expect(mondayOnOrBefore('2026-08-23')).toBe('2026-08-17') // Sun — not next Monday
    expect(mondayOnOrBefore('2026-08-24')).toBe('2026-08-24')
  })
})

describe('a pinned start beats the clock', () => {
  it('wins even when it is in the past — that is what pinning means', () => {
    expect(effectivePlanStart(undefined, '2026-09-07', '2026-08-17')).toBe('2026-08-17')
    // Without a pin, the old forward-clamp behaviour is unchanged.
    expect(effectivePlanStart(undefined, '2026-09-07')).toBe('2026-09-07')
    expect(effectivePlanStart('2026-10-01', '2026-09-07')).toBe('2026-10-01')
  })
})

describe('the plan holds still once pinned', () => {
  it('Hyrox: same start and same week count, five weeks apart', () => {
    const cfg = hyrox({ planStartPinnedIso: '2026-08-17' })
    const seen = WEEKS_LATER.map(today => {
      const p = generateHyroxPlan(cfg, today)
      return `${p.weeks[0].startIso}/${p.weeks.length}`
    })
    expect(new Set(seen).size, `plan drifted: ${seen.join(', ')}`).toBe(1)
    expect(seen[0].startsWith('2026-08-17')).toBe(true)
  })

  it('road: same start and same week count, five weeks apart', () => {
    const cfg = { ...buildConfig(carmen, 16), planStartPinnedIso: '2026-08-17' } as OnboardingConfig
    const seen = WEEKS_LATER.map(today => {
      const p = generatePlanFromMethod(getMethodById('pfitzinger')!, cfg, today)
      return `${p.weeks[0].startIso}/${p.weeks.length}`
    })
    expect(new Set(seen).size, `plan drifted: ${seen.join(', ')}`).toBe(1)
  })

  it('WITHOUT a pin both engines still drift — the bug this fixes', () => {
    const hy = WEEKS_LATER.map(t => generateHyroxPlan(hyrox(), t).weeks[0].startIso)
    expect(new Set(hy).size).toBeGreaterThan(1)
    const rd = WEEKS_LATER.map(t =>
      generatePlanFromMethod(getMethodById('pfitzinger')!, buildConfig(carmen, 16), t).weeks[0].startIso)
    expect(new Set(rd).size).toBeGreaterThan(1)
  })

  it('the pinned week covers the day the athlete pinned on', () => {
    // Pinned mid-week (Thursday → that Monday): week 1 contains Thursday.
    const cfg = hyrox({ planStartPinnedIso: mondayOnOrBefore('2026-08-20') })
    const w1 = generateHyroxPlan(cfg, '2026-08-20').weeks[0]
    expect(w1.startIso).toBe('2026-08-17')
    expect(w1.days.length).toBe(7)
  })

  it('race day still lands on race day', () => {
    const cfg = hyrox({ planStartPinnedIso: '2026-08-17' })
    const plan = generateHyroxPlan(cfg, '2026-09-07')
    const last = plan.weeks[plan.weeks.length - 1]
    expect(last.days.some(d => d.type === 'race')).toBe(true)
  })
})
