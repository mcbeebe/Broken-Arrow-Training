import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { getMethodById } from '../../../data/methods'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import type { TrainingPlan } from '../../../types'

/**
 * Decision 6a — when a method's running minimum fills the week, the method
 * wins AND the athlete is told it won.
 *
 * The plan used to tell a 4-day athlete on a 5-day-minimum method:
 *
 *   "Pfitzinger needs at least 5 running days, and you asked for
 *    strength/cross-training too — so weeks run 6 days instead of 4."
 *
 * over a plan containing zero strength days and zero cross days, whose weeks
 * ran five days. Every clause of it was false. The per-week clamp
 * (`weekMaxExtras`) can be 0 in every single week while the plan-level
 * budget (`extrasCap`) stays 1, and only the budget was ever read.
 *
 * The behaviour is deliberately unchanged — re-tuning day budgets across
 * nine methods is its own piece of work, and the code comment there notes
 * that silently dropping the strength day "was its own field bug". What
 * changes is that the plan now describes itself.
 */

const TODAY = '2026-09-07' // a Monday

const config = (over: Partial<OnboardingConfig>): OnboardingConfig => ({
  athleteName: 'X', age: 35, sex: 'male', wearable: 'garmin',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 4,
  longRunDay: 'Sunday', equipmentAccess: ['gym'], completedAt: '',
  raceType: 'road', raceName: 'Test Marathon', raceDate: '2026-12-26',
  raceDistance: 'marathon', maxHR: 185, currentWeeklyMileage: 30,
  ...over,
} as unknown as OnboardingConfig)

const gen = (methodId: string, over: Partial<OnboardingConfig>): TrainingPlan =>
  generatePlanFromMethod(getMethodById(methodId)!, config({ selectedMethodId: methodId, ...over }), TODAY)

const adv = (p: TrainingPlan, id: string) => (p.advisories ?? []).find(a => a.id === id)
const extraDays = (p: TrainingPlan) =>
  p.weeks.flatMap(w => w.days).filter(d => d.type === 'strength' || d.type === 'cross')

describe('the extras advisory describes the plan that was built', () => {
  it('a busy athlete whose strength never fits is told so, in those words', () => {
    // Pfitzinger's running floor already fills four days a week.
    const p = gen('pfitzinger', { trainingDaysPerWeek: 4, strengthDaysPerWeek: 2 })
    expect(extraDays(p)).toHaveLength(0)
    const a = adv(p, 'extras_did_not_fit')
    expect(a, 'the athlete got no strength and was not told').toBeDefined()
    expect(a!.severity).toBe('caution')
    expect(a!.detail).toContain('your plan has none')
    expect(a!.detail).toContain('Nothing in this plan is strength work')
    // And it says what would actually get it, rather than only what went wrong.
    expect(a!.suggestion).toMatch(/train \d+ days a week/)
  })

  it('and the old copy no longer claims the strength it did not schedule', () => {
    const p = gen('pfitzinger', { trainingDaysPerWeek: 4, strengthDaysPerWeek: 2 })
    const over = adv(p, 'days_over_request')
    if (over) {
      expect(over.detail).not.toContain('you asked for strength/cross-training too')
      expect(over.detail).not.toContain('drop the extras')
    }
  })

  it('GUARD: an athlete whose strength DOES fit is not told it did not', () => {
    const p = gen('higdon', { trainingDaysPerWeek: 6, strengthDaysPerWeek: 1 })
    expect(extraDays(p).length).toBeGreaterThan(0)
    expect(adv(p, 'extras_did_not_fit')).toBeUndefined()
  })

  it('GUARD: an athlete who asked for no extras is told nothing about extras', () => {
    const p = gen('pfitzinger', { trainingDaysPerWeek: 4, strengthDaysPerWeek: 0, crossTrainingDaysPerWeek: 0 })
    expect(adv(p, 'extras_did_not_fit')).toBeUndefined()
    expect(adv(p, 'extras_partial')).toBeUndefined()
  })

  it('the header day count matches the weeks the athlete actually gets', () => {
    // `runningDaysTarget + extrasCap` claimed the extras budget whether or
    // not a single extra day fitted — the "6 days/week" over a five-day plan.
    for (const [methodId, days, strength] of [
      ['pfitzinger', 4, 2], ['higdon', 6, 1], ['daniels', 5, 1], ['hansons', 5, 0],
    ] as const) {
      const p = gen(methodId, { trainingDaysPerWeek: days, strengthDaysPerWeek: strength })
      const claimed = Number(p.athlete.weeklyStructure.match(/(\d+)/)![1])
      const fullWeeks = p.weeks.slice(0, -1).filter(w => w.days.length === 7)
      const actual = fullWeeks.map(w => w.days.filter(d => d.type !== 'rest').length)
      expect(actual.length, `${methodId} has no full week to check`).toBeGreaterThan(0)
      // The claim has to be a week shape the plan really contains.
      expect(actual, `${methodId} claims ${claimed}/wk, weeks are ${JSON.stringify(actual)}`)
        .toContain(claimed)
    }
  })

  it('a partial outcome names the real number of weeks, never a range', () => {
    // Whichever personas land here, the sentence has to be arithmetic about
    // this plan — not "1–2 a week", which describes the algorithm.
    for (const [methodId, days] of [['higdon', 5], ['galloway', 4], ['daniels', 5]] as const) {
      const p = gen(methodId, { trainingDaysPerWeek: days, strengthDaysPerWeek: 1 })
      const partial = adv(p, 'extras_partial')
      if (!partial) continue
      const m = partial.detail.match(/appears in (\d+) of (\d+) weeks/)!
      expect(m).toBeTruthy()
      const weeksWithExtras = p.weeks.filter(w => w.days.some(d => d.type === 'strength' || d.type === 'cross')).length
      expect(Number(m[1])).toBe(weeksWithExtras)
      expect(Number(m[2])).toBe(p.weeks.length)
    }
  })
})
