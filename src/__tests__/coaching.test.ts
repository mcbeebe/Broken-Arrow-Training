import { describe, it, expect } from 'vitest'
import { getCoaching, isHyroxContext } from '../utils/coaching'
import type { PlannedDay } from '../types'

/**
 * Race-day coaching must belong to the race the athlete is actually
 * running. Field bug: the Hyrox Anaheim race card told the athlete to
 * "refuel at Siberia Aid Station" and "protect your quads on the Shirley
 * Canyon descent" — Broken Arrow course copy hardcoded for every race.
 */

const BROKEN_ARROW_COPY = /Siberia|Shirley Canyon|DAS BELL|mountain|poles/i

function day(over: Partial<PlannedDay>): PlannedDay {
  return { day: 'Sat 12/5', type: 'race', workout: 'RACE DAY', detail: '', zone: '—', route: '—', time: '—', ...over }
}

describe('race-day coaching routes by race', () => {
  it('Hyrox by explicit format: Hyrox race-day copy, zero Broken Arrow', () => {
    const c = getCoaching(day({ workout: 'RACE DAY — Hyrox - Anaheim' }), 18, { race: { name: 'Hyrox - Anaheim', format: 'hyrox' } })
    const all = [c.purpose, ...c.execution, c.mindset, c.nutrition, c.recovery].join(' ')
    expect(all).not.toMatch(BROKEN_ARROW_COPY)
    expect(all).toMatch(/roxzone/i)
    expect(all).toMatch(/wall balls/i)
    expect(all).toMatch(/Runs 1-4/i)
    expect(c.purpose).toContain('Hyrox - Anaheim')
  })

  it('Hyrox detected from the workout name alone (no opts at all)', () => {
    const c = getCoaching(day({ workout: 'RACE DAY — Hyrox - Anaheim' }), 18)
    const all = [c.purpose, ...c.execution, c.mindset].join(' ')
    expect(all).not.toMatch(BROKEN_ARROW_COPY)
    expect(all).toMatch(/roxzone/i)
  })

  it('a non-Hyrox race day names ITS race and invents no landmarks', () => {
    const c = getCoaching(day({ workout: 'RACE DAY — Oakland Hills Half Maraton' }), 18)
    const all = [c.purpose, ...c.execution, c.mindset].join(' ')
    expect(all).not.toMatch(BROKEN_ARROW_COPY)
    expect(c.purpose).toContain('Oakland Hills Half Maraton')
  })

  it('race context name is preferred over the workout-string fallback', () => {
    const c = getCoaching(day({ workout: 'RACE DAY' }), 18, { race: { name: 'CIM Marathon', format: 'road' } })
    expect(c.purpose).toContain('CIM Marathon')
  })

  it('the actual Broken Arrow race keeps its course-specific copy', () => {
    const c = getCoaching(day({ workout: '🏔 RACE: BROKEN ARROW 18K' }), 10)
    const all = [c.purpose, ...c.execution, c.mindset].join(' ')
    expect(all).toMatch(/Siberia/)
    expect(all).toMatch(/Shirley Canyon/)
  })

  it('5K tune-up branch is unchanged', () => {
    const c = getCoaching(day({ workout: '5K TIME TRIAL' }), 5)
    expect(c.purpose).toMatch(/5K/)
    expect([c.purpose, ...c.execution].join(' ')).not.toMatch(BROKEN_ARROW_COPY)
  })
})

describe('isHyroxContext', () => {
  it('explicit non-hyrox format is authoritative — a trail race named "Hyrox tune-up" is not hijacked', () => {
    expect(isHyroxContext(day({ workout: 'Easy run' }), { name: 'Hyrox tune-up trail 10k', format: 'trail' })).toBe(false)
  })
  it('explicit hyrox format routes even with a neutral name', () => {
    expect(isHyroxContext(day({ workout: 'Easy run' }), { name: 'Anaheim Open', format: 'hyrox' })).toBe(true)
  })
  it('sniffs hyrox from the workout when no context exists (layered prep days)', () => {
    expect(isHyroxContext(day({ type: 'cross', workout: 'Hyrox prep — stations + strength-endurance' }))).toBe(true)
    expect(isHyroxContext(day({ type: 'run', workout: 'Easy run' }))).toBe(false)
  })
})

describe('non-race day types keep their narratives', () => {
  it('generalGoal routing still wins (regression)', () => {
    const c = getCoaching(day({ type: 'strength', workout: 'Full-body strength' }), 2, { generalGoal: 'build_muscle' })
    expect(c.purpose).toMatch(/Progressive overload/i)
  })

  it('a trail-plan long run keeps the trail long-run copy', () => {
    const c = getCoaching(day({ type: 'long', workout: 'Long run' }), 5)
    expect(c.purpose).toMatch(/most important weekly session/i)
  })

  it('a Hyrox-block long run gets the Hyrox engine framing instead', () => {
    const c = getCoaching(day({ type: 'long', workout: 'Long run + station finisher' }), 5, { race: { name: 'Hyrox - Anaheim', format: 'hyrox' } })
    expect(c.purpose).toMatch(/8×1km/i)
    expect(c.purpose).toMatch(/compromised legs/i)
    expect(c.purpose).not.toMatch(/gear/)
  })
})
