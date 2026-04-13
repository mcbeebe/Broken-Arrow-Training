import { describe, it, expect } from 'vitest'
import {
  calculateBanisterTRIMP,
  getSportMultiplier,
  calculateElevationBonus,
  calculateAdjustedTRIMP,
  mapToSportType,
  aggregateDailyTRIMP,
} from '../utils/trimp'

describe('calculateBanisterTRIMP', () => {
  it('returns 0 for zero duration', () => {
    expect(calculateBanisterTRIMP(0, 150, 55, 197)).toBe(0)
  })

  it('returns 0 when avgHR <= restingHR', () => {
    expect(calculateBanisterTRIMP(30, 55, 55, 197)).toBe(0)
    expect(calculateBanisterTRIMP(30, 50, 55, 197)).toBe(0)
  })

  it('produces higher TRIMP for higher intensity', () => {
    const low = calculateBanisterTRIMP(30, 120, 55, 197)   // easy Z1
    const mid = calculateBanisterTRIMP(30, 150, 55, 197)   // moderate Z2-3
    const high = calculateBanisterTRIMP(30, 180, 55, 197)  // hard Z4
    expect(mid).toBeGreaterThan(low)
    expect(high).toBeGreaterThan(mid)
  })

  it('scales linearly with duration at same intensity', () => {
    const t30 = calculateBanisterTRIMP(30, 150, 55, 197)
    const t60 = calculateBanisterTRIMP(60, 150, 55, 197)
    expect(t60).toBeCloseTo(t30 * 2, 1)
  })

  it('produces reasonable values for a typical 45-min Z2 run', () => {
    // avgHR 140, resting 55, max 197 → ΔHR ≈ 0.599
    // TRIMP ≈ 45 * 0.599 * 0.64 * e^(1.92*0.599) ≈ 45 * 0.599 * 0.64 * 3.16 ≈ 54.5
    const trimp = calculateBanisterTRIMP(45, 140, 55, 197)
    expect(trimp).toBeGreaterThan(40)
    expect(trimp).toBeLessThan(70)
  })

  it('clamps deltaHR to prevent exponential blowup', () => {
    // avgHR > maxHR should not produce infinity
    const trimp = calculateBanisterTRIMP(30, 200, 55, 197)
    expect(Number.isFinite(trimp)).toBe(true)
    expect(trimp).toBeGreaterThan(0)
  })
})

describe('getSportMultiplier', () => {
  it('returns 1.0 for running', () => {
    expect(getSportMultiplier('running')).toBe(1.0)
  })

  it('returns correct multipliers for all sport types', () => {
    expect(getSportMultiplier('trail_running')).toBe(1.05)
    expect(getSportMultiplier('cycling')).toBe(0.70)
    expect(getSportMultiplier('hiking')).toBe(1.10)
    expect(getSportMultiplier('swimming')).toBe(0.50)
    expect(getSportMultiplier('strength_training')).toBe(0.80)
    expect(getSportMultiplier('yoga')).toBe(0.20)
    expect(getSportMultiplier('walking')).toBe(0.30)
    expect(getSportMultiplier('elliptical')).toBe(0.60)
    expect(getSportMultiplier('other')).toBe(0.60)
  })
})

describe('mapToSportType', () => {
  it('maps Strava types correctly', () => {
    expect(mapToSportType('Run')).toBe('running')
    expect(mapToSportType('trail_run')).toBe('trail_running')
    expect(mapToSportType('Ride')).toBe('cycling')
    expect(mapToSportType('Hike')).toBe('hiking')
    expect(mapToSportType('Swim')).toBe('swimming')
    expect(mapToSportType('WeightTraining')).toBe('strength_training')
    expect(mapToSportType('Yoga')).toBe('yoga')
    expect(mapToSportType('Walk')).toBe('walking')
  })

  it('maps Garmin types correctly', () => {
    expect(mapToSportType('running')).toBe('running')
    expect(mapToSportType('trail_running')).toBe('trail_running')
    expect(mapToSportType('strength_training')).toBe('strength_training')
  })

  it('returns "other" for unknown types', () => {
    expect(mapToSportType('unknown_sport')).toBe('other')
  })
})

describe('calculateElevationBonus', () => {
  it('returns 0 for zero elevation', () => {
    expect(calculateElevationBonus(0)).toBe(0)
  })

  it('returns 10 per 1000 ft', () => {
    expect(calculateElevationBonus(1000)).toBe(10)
    expect(calculateElevationBonus(2000)).toBe(20)
    expect(calculateElevationBonus(3800)).toBe(38) // Broken Arrow 18K course
  })

  it('returns 0 for negative elevation', () => {
    expect(calculateElevationBonus(-500)).toBe(0)
  })
})

describe('calculateAdjustedTRIMP', () => {
  it('combines base TRIMP, multiplier, and elevation bonus', () => {
    const record = calculateAdjustedTRIMP(
      45, 150, 55, 197,
      'hiking', 2000,
      'Oakland Hills Hike', '2026-04-15'
    )
    expect(record.sportType).toBe('hiking')
    expect(record.sportMultiplier).toBe(1.10)
    expect(record.elevationBonus).toBe(20)
    expect(record.adjustedTRIMP).toBeGreaterThan(record.baseTRIMP)
    expect(record.date).toBe('2026-04-15')
    expect(record.activityName).toBe('Oakland Hills Hike')
  })

  it('yoga has very low adjusted TRIMP', () => {
    const record = calculateAdjustedTRIMP(
      60, 100, 55, 197,
      'yoga', 0,
      'Morning Yoga', '2026-04-15'
    )
    expect(record.sportMultiplier).toBe(0.20)
    expect(record.adjustedTRIMP).toBeLessThan(record.baseTRIMP)
  })
})

describe('aggregateDailyTRIMP', () => {
  it('aggregates multiple activities on same day', () => {
    const records = [
      { date: '2026-04-15', activityName: 'Run', sportType: 'running' as const, baseTRIMP: 50, sportMultiplier: 1, elevationBonus: 0, adjustedTRIMP: 50 },
      { date: '2026-04-15', activityName: 'Strength', sportType: 'strength_training' as const, baseTRIMP: 30, sportMultiplier: 0.8, elevationBonus: 0, adjustedTRIMP: 24 },
    ]
    const daily = aggregateDailyTRIMP(records)
    expect(daily).toHaveLength(1)
    expect(daily[0].total).toBe(74)
    expect(daily[0].records).toHaveLength(2)
  })

  it('sorts by date ascending', () => {
    const records = [
      { date: '2026-04-16', activityName: 'Run', sportType: 'running' as const, baseTRIMP: 50, sportMultiplier: 1, elevationBonus: 0, adjustedTRIMP: 50 },
      { date: '2026-04-15', activityName: 'Walk', sportType: 'walking' as const, baseTRIMP: 10, sportMultiplier: 0.3, elevationBonus: 0, adjustedTRIMP: 3 },
    ]
    const daily = aggregateDailyTRIMP(records)
    expect(daily[0].date).toBe('2026-04-15')
    expect(daily[1].date).toBe('2026-04-16')
  })
})
