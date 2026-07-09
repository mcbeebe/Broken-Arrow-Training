/**
 * R2 (PR-3) — fueling carb targets + scaling.
 */
import { describe, it, expect } from 'vitest'
import type { PlannedDay } from '../../types'
import {
  carbTargetForRaceMiles, isFuelingRehearsalWeek, fuelingSummaryLine,
  applyFuelingToWeek, estimateRunMinutes,
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

function longDay(time: string): PlannedDay {
  return { day: 'Sun 8/16', type: 'long', workout: 'Long', detail: 'Long run', zone: 'Z2', route: '', time }
}

describe('applyFuelingToWeek — the per-RUN gate (field bug: 45 g/hr on a 4-mile run)', () => {
  it('a ~45-min long run gets NO per-hour fueling even in a half-marathon plan', () => {
    // The field case: 4.1 mi early-build "long" run, race ≥ 13 mi.
    const out = applyFuelingToWeek([longDay('41-49 min')], 13.1, 10)
    expect(out[0].detail).not.toContain('g carb/hr')
  })

  it('a 2-hour long run still gets the race-scaled target', () => {
    const out = applyFuelingToWeek([longDay('2 hr')], 26.2, 10)
    expect(out[0].detail).toContain('Fuel ~60 g carb/hr')
  })

  it('no duration signal at all → skip (never guess a run into hourly fueling)', () => {
    const out = applyFuelingToWeek([longDay('—')], 26.2, 10)
    expect(out[0].detail).not.toContain('g carb/hr')
  })

  it('mileage fallback fuels a genuinely long run when time is absent', () => {
    const out = applyFuelingToWeek([longDay('—')], 26.2, 10, { longRunMi: 12, easyPaceMinPerMile: 10 })
    expect(out[0].detail).toContain('Fuel ~60 g carb/hr')
  })

  it('short races stay unfueled regardless of run length', () => {
    const out = applyFuelingToWeek([longDay('2 hr')], 6.2, 10)
    expect(out[0].detail).not.toContain('g carb/hr')
  })
})

describe('estimateRunMinutes', () => {
  it('parses ranges to midpoints and hr+min composites', () => {
    expect(estimateRunMinutes({ time: '41-49 min' })).toBe(45)
    expect(estimateRunMinutes({ time: '90 min' })).toBe(90)
    expect(estimateRunMinutes({ time: '1 hr 10 min' })).toBe(70)
    expect(estimateRunMinutes({ time: '2 hr' })).toBe(120)
  })
  it('falls back to mileage × easy pace, else null', () => {
    expect(estimateRunMinutes({ time: '—' }, 8, 11)).toBe(88)
    expect(estimateRunMinutes({ time: '—' })).toBeNull()
  })
})
