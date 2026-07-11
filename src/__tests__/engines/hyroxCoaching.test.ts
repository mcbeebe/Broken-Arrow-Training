import { describe, it, expect } from 'vitest'
import { getHyroxCoaching } from '../../engines/hyrox/coaching'
import { getCoaching } from '../../utils/coaching'
import type { PlannedDay } from '../../types'

/**
 * Hyrox training days explain themselves in Hyrox terms — the user ask:
 * "Explain the long runs before hyrox". Every narrative ties the session
 * back to the race pattern (8×1km of compromised running + 8 stations),
 * never to mountains, poles, or another race's course.
 */

function day(over: Partial<PlannedDay>): PlannedDay {
  return { day: 'Sat 11/14', type: 'long', workout: 'Long run', detail: '', zone: '—', route: '—', time: '—', ...over }
}

const FIELDS = (c: ReturnType<typeof getHyroxCoaching>) =>
  [c.title, c.purpose, ...c.execution, c.mindset, c.nutrition, c.recovery]

describe('getHyroxCoaching per day type', () => {
  it('long run: explains WHY long runs win Hyrox (aerobic engine, compromised running)', () => {
    const c = getHyroxCoaching(day({ workout: 'Long run' }), 5)
    expect(c.title).toMatch(/Hyrox Engine/i)
    expect(c.purpose).toMatch(/8×1km/)
    expect(c.purpose).toMatch(/compromised legs/i)
    expect(c.mindset).toMatch(/BETWEEN/)
  })

  it('long run + station finisher: the no-break cue appears', () => {
    const c = getHyroxCoaching(day({ workout: 'Long run + station finisher' }), 6)
    expect(c.execution.join(' ')).toMatch(/NO break/i)
  })

  it('full simulation: dress-rehearsal framing', () => {
    const c = getHyroxCoaching(day({ workout: 'FULL HYROX SIMULATION' }), 9, 'Hyrox - Anaheim')
    expect(c.title).toMatch(/Simulation/i)
    expect(c.purpose).toContain('Hyrox - Anaheim')
    expect(c.execution.join(' ')).toMatch(/race order/i)
  })

  it('1km repeats: even splits + station-fatigue rationale', () => {
    const c = getHyroxCoaching(day({ type: 'quality', workout: '1km repeats' }), 6)
    expect(c.purpose).toMatch(/race legs|8 race legs/i)
    expect(c.execution.join(' ')).toMatch(/EVEN splits/i)
  })

  it('station circuit: weakest-station rationale + roxzone rests', () => {
    const c = getHyroxCoaching(day({ type: 'cross', workout: 'Station circuit (4 stations)' }), 6)
    expect(c.purpose).toMatch(/worst station/i)
    expect(c.execution.join(' ')).toMatch(/roxzone/i)
  })

  it('light station practice (recovery week): form-over-fitness framing', () => {
    const c = getHyroxCoaching(day({ type: 'cross', workout: 'Light station practice' }), 4)
    expect(c.purpose).toMatch(/movement quality/i)
  })

  it('strength: strength-endurance, every rep maps to a station', () => {
    const c = getHyroxCoaching(day({ type: 'strength', workout: 'STRENGTH: Hyrox-specific' }), 6, 'Hyrox - Anaheim')
    expect(c.purpose).toMatch(/strength-ENDURANCE/i)
    expect(c.purpose).toMatch(/grip/i)
  })

  it('tempo run: threshold tied to compromised running', () => {
    const c = getHyroxCoaching(day({ type: 'run', workout: 'Tempo run' }), 6)
    expect(c.purpose).toMatch(/threshold/i)
  })

  it('race day: runs 1-4 controlled, roxzone, wall-ball break sets — and the race name', () => {
    const c = getHyroxCoaching(day({ type: 'race', workout: 'RACE DAY — Hyrox - Anaheim' }), 12, 'Hyrox - Anaheim')
    const all = FIELDS(c).join(' ')
    expect(all).toMatch(/Runs 1-4/i)
    expect(all).toMatch(/roxzone/i)
    expect(all).toMatch(/20-15-15/)
    expect(c.purpose).toContain('Hyrox - Anaheim')
  })

  it('every day type returns complete, non-empty narrative fields', () => {
    const types: PlannedDay['type'][] = ['race', 'long', 'quality', 'cross', 'strength', 'run', 'rest', 'travel']
    for (const type of types) {
      const c = getHyroxCoaching(day({ type, workout: 'Session' }), 5)
      for (const field of FIELDS(c)) expect(field.length).toBeGreaterThan(0)
      expect(c.execution.length).toBeGreaterThan(0)
    }
  })
})

describe('routing through getCoaching', () => {
  it('anchor-Hyrox path: opts.race format routes every day type to the module', () => {
    const c = getCoaching(day({ type: 'cross', workout: 'Station circuit (4 stations)' }), 6, { race: { name: 'Hyrox - Anaheim', format: 'hyrox' } })
    expect(c.purpose).toMatch(/worst station/i)
  })

  it('spliced-block path: seasonRace-shaped context routes the same way', () => {
    // What WorkoutModal derives from week.seasonRace on a spliced Hyrox block.
    const seasonRaceCtx = { name: 'Hyrox - Anaheim', format: 'hyrox' as const }
    const c = getCoaching(day({ type: 'long', workout: 'Long run + station finisher' }), 14, { race: seasonRaceCtx })
    expect(c.title).toMatch(/Hyrox Engine/i)
  })
})
