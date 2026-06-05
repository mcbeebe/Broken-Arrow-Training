import { describe, it, expect } from 'vitest'
import {
  DEFAULT_READINESS_TUNING,
  ageFromBirthDate,
  getReadinessTuning,
} from '../utils/engineConfig'

// Fixed "now" so age is deterministic regardless of when the suite runs.
const NOW = new Date('2026-06-05T12:00:00')

describe('ageFromBirthDate', () => {
  it('returns null for missing/invalid input', () => {
    expect(ageFromBirthDate(undefined, NOW)).toBeNull()
    expect(ageFromBirthDate('', NOW)).toBeNull()
    expect(ageFromBirthDate('not-a-date', NOW)).toBeNull()
  })

  it('computes whole-years age with birthday boundary', () => {
    expect(ageFromBirthDate('1986-06-05', NOW)).toBe(40) // birthday is today
    expect(ageFromBirthDate('1986-06-06', NOW)).toBe(39) // birthday tomorrow
    expect(ageFromBirthDate('2000-01-01', NOW)).toBe(26)
  })
})

describe('getReadinessTuning', () => {
  it('returns the universal defaults when there is no profile or signal', () => {
    expect(getReadinessTuning(undefined, NOW)).toEqual(DEFAULT_READINESS_TUNING)
    expect(getReadinessTuning(null, NOW)).toEqual(DEFAULT_READINESS_TUNING)
    expect(getReadinessTuning({}, NOW)).toEqual(DEFAULT_READINESS_TUNING)
    // and the defaults are exactly the engine's historical constants
    expect(DEFAULT_READINESS_TUNING).toEqual({
      acwrSweetTop: 1.3,
      acwrDanger: 1.5,
      stateDConsecutiveRed: 5,
      weeklyIncreaseCapPct: 10,
    })
  })

  it('masters 40-49: tightens the ACWR danger ceiling only', () => {
    const t = getReadinessTuning({ birthDate: '1981-01-01' }, NOW) // age 45
    expect(t.acwrDanger).toBe(1.4)
    expect(t.acwrSweetTop).toBe(1.3)
    expect(t.stateDConsecutiveRed).toBe(5)
  })

  it('masters 50+: tighter ceiling and deload one day sooner', () => {
    const t = getReadinessTuning({ birthDate: '1971-01-01' }, NOW) // age 55
    expect(t.acwrDanger).toBe(1.3)
    expect(t.stateDConsecutiveRed).toBe(4)
  })

  it('age boundaries', () => {
    expect(getReadinessTuning({ birthDate: '1986-06-05' }, NOW).acwrDanger).toBe(1.4) // exactly 40
    expect(getReadinessTuning({ birthDate: '1986-06-06' }, NOW).acwrDanger).toBe(1.5) // 39 → default
    expect(getReadinessTuning({ birthDate: '1976-01-01' }, NOW).acwrDanger).toBe(1.3) // 50
    expect(getReadinessTuning({ birthDate: '1977-01-01' }, NOW).acwrDanger).toBe(1.4) // 49
  })

  it('beginner / first-timer: earlier caution + lower ramp', () => {
    for (const exp of ['beginner', 'first_timer'] as const) {
      const t = getReadinessTuning({ experienceLevel: exp }, NOW)
      expect(t.acwrSweetTop).toBe(1.2)
      expect(t.acwrDanger).toBe(1.4)
      expect(t.weeklyIncreaseCapPct).toBe(8)
    }
  })

  it('advanced/intermediate experience does not change tuning', () => {
    expect(getReadinessTuning({ experienceLevel: 'advanced' }, NOW)).toEqual(DEFAULT_READINESS_TUNING)
    expect(getReadinessTuning({ experienceLevel: 'intermediate' }, NOW)).toEqual(DEFAULT_READINESS_TUNING)
  })

  it('masters + beginner compose to the most conservative of each', () => {
    const t = getReadinessTuning({ birthDate: '1971-01-01', experienceLevel: 'beginner' }, NOW) // 55 + beginner
    expect(t.acwrDanger).toBe(1.3) // min(1.3 masters, 1.4 beginner)
    expect(t.acwrSweetTop).toBe(1.2) // beginner
    expect(t.stateDConsecutiveRed).toBe(4) // masters 50+
    expect(t.weeklyIncreaseCapPct).toBe(8) // beginner
  })
})
