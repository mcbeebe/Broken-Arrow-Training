/**
 * R2 (PR-3) — fueling carb targets + scaling.
 */
import { describe, it, expect } from 'vitest'
import {
  carbTargetForRaceMiles, isFuelingRehearsalWeek, fuelingSummaryLine,
} from '../../utils/fueling'

describe('carbTargetForRaceMiles', () => {
  it('is 0 for sub-90-min races (5K/10K)', () => {
    expect(carbTargetForRaceMiles(3.1)).toBe(0)
    expect(carbTargetForRaceMiles(6.2)).toBe(0)
  })
  it('ramps by distance and caps at 90 g/hr', () => {
    expect(carbTargetForRaceMiles(13.1)).toBe(45) // half
    expect(carbTargetForRaceMiles(26.2)).toBe(60) // marathon
    expect(carbTargetForRaceMiles(31)).toBe(75)   // 50K
    expect(carbTargetForRaceMiles(100)).toBe(90)  // 100 mile
    expect(carbTargetForRaceMiles(200)).toBe(90)  // capped
  })
  it('scales monotonically with race duration', () => {
    expect(carbTargetForRaceMiles(100)).toBeGreaterThanOrEqual(carbTargetForRaceMiles(31))
    expect(carbTargetForRaceMiles(31)).toBeGreaterThanOrEqual(carbTargetForRaceMiles(26.2))
  })
})

describe('isFuelingRehearsalWeek', () => {
  it('fires only in the 4–6-week window', () => {
    expect([4, 5, 6].every(isFuelingRehearsalWeek)).toBe(true)
    expect([0, 3, 7, 12].some(isFuelingRehearsalWeek)).toBe(false)
  })
})

describe('fuelingSummaryLine (coach)', () => {
  it('gives a concrete g/hr line for long races', () => {
    expect(fuelingSummaryLine(26.2)).toContain('60 g carbohydrate/hour')
  })
  it('is null for short races', () => {
    expect(fuelingSummaryLine(6.2)).toBeNull()
  })
})
