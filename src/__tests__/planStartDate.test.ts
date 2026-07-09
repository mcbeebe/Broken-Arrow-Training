import { describe, it, expect } from 'vitest'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import type { RaceInfo, SeasonRace } from '../types'
import { effectivePlanStart, parseDayToDate } from '../utils/planDates'
import { generatePlanFromMethod } from '../engines/planGenerator/generatePlan'
import { generateHyroxPlan } from '../utils/planGenerator'
import { generateGeneralFitnessPlan } from '../engines/generalFitness'
import { getMethodById } from '../data/methods'
import { planSeason } from '../engines/season/planSeason'
import { spliceSeasonWeeks } from '../engines/season/spliceSeason'

/**
 * Plan-start control: the athlete chooses when week 1 begins. The clamp is
 * one-way (a past start never back-dates a regenerated plan), all three
 * generators honor it, and the season splice deliberately strips it —
 * subsequent blocks start when the state machine says they start.
 */

const TODAY = '2026-07-10'

const base = {
  raceType: 'road', raceName: 'Fall Half', raceDate: '2026-10-24',
  raceDistance: 'half_marathon', experienceLevel: 'intermediate',
  trainingDaysPerWeek: 5, longRunDay: 'saturday', wearable: 'none',
  athleteName: 'T', age: 40, maxHR: 180, completedAt: '',
} as OnboardingConfig

function firstIso(plan: { weeks: { days: { day: string }[] }[] }): string {
  for (const w of plan.weeks) {
    for (const d of w.days) {
      const iso = parseDayToDate(d.day)
      if (iso) return iso
    }
  }
  return ''
}

describe('effectivePlanStart', () => {
  it('future start wins; past/unset start clamps to today', () => {
    expect(effectivePlanStart('2026-08-01', TODAY)).toBe('2026-08-01')
    expect(effectivePlanStart('2026-06-01', TODAY)).toBe(TODAY)
    expect(effectivePlanStart(undefined, TODAY)).toBe(TODAY)
  })
})

describe('generators honor planStartDate', () => {
  it('method engine: week 1 begins no earlier than the chosen start, runway shrinks', () => {
    const method = getMethodById('daniels')!
    const now = generatePlanFromMethod(method, base, TODAY)
    const delayed = generatePlanFromMethod(
      method, { ...base, planStartDate: '2026-08-10' }, TODAY)
    // The delayed plan starts in the week containing the chosen start
    // (weeks are Monday-anchored, 8/10 IS a Monday).
    expect(firstIso(delayed) >= '2026-08-10').toBe(true)
    expect(delayed.weeks.length).toBeLessThan(now.weeks.length)
  })

  it('GUARD: a stale PAST start date never back-dates a regenerated plan', () => {
    const method = getMethodById('daniels')!
    const stale = generatePlanFromMethod(
      method, { ...base, planStartDate: '2026-05-01' }, TODAY)
    const normal = generatePlanFromMethod(method, base, TODAY)
    expect(stale.weeks.length).toBe(normal.weeks.length)
    expect(firstIso(stale)).toBe(firstIso(normal))
  })

  it('Hyrox engine: delayed start compresses toward race day with the honest advisory', () => {
    const cfg = { ...base, raceType: 'hyrox', raceDate: '2026-10-24', raceDistance: undefined, planStartDate: '2026-09-19' } as OnboardingConfig
    const plan = generateHyroxPlan(cfg, TODAY)
    expect(firstIso(plan) >= '2026-09-13').toBe(true) // week containing the start
    expect(plan.weeks.length).toBeLessThanOrEqual(5)
    expect(plan.advisories?.some(a => a.id === 'runway_short')).toBe(true)
  })

  it('General Fitness: the rolling block begins at the chosen start', () => {
    const cfg = { ...base, raceType: 'general', raceDate: '', raceDistance: undefined, generalGoal: 'stay_healthy', planStartDate: '2026-08-03' } as OnboardingConfig
    const plan = generateGeneralFitnessPlan(cfg, TODAY)
    expect(firstIso(plan) >= '2026-08-03').toBe(true)
  })
})

describe('season splice strips planStartDate (subsequent blocks obey the state machine)', () => {
  function sr(id: string, info: Partial<RaceInfo>): SeasonRace {
    return {
      id, priority: 'A', status: 'upcoming',
      raceInfo: {
        name: 'R', date: '2026-10-24', startTime: '', distance: '', distanceMiles: 13.1,
        elevation: '', elevationRange: '', course: '', cutoff: '',
        landmarks: [], gear: [], nutrition: '', ...info,
      },
    }
  }

  it('a far-future anchor start does not starve the second race of its build', () => {
    const races = [
      sr('half', { name: 'Half', date: '2026-10-24' }),
      sr('hyrox', { name: 'Hyrox LA', date: '2026-12-12', distance: 'Hyrox', distanceMiles: 8 }),
    ]
    const result = planSeason(races, TODAY)
    const cfg = { ...base, selectedMethodId: 'daniels', planStartDate: '2026-08-10' } as OnboardingConfig
    const spliced = spliceSeasonWeeks(
      [{ num: 1, dates: 'Aug 10-16', miles: 20, focus: 'Half build', days: [] }],
      result, cfg, TODAY,
    )
    // If planStartDate leaked into the Hyrox block config, its build would
    // collapse to ~1 week. It must get its full block-driven runway.
    const hyroxWeeks = spliced.filter(w => w.focus.includes('Hyrox LA'))
    expect(hyroxWeeks.length).toBeGreaterThanOrEqual(4)
  })
})
