/**
 * The compromised-running session (run→station→run) is the highest-
 * fidelity thing a Hyrox plan contains, and it was the one session with
 * no coaching branch of its own: the generator emits the base intro as
 * `type: 'cross'` and the build/peak version as `type: 'quality'`, so the
 * type-keyed dispatcher served it Station Circuit copy in one phase and
 * 1km Repeats copy in the other. Both described a different workout.
 *
 * These tests pin the routing by NAME across both phases, and pin the one
 * thing the copy must never lose: the transition is the session.
 */
import { describe, it, expect } from 'vitest'
import { generateHyroxPlan } from '../../../utils/planGenerator'
import { getHyroxCoaching } from '../../../engines/hyrox/coaching'
import { getCoaching } from '../../../utils/coaching'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import type { PlannedDay } from '../../../types'

function config(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'hyrox',
    raceName: 'Hyrox Anaheim',
    raceDate: '2026-12-05',
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5,
    longRunDay: 'Saturday',
    wearable: 'garmin',
    athleteName: 'Mike',
    age: 45,
    maxHR: 200,
    equipmentAccess: ['gym'],
    completedAt: '',
    ...overrides,
  }
}

const plan = generateHyroxPlan(config())
const allDays = (): { day: PlannedDay; weekNum: number }[] =>
  plan.weeks.flatMap(w => w.days.map(d => ({ day: d, weekNum: w.num })))

const compromisedDays = allDays().filter(({ day }) => /compromised running/i.test(day.workout))

describe('compromised running gets its own coaching, in every phase', () => {
  it('the generator emits it under BOTH day types — the reason a type switch cannot work', () => {
    const types = new Set(compromisedDays.map(({ day }) => day.type))
    expect(compromisedDays.length).toBeGreaterThan(1)
    expect(types.size).toBeGreaterThan(1)
    expect([...types].sort()).toEqual(['cross', 'quality'])
  })

  it('every compromised-running day routes to compromised-running copy', () => {
    for (const { day, weekNum } of compromisedDays) {
      const c = getHyroxCoaching(day, weekNum, 'Hyrox Anaheim')
      expect(c.title, `${day.workout} (wk ${weekNum}, type ${day.type})`).toMatch(/compromised running/i)
    }
  })

  it('never inherits Station Circuit or 1km Repeats copy again (the regression)', () => {
    for (const { day, weekNum } of compromisedDays) {
      const c = getHyroxCoaching(day, weekNum, 'Hyrox Anaheim')
      expect(c.title).not.toMatch(/station circuit/i)
      expect(c.title).not.toMatch(/1km repeats/i)
      // The station-circuit tell: it opens by warming up on an erg.
      expect(c.execution.join(' ')).not.toMatch(/warm up 3-5 min on an erg/i)
    }
  })

  it('the copy is about the TRANSITION — the whole point of the session', () => {
    for (const { day, weekNum } of compromisedDays) {
      const c = getHyroxCoaching(day, weekNum, 'Hyrox Anaheim')
      const all = `${c.purpose} ${c.execution.join(' ')} ${c.mindset}`
      // It must say, somewhere, that nothing comes between run and station.
      expect(all, day.workout).toMatch(/no (break|pause)|nothing in between|straight (from|into)/i)
    }
  })

  it('intro and race-effort variants give different guidance', () => {
    const intro = compromisedDays.find(({ day }) => /\(intro\)/i.test(day.workout))!
    const full = compromisedDays.find(({ day }) => !/\(intro\)/i.test(day.workout))!
    const introCopy = getHyroxCoaching(intro.day, intro.weekNum, 'Hyrox Anaheim')
    const fullCopy = getHyroxCoaching(full.day, full.weekNum, 'Hyrox Anaheim')

    expect(introCopy.title).not.toBe(fullCopy.title)
    // The intro must not send a beginner out at race pace...
    expect(introCopy.execution.join(' ')).toMatch(/conversational|could talk/i)
    expect(introCopy.execution.join(' ')).not.toMatch(/race pace/i)
    // ...and the real session must not be soft about it.
    expect(fullCopy.execution.join(' ')).toMatch(/race pace/i)
  })

  it('routes through the public getCoaching entry point too (what the modal calls)', () => {
    const { day, weekNum } = compromisedDays[0]
    const c = getCoaching(day, weekNum, { race: plan.race })
    expect(c.title).toMatch(/compromised running/i)
  })
})
