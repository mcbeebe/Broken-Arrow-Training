/**
 * PR-1 — race vertical-gain helpers + iRunFar tier classifier.
 */
import { describe, it, expect } from 'vitest'
import {
  parseVertFromText, raceVertGainFt, raceVertFtPerMile, vertTier, configVertGainFt,
} from '../../utils/raceVert'
import type { RaceInfo } from '../../types'
import type { OnboardingConfig } from '../../hooks/useOnboarding'

const FT_PER_M = 3.28084
const race = (o: Partial<RaceInfo>): RaceInfo => ({
  name: 'X', date: '', startTime: '', distance: '', distanceMiles: 0, elevation: '',
  elevationRange: '', course: '', cutoff: '', landmarks: [], gear: [], nutrition: '', ...o,
})

describe('parseVertFromText', () => {
  it('parses feet with commas + "of climbing"', () => {
    expect(parseVertFromText('big course, 8,000 ft of climbing')).toBe(8000)
  })
  it('parses a +ft form', () => { expect(parseVertFromText('+2400ft')).toBe(2400) })
  it('converts metres of vert to feet', () => {
    expect(parseVertFromText('2400 m of vert')).toBe(Math.round(2400 * FT_PER_M))
  })
  it('does NOT match a plain distance in metres', () => {
    expect(parseVertFromText('track 400 m repeats')).toBe(0)
  })
  it('returns 0 when there is no vert figure', () => {
    expect(parseVertFromText('flat road course')).toBe(0)
    expect(parseVertFromText(undefined)).toBe(0)
  })
})

describe('raceVertGainFt — precedence', () => {
  it('structured elevationGainFt wins over the string', () => {
    expect(raceVertGainFt(race({ elevationGainFt: 5000, elevation: '9000 ft' }))).toBe(5000)
  })
  it('falls back to the elevation string', () => {
    expect(raceVertGainFt(race({ elevation: '9,000 ft' }))).toBe(9000)
  })
  it('falls back to the free-text description', () => {
    expect(raceVertGainFt(race({ description: 'huge day — 12,000 ft of gain' }))).toBe(12000)
  })
  it('is 0 when nothing is known', () => { expect(raceVertGainFt(race({}))).toBe(0) })
})

describe('raceVertFtPerMile + vertTier (iRunFar tiers)', () => {
  it('computes ft/mi', () => {
    expect(raceVertFtPerMile(race({ distanceMiles: 100, elevationGainFt: 20000 }))).toBe(200)
  })
  it('is 0 when distance is unknown', () => {
    expect(raceVertFtPerMile(race({ elevationGainFt: 5000 }))).toBe(0)
  })
  it('classifies at the 120 / 240 ft/mi boundaries', () => {
    expect(vertTier(119)).toBe('flat')
    expect(vertTier(120)).toBe('mountainous')
    expect(vertTier(240)).toBe('mountainous')
    expect(vertTier(241)).toBe('colossal')
  })
})

describe('configVertGainFt', () => {
  const cfg = (o: Partial<OnboardingConfig>): OnboardingConfig => ({
    raceType: 'trail', raceName: 'X', raceDate: '', experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5, wearable: 'none', athleteName: 'T', age: 35, completedAt: '', ...o,
  })
  it('prefers the structured field', () => {
    expect(configVertGainFt(cfg({ elevationGainFt: 6000, raceDescription: '9000 ft' }))).toBe(6000)
  })
  it('parses the description when no structured field', () => {
    expect(configVertGainFt(cfg({ raceDescription: 'rugged, 9,500 ft of vert' }))).toBe(9500)
  })
  it('is 0 for a flat description', () => {
    expect(configVertGainFt(cfg({ raceDescription: 'pancake-flat road race' }))).toBe(0)
  })
})
