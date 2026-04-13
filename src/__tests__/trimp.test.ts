import { describe, it, expect } from 'vitest'
import {
  calculateBanisterTRIMP,
  getSportMultiplier,
  calculateElevationBonus,
  calculateAdjustedTRIMP,
  mapToSportType,
  aggregateDailyTRIMP,
  classifyStrength,
  classifyHiking,
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
    const trimp = calculateBanisterTRIMP(45, 140, 55, 197)
    expect(trimp).toBeGreaterThan(40)
    expect(trimp).toBeLessThan(70)
  })

  it('clamps deltaHR to prevent exponential blowup', () => {
    const trimp = calculateBanisterTRIMP(30, 200, 55, 197)
    expect(Number.isFinite(trimp)).toBe(true)
    expect(trimp).toBeGreaterThan(0)
  })
})

describe('getSportMultiplier (ATE MIM matrix)', () => {
  it('returns 1.0 for running', () => {
    expect(getSportMultiplier('running')).toBe(1.0)
  })

  it('returns ATE-validated multipliers for all sport types', () => {
    expect(getSportMultiplier('trail_running')).toBe(1.1)
    expect(getSportMultiplier('cycling')).toBe(0.65)
    expect(getSportMultiplier('hiking')).toBe(0.8)
    expect(getSportMultiplier('hiking_steep')).toBe(1.2)
    expect(getSportMultiplier('swimming')).toBe(0.35)
    expect(getSportMultiplier('lap_swimming')).toBe(0.35)
    expect(getSportMultiplier('walking')).toBe(0.4)
    expect(getSportMultiplier('yoga')).toBe(0.3)
    expect(getSportMultiplier('elliptical')).toBe(0.7)
    expect(getSportMultiplier('other')).toBe(0.6)
  })

  it('returns correct strength sub-type multipliers', () => {
    expect(getSportMultiplier('strength_upper')).toBe(0.2)
    expect(getSportMultiplier('strength_lower')).toBe(1.5)
    expect(getSportMultiplier('strength_full')).toBe(1.0)
  })

  it('returns correct HIIT/cardio multipliers', () => {
    expect(getSportMultiplier('hiit')).toBe(1.3)
    expect(getSportMultiplier('cardio')).toBe(1.3)
  })

  it('returns 0 for excluded-from-load activities', () => {
    expect(getSportMultiplier('breathwork')).toBe(0.0)
    expect(getSportMultiplier('myrtl')).toBe(0.0)
    expect(getSportMultiplier('running_drills')).toBe(0.0)
  })
})

describe('mapToSportType', () => {
  it('maps Strava types correctly', () => {
    expect(mapToSportType('Run')).toBe('running')
    expect(mapToSportType('trail_run')).toBe('trail_running')
    expect(mapToSportType('Ride')).toBe('cycling')
    expect(mapToSportType('Hike')).toBe('hiking')
    expect(mapToSportType('Swim')).toBe('swimming')
    expect(mapToSportType('WeightTraining')).toBe('strength_full')
    expect(mapToSportType('Yoga')).toBe('yoga')
    expect(mapToSportType('Walk')).toBe('walking')
  })

  it('maps Garmin types correctly', () => {
    expect(mapToSportType('running')).toBe('running')
    expect(mapToSportType('trail_running')).toBe('trail_running')
    expect(mapToSportType('strength_training')).toBe('strength_full')
    expect(mapToSportType('mountain_biking')).toBe('mountain_biking')
    expect(mapToSportType('lap_swimming')).toBe('lap_swimming')
    expect(mapToSportType('hiit')).toBe('hiit')
    expect(mapToSportType('pilates')).toBe('pilates')
  })

  it('returns "other" for unknown types', () => {
    expect(mapToSportType('unknown_sport')).toBe('other')
  })
})

describe('classifyStrength', () => {
  it('classifies by name keywords', () => {
    expect(classifyStrength('Upper Body Push')).toBe('strength_upper')
    expect(classifyStrength('Leg Day Squats')).toBe('strength_lower')
    expect(classifyStrength('Full Body Circuit')).toBe('strength_full')
    expect(classifyStrength('Pull workout')).toBe('strength_upper')
  })

  it('uses HR inference when name is ambiguous', () => {
    // avgHR 130 with resting 55, max 197 → HRR fraction = 75/142 ≈ 0.528 → not > 0.60 → full
    expect(classifyStrength('Strength', 130, 55, 197)).toBe('strength_full')
    // avgHR 150 with resting 55, max 197 → HRR fraction = 95/142 ≈ 0.669 → > 0.60 → lower
    expect(classifyStrength('Strength', 150, 55, 197)).toBe('strength_lower')
  })

  it('defaults to strength_full without HR data', () => {
    expect(classifyStrength('Gym Session')).toBe('strength_full')
  })
})

describe('classifyHiking', () => {
  it('classifies flat hikes as hiking', () => {
    expect(classifyHiking(200)).toBe('hiking')
    expect(classifyHiking(0)).toBe('hiking')
  })

  it('classifies steep hikes above 500ft threshold', () => {
    expect(classifyHiking(501)).toBe('hiking_steep')
    expect(classifyHiking(2000)).toBe('hiking_steep')
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
  it('combines base TRIMP, ATE multiplier, and elevation bonus', () => {
    const record = calculateAdjustedTRIMP(
      45, 150, 55, 197,
      'hiking', 2000,
      'Oakland Hills Hike', '2026-04-15'
    )
    expect(record.sportType).toBe('hiking')
    expect(record.sportMultiplier).toBe(0.8) // ATE hiking MIM
    expect(record.elevationBonus).toBe(20)
    expect(record.date).toBe('2026-04-15')
    expect(record.activityName).toBe('Oakland Hills Hike')
  })

  it('yoga has low adjusted TRIMP with ATE multiplier 0.3', () => {
    const record = calculateAdjustedTRIMP(
      60, 100, 55, 197,
      'yoga', 0,
      'Morning Yoga', '2026-04-15'
    )
    expect(record.sportMultiplier).toBe(0.3) // ATE yoga MIM
    expect(record.adjustedTRIMP).toBeLessThan(record.baseTRIMP)
  })
})

describe('aggregateDailyTRIMP', () => {
  it('aggregates multiple activities on same day', () => {
    const records = [
      { date: '2026-04-15', activityName: 'Run', sportType: 'running' as const, baseTRIMP: 50, sportMultiplier: 1, elevationBonus: 0, adjustedTRIMP: 50 },
      { date: '2026-04-15', activityName: 'Strength', sportType: 'strength_full' as const, baseTRIMP: 30, sportMultiplier: 1.0, elevationBonus: 0, adjustedTRIMP: 30 },
    ]
    const daily = aggregateDailyTRIMP(records)
    expect(daily).toHaveLength(1)
    expect(daily[0].total).toBe(80)
    expect(daily[0].records).toHaveLength(2)
  })

  it('sorts by date ascending', () => {
    const records = [
      { date: '2026-04-16', activityName: 'Run', sportType: 'running' as const, baseTRIMP: 50, sportMultiplier: 1, elevationBonus: 0, adjustedTRIMP: 50 },
      { date: '2026-04-15', activityName: 'Walk', sportType: 'walking' as const, baseTRIMP: 10, sportMultiplier: 0.4, elevationBonus: 0, adjustedTRIMP: 4 },
    ]
    const daily = aggregateDailyTRIMP(records)
    expect(daily[0].date).toBe('2026-04-15')
    expect(daily[1].date).toBe('2026-04-16')
  })
})
