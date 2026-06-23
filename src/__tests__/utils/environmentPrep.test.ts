/**
 * R3 / R13 (PR-3) — heat + altitude detection and advisories.
 */
import { describe, it, expect } from 'vitest'
import {
  detectHeat, detectAltitudeFt, environmentAdvisories,
} from '../../utils/environmentPrep'
import type { OnboardingConfig } from '../../hooks/useOnboarding'

const cfg = (raceDescription: string): OnboardingConfig => ({
  raceType: 'trail', raceName: 'X', raceDate: '2026-10-18', raceDistance: '50_mile',
  raceDescription, experienceLevel: 'advanced', trainingDaysPerWeek: 5,
  wearable: 'none', athleteName: 'T', age: 35, completedAt: '',
})

describe('detectHeat', () => {
  it('detects heat words', () => {
    expect(detectHeat(cfg('brutally hot desert 50-miler'))).toBe(true)
    expect(detectHeat(cfg('humid summer race'))).toBe(true)
  })
  it('is false for temperate descriptions', () => {
    expect(detectHeat(cfg('cool autumn forest trail'))).toBe(false)
  })
})

describe('detectAltitudeFt', () => {
  it('reads an elevation paired with an altitude word', () => {
    expect(detectAltitudeFt(cfg('alpine race at 10,000 ft elevation'))).toBe(10000)
    expect(detectAltitudeFt(cfg('starts around 9000 ft'))).toBe(9000)
  })
  it('does NOT confuse vertical gain with altitude', () => {
    expect(detectAltitudeFt(cfg('8,000 ft of climbing on rolling trail'))).toBe(0)
  })
  it('uses a nominal 8000 ft for a bare high-altitude keyword', () => {
    expect(detectAltitudeFt(cfg('a high-altitude alpine epic'))).toBe(8000)
  })
  it('is 0 at sea level', () => {
    expect(detectAltitudeFt(cfg('flat coastal sea-level course'))).toBe(0)
  })
})

describe('environmentAdvisories', () => {
  it('emits heat_prep for a hot race', () => {
    expect(environmentAdvisories(cfg('hot desert race')).some(a => a.id === 'heat_prep')).toBe(true)
  })
  it('emits altitude_prep for a high race', () => {
    expect(environmentAdvisories(cfg('race at 10,000 ft elevation')).some(a => a.id === 'altitude_prep')).toBe(true)
  })
  it('emits neither for a temperate sea-level race', () => {
    expect(environmentAdvisories(cfg('cool coastal road race'))).toEqual([])
  })
})
