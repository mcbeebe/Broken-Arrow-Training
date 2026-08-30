/**
 * The rhythm strip against a plan the generator actually produced.
 *
 * Running the app revealed the strip never rendered for the seed athletes:
 * the hand-authored demo plans carry only human dates ('Apr 13–19') and no
 * startIso, so buildRhythm correctly declines to guess and returns nothing.
 * That is the right call — guessing the year is the field bug the type
 * comment warns about — but it left the feature unproven end to end.
 *
 * This asserts it works on the path real athletes are on.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../engines/planGenerator/generatePlan'
import { getMethodById } from '../data/methods'
import { buildRhythm, resolvedCount } from '../utils/rhythm'
import { PERSONAS, buildConfig, TODAY } from './helpers/roadPersonas'

const carmen = PERSONAS.find(p => p.label.startsWith('Carmen'))!
const plan = () => generatePlanFromMethod(getMethodById('pfitzinger')!, buildConfig(carmen, 16), TODAY)

describe('a generated plan', () => {
  it('stamps every week with a date anchor, which the strip depends on', () => {
    const weeks = plan().weeks
    expect(weeks.length).toBeGreaterThan(0)
    for (const w of weeks) expect(w.startIso, `week ${w.num}`).toBeTruthy()
  })

  it('produces a real strip for a day inside the plan', () => {
    const weeks = plan().weeks
    // A date a fortnight into the plan, so there is history behind it.
    const start = new Date(`${weeks[0].startIso}T12:00:00`)
    start.setDate(start.getDate() + 14)
    const iso = start.toISOString().slice(0, 10)

    const strip = buildRhythm(weeks, iso)
    expect(strip.length).toBeGreaterThan(0)
    expect(strip[strip.length - 1].state).toBe('today')
    expect(strip.every(d => d.iso <= iso)).toBe(true)
  })

  it('counts nothing as resolved on a plan with no logged sessions', () => {
    // Freshly generated: every past day is planned work nobody has done, so
    // the strip should show them open rather than quietly resolved.
    const weeks = plan().weeks
    const start = new Date(`${weeks[0].startIso}T12:00:00`)
    start.setDate(start.getDate() + 10)
    const strip = buildRhythm(weeks, start.toISOString().slice(0, 10))
    const { resolved, of } = resolvedCount(strip)
    expect(of).toBeGreaterThan(0)
    // Only planned rest days count as resolved without an activity.
    expect(resolved).toBe(strip.filter(d => d.state === 'rest').length)
  })
})

describe('a hand-authored legacy plan', () => {
  it('degrades to no strip rather than mis-dating days', () => {
    const legacy = [{ num: 1, dates: 'Apr 13–19', miles: 9, focus: '', days: [] }]
    expect(buildRhythm(legacy, '2026-06-10')).toEqual([])
  })
})
