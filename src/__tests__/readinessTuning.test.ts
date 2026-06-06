import { describe, it, expect } from 'vitest'
import { scoreLoad, classifyTrainingState } from '../utils/readiness'
import { getReadinessTuning, DEFAULT_READINESS_TUNING } from '../utils/engineConfig'

const NOW = new Date('2026-06-05T12:00:00')

describe('readiness engine honors R8 tuning', () => {
  it('omitting tuning is byte-identical to passing the defaults', () => {
    for (const acwr of [0.5, 0.79, 0.8, 0.9, 1.2, 1.3, 1.35, 1.5, 1.55, 2.0]) {
      expect(scoreLoad(acwr)).toBe(scoreLoad(acwr, DEFAULT_READINESS_TUNING))
    }
    // and the historical thresholds are unchanged on the default path
    expect(scoreLoad(1.25)).toBe(0.0) // sweet spot (≤1.3)
    expect(scoreLoad(1.45)).toBe(-0.5) // caution (1.3–1.5)
    expect(scoreLoad(1.6)).toBe(-1.0) // danger (>1.5)
  })

  it('masters 50+ pulls ACWR 1.45 from caution into danger', () => {
    const masters = getReadinessTuning({ birthDate: '1971-01-01' }, NOW) // age 55 → danger 1.3
    expect(scoreLoad(1.45)).toBe(-0.5) // default: still caution
    expect(scoreLoad(1.45, masters)).toBe(-1.0) // masters: danger
  })

  it('beginner caution starts at ACWR 1.2', () => {
    const beginner = getReadinessTuning({ experienceLevel: 'beginner' }, NOW)
    expect(scoreLoad(1.25)).toBe(0.0) // default sweet spot
    expect(scoreLoad(1.25, beginner)).toBe(-0.5) // beginner: caution
  })

  it('masters 50+ trips training state D one day sooner', () => {
    const masters = getReadinessTuning({ birthDate: '1971-01-01' }, NOW) // stateD threshold 4
    expect(classifyTrainingState(-0.1, 1.0, 4, false)).not.toBe('D') // default needs 5
    expect(classifyTrainingState(-0.1, 1.0, 4, false, masters)).toBe('D')
  })
})
