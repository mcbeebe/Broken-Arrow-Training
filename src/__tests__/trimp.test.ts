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
  classifyRun,
  composeDayLoad,
  calibrateDOMSCarry,
  resolveMIM,
  stravaActivityToTRIMP,
  garminActivityToTRIMP,
} from '../utils/trimp'
import type { DailyTRIMP, TRIMPRecord, SportType, GarminActivity, StravaActivity } from '../types'

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
    expect(getSportMultiplier('running_steep')).toBe(1.3)
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
    expect(getSportMultiplier('strength_lower')).toBe(2.0)
    expect(getSportMultiplier('strength_full')).toBe(1.2)
  })

  it('returns correct HIIT/cardio multipliers', () => {
    expect(getSportMultiplier('hiit')).toBe(1.3)
    expect(getSportMultiplier('cardio')).toBe(1.3)
  })

  it('returns 0 for breathwork only — pure mechanical-load-free activity', () => {
    expect(getSportMultiplier('breathwork')).toBe(0.0)
  })

  it('credits myrtl hip routine with minimal load', () => {
    // Glute/hip activation — real but very light muscular work
    expect(getSportMultiplier('myrtl')).toBe(0.1)
  })

  it('credits running drills at half of running load', () => {
    // Drills are plyometric — A-skips, bounding, strides keep HR up
    // and stress the legs. Half of running is the fair middle ground.
    expect(getSportMultiplier('running_drills')).toBe(0.5)
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

  it('classifies cycling sub-types as cycling (not "other")', () => {
    // Strava sport_type values beyond plain "Ride"
    expect(mapToSportType('GravelRide')).toBe('cycling')
    expect(mapToSportType('VirtualRide')).toBe('cycling')
    expect(mapToSportType('Velomobile')).toBe('cycling')
    // Garmin activity types
    expect(mapToSportType('road_biking')).toBe('cycling')
    expect(mapToSportType('gravel_cycling')).toBe('cycling')
    expect(mapToSportType('cyclocross')).toBe('cycling')
    expect(mapToSportType('track_cycling')).toBe('cycling')
    expect(mapToSportType('indoor_cycling')).toBe('cycling')
    expect(mapToSportType('commuting')).toBe('cycling')
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

describe('classifyRun', () => {
  it('keeps flat road runs as running', () => {
    expect(classifyRun('running', 50, 5)).toBe('running')   // 10 ft/mi
    expect(classifyRun('running', 0, 5)).toBe('running')
  })

  it('promotes a hilly run to trail_running at ~100 ft/mi', () => {
    expect(classifyRun('running', 600, 5)).toBe('trail_running')   // 120 ft/mi
    expect(classifyRun('running', 250, 2.5)).toBe('trail_running') // 100 ft/mi exactly
  })

  it('promotes to running_steep at ~200 ft/mi', () => {
    expect(classifyRun('running', 1500, 6)).toBe('running_steep')  // 250 ft/mi (user's run)
    expect(classifyRun('running', 800, 4)).toBe('running_steep')   // 200 ft/mi exactly
  })

  it('further promotes a tagged trail_run when it is steep', () => {
    expect(classifyRun('trail_running', 1500, 6)).toBe('running_steep')
  })

  it('does not demote a tagged trail_run on a flat day', () => {
    expect(classifyRun('trail_running', 50, 5)).toBe('trail_running')
  })

  it('falls back to total-gain thresholds without distance', () => {
    expect(classifyRun('running', 400)).toBe('running')           // < 500 ft total
    expect(classifyRun('running', 600)).toBe('trail_running')      // ≥ 500 ft total
    expect(classifyRun('running', 1600)).toBe('running_steep')     // ≥ 1500 ft total
  })

  it('passes through non-run sports unchanged', () => {
    expect(classifyRun('hiking', 1000, 3)).toBe('hiking')
    expect(classifyRun('cycling', 2000, 30)).toBe('cycling')
  })
})

describe('mapToSportType run sub-classification', () => {
  it('promotes a Garmin "running" with hilly profile to running_steep', () => {
    expect(mapToSportType('running', { name: 'Trail Run', elevationGainFt: 1500, distanceMi: 6 }))
      .toBe('running_steep')
  })

  it('keeps a flat road Run as running', () => {
    expect(mapToSportType('Run', { name: 'Easy Run', elevationGainFt: 80, distanceMi: 5 }))
      .toBe('running')
  })

  it('promotes a tagged trail_run further when very hilly', () => {
    expect(mapToSportType('trail_run', { name: 'Mountain Loop', elevationGainFt: 2000, distanceMi: 8 }))
      .toBe('running_steep')
  })
})

describe('calculateElevationBonus', () => {
  it('returns 0 for zero elevation', () => {
    expect(calculateElevationBonus(0)).toBe(0)
  })

  it('returns 10 per 500 ft', () => {
    expect(calculateElevationBonus(500)).toBe(10)
    expect(calculateElevationBonus(1000)).toBe(20)
    expect(calculateElevationBonus(2000)).toBe(40)
    expect(calculateElevationBonus(3800)).toBe(76) // Broken Arrow 18K course
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
    expect(record.elevationBonus).toBe(40)
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
    // Use a far-future date so rest-day infill to "today" doesn't add
    // an unexpected second DailyTRIMP entry and break the length assertion.
    const records = [
      { date: '2026-06-01', activityName: 'Run', sportType: 'running' as const, baseTRIMP: 50, sportMultiplier: 1, elevationBonus: 0, adjustedTRIMP: 50 },
      { date: '2026-06-01', activityName: 'Strength', sportType: 'strength_full' as const, baseTRIMP: 30, sportMultiplier: 1.0, elevationBonus: 0, adjustedTRIMP: 30 },
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

describe('composeDayLoad', () => {
  it('returns recordSum when no adjustments and no DOMS carry', () => {
    expect(composeDayLoad(100, 0)).toBe(100)
  })

  it('adds DOMS carry without scaling by RPE', () => {
    // RPE 7 multiplies effort by 1.08 — but only effort, not the carry.
    // Effort: 100 × 1.08 = 108. Carry: 40 (untouched). Total: 148.
    expect(composeDayLoad(100, 40, { rpeValue: 7 })).toBeCloseTo(148, 1)
  })

  it('uses higher of DOMS prediction vs positive soreness (no double-count)', () => {
    // recordSum 4, DOMS carry 40, soreness 30.
    // Effort: 4 × 1 = 4. Lagged: max(40, 30) = 40. Total: 44.
    expect(composeDayLoad(4, 40, { sorenessAdj: 30 })).toBeCloseTo(44, 1)
  })

  it('soreness above DOMS prediction lifts the day total to the higher value', () => {
    // recordSum 4, DOMS carry 20, soreness 50.
    // Lagged: max(20, 50) = 50. Total: 4 + 50 = 54.
    expect(composeDayLoad(4, 20, { sorenessAdj: 50 })).toBeCloseTo(54, 1)
  })

  it('soreness only (no DOMS) adds fully — current behavior preserved', () => {
    expect(composeDayLoad(100, 0, { sorenessAdj: 30 })).toBeCloseTo(130, 1)
  })

  it('DOMS only (no soreness) uses prediction', () => {
    expect(composeDayLoad(100, 40, {})).toBeCloseTo(140, 1)
  })

  it('negative soreness (recovery credit) discounts DOMS without dedup gate', () => {
    // recordSum 100, DOMS 40, soreness −15 → lagged = max(0, 40 − 15) = 25.
    // Total = 100 + 25 = 125. (Relief lands; not swallowed by dedup.)
    expect(composeDayLoad(100, 40, { sorenessAdj: -15 })).toBeCloseTo(125, 1)
  })

  it('large negative soreness clamps lagged at zero', () => {
    expect(composeDayLoad(100, 10, { sorenessAdj: -50 })).toBeCloseTo(100, 1)
  })

  it('RPE only multiplies records + exercise — never DOMS carry', () => {
    // RPE 1 → 0.84 multiplier. Effort: (100 + 20) × 0.84 = 100.8.
    // Carry: 50 untouched. Total: 150.8.
    expect(composeDayLoad(100, 50, { exerciseLoad: 20, rpeValue: 1 })).toBeCloseTo(150.8, 1)
  })

  it('reduces to current sum when sorenessAdj==0 and rpe absent', () => {
    expect(composeDayLoad(50, 10, {})).toBe(60)
  })
})

describe('calibrateDOMSCarry', () => {
  function record(date: string, sport: SportType, load: number): TRIMPRecord {
    return {
      date,
      activityName: 'test',
      sportType: sport,
      baseTRIMP: load,
      sportMultiplier: 1,
      elevationBonus: 0,
      adjustedTRIMP: load,
    }
  }

  function dailyTrimp(records: TRIMPRecord[]): DailyTRIMP[] {
    const byDate = new Map<string, TRIMPRecord[]>()
    for (const r of records) {
      const list = byDate.get(r.date) ?? []
      list.push(r)
      byDate.set(r.date, list)
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, recs]) => ({
        date,
        total: recs.reduce((s, r) => s + r.adjustedTRIMP, 0),
        records: recs,
      }))
  }

  // strength_lower: DOMS_CARRY = [0.40, 0.20]; predicted DOMS over 2 days
  // = load × 0.6 × multiplier. With multiplier 1.0 and load 100, predicted = 60.

  it('returns no samples when there are fewer than 2 isolated workouts', () => {
    const days = dailyTrimp([record('2026-04-10', 'strength_lower', 100)])
    const out = calibrateDOMSCarry({
      dailyTrimp: days,
      sorenessByDate: new Map([['2026-04-11', 30]]),
      currentMultiplier: () => 1.0,
    })
    expect(out).toEqual([])
  })

  it('measures user being more sore than predicted (ratio > 1)', () => {
    // Two strength_lower workouts a week apart; user logs heavy soreness
    const days = dailyTrimp([
      record('2026-04-01', 'strength_lower', 100),
      record('2026-04-15', 'strength_lower', 100),
    ])
    const sor = new Map<string, number>([
      ['2026-04-02', 50],
      ['2026-04-03', 30],
      ['2026-04-16', 60],
      ['2026-04-17', 20],
    ])
    const out = calibrateDOMSCarry({
      dailyTrimp: days,
      sorenessByDate: sor,
      currentMultiplier: () => 1.0,
    })
    const lower = out.find(s => s.sport === 'strength_lower')
    expect(lower).toBeDefined()
    // predicted = 100*0.4 + 100*0.2 = 60 each → 60 avg
    // measured  = (50+30)=80 and (60+20)=80 → 80 avg
    // ratio = 80/60 ≈ 1.33
    expect(lower!.ratio).toBeCloseTo(1.33, 1)
    expect(lower!.samples).toBe(2)
  })

  it('measures user recovering faster than predicted (ratio < 1)', () => {
    const days = dailyTrimp([
      record('2026-04-01', 'strength_lower', 100),
      record('2026-04-15', 'strength_lower', 100),
    ])
    const sor = new Map<string, number>([
      ['2026-04-02', 15],
      ['2026-04-03', 0],
      ['2026-04-16', 18],
      ['2026-04-17', 0],
    ])
    const out = calibrateDOMSCarry({
      dailyTrimp: days,
      sorenessByDate: sor,
      currentMultiplier: () => 1.0,
    })
    const lower = out.find(s => s.sport === 'strength_lower')!
    // measured avg ≈ 16.5; predicted avg = 60 → ratio ≈ 0.275
    expect(lower.ratio).toBeCloseTo(0.28, 1)
    expect(lower.samples).toBe(2)
  })

  it('skips confounded workouts (another DOMS-generating activity in window)', () => {
    // Strength on 04-01 followed by trail_running on 04-02 confounds the
    // 04-02 / 04-03 soreness signal.
    const days = dailyTrimp([
      record('2026-04-01', 'strength_lower', 100),
      record('2026-04-02', 'trail_running', 80),
      record('2026-04-15', 'strength_lower', 100),
      record('2026-04-16', 'trail_running', 80),
    ])
    const sor = new Map<string, number>([
      ['2026-04-02', 60],
      ['2026-04-03', 30],
      ['2026-04-16', 60],
      ['2026-04-17', 30],
    ])
    const out = calibrateDOMSCarry({
      dailyTrimp: days,
      sorenessByDate: sor,
      currentMultiplier: () => 1.0,
    })
    // strength_lower is confounded both times — skipped.
    // trail_running has DOMS_CARRY = [0.10] — only 1 day window. The
    // 04-03 / 04-17 soreness on the next day is not also a DOMS day.
    expect(out.find(s => s.sport === 'strength_lower')).toBeUndefined()
    expect(out.find(s => s.sport === 'trail_running')).toBeDefined()
  })

  it('skips workouts below minLoad threshold', () => {
    const days = dailyTrimp([
      record('2026-04-01', 'strength_lower', 10),
      record('2026-04-15', 'strength_lower', 10),
    ])
    const sor = new Map([
      ['2026-04-02', 30],
      ['2026-04-16', 30],
    ])
    const out = calibrateDOMSCarry({
      dailyTrimp: days,
      sorenessByDate: sor,
      currentMultiplier: () => 1.0,
    })
    expect(out).toEqual([])
  })

  it('reflects the current multiplier when computing predicted DOMS', () => {
    // With multiplier 2.0× and load 100, predicted = 60 × 2 = 120.
    // Logged 80 → ratio = 80/120 ≈ 0.67.
    const days = dailyTrimp([
      record('2026-04-01', 'strength_lower', 100),
      record('2026-04-15', 'strength_lower', 100),
    ])
    const sor = new Map([
      ['2026-04-02', 50], ['2026-04-03', 30],
      ['2026-04-16', 50], ['2026-04-17', 30],
    ])
    const out = calibrateDOMSCarry({
      dailyTrimp: days,
      sorenessByDate: sor,
      currentMultiplier: () => 2.0,
    })
    const lower = out.find(s => s.sport === 'strength_lower')!
    expect(lower.ratio).toBeCloseTo(0.67, 1)
  })

  it('clamps negative soreness to zero (recovery credit not used as DOMS signal)', () => {
    const days = dailyTrimp([
      record('2026-04-01', 'strength_lower', 100),
      record('2026-04-15', 'strength_lower', 100),
    ])
    const sor = new Map([
      ['2026-04-02', -10], ['2026-04-03', -5],
      ['2026-04-16', 30], ['2026-04-17', 20],
    ])
    const out = calibrateDOMSCarry({
      dailyTrimp: days,
      sorenessByDate: sor,
      currentMultiplier: () => 1.0,
    })
    const lower = out.find(s => s.sport === 'strength_lower')!
    // First sample: measured = 0, predicted = 60 → ratio 0
    // Second: measured = 50, predicted = 60 → ratio 0.83
    // Avg ≈ 0.42
    expect(lower.ratio).toBeCloseTo(0.42, 1)
    expect(lower.samples).toBe(2)
  })
})

describe('resolveMIM (Hill Running v1.1 dynamic MIM)', () => {
  describe('hiking — hikingMIM(grade) when distance + elev present', () => {
    it('flat hike (no grade) ≈ 0.69× and reports ifSource grade', () => {
      const r = resolveMIM('hiking', { elevationGainFt: 0, distanceMi: 5 })
      expect(r.mim).toBeCloseTo(0.694, 2)
      expect(r.ifSource).toBe('grade')
      expect(r.intensityFactor).toBeUndefined()
    })

    it('moderate climb 5.7% avg grade gives ~1.06×', () => {
      // 1500 ft over 5 mi → grade = 1500 / 26400 ≈ 0.0568
      const r = resolveMIM('hiking', { elevationGainFt: 1500, distanceMi: 5 })
      expect(r.mim).toBeCloseTo(1.06, 1)
      expect(r.ifSource).toBe('grade')
    })

    it('steep hike 15% avg grade gives ~1.76× (well above prior 1.2 cap)', () => {
      // 2400 ft over 3 mi → grade = 2400 / 15840 ≈ 0.1515
      const r = resolveMIM('hiking_steep', { elevationGainFt: 2400, distanceMi: 3 })
      expect(r.mim).toBeGreaterThan(1.7)
      expect(r.mim).toBeLessThan(1.85)
      expect(r.ifSource).toBe('grade')
    })

    it('falls back to static 0.8 when distance is missing', () => {
      const r = resolveMIM('hiking', { elevationGainFt: 1000 })
      expect(r.mim).toBe(0.8)
      expect(r.ifSource).toBe('static')
    })
  })

  describe('cycling — cyclingMIM(IF) with priority NP > avgPower > HR-reserve', () => {
    it('uses normalized power / FTP when both present', () => {
      const r = resolveMIM('cycling', {
        normalizedPowerW: 220,
        avgPowerW: 200,
        ftpWatts: 250,
      })
      expect(r.intensityFactor).toBe(0.88)
      expect(r.ifSource).toBe('power')
      // cyclingMIM(0.88) = 0.4 + 0.4 * 0.7744 = 0.7098
      expect(r.mim).toBeCloseTo(0.71, 2)
    })

    it('falls back to HR-reserve when no FTP', () => {
      const r = resolveMIM('cycling', {
        avgHR: 148,
        restingHR: 50,
        maxHR: 190,
      })
      expect(r.ifSource).toBe('hr_reserve')
      // HR-reserve 0.7 → cyclingMIM ≈ 0.596
      expect(r.mim).toBeCloseTo(0.596, 2)
    })

    it('falls back to static 0.65 when neither power nor HR is usable', () => {
      const r = resolveMIM('cycling', {})
      expect(r.mim).toBe(0.65)
      expect(r.ifSource).toBe('static')
    })

    it('mountain biking gets a 1.2× rough-terrain bump on top of cyclingMIM', () => {
      const cycling = resolveMIM('cycling', { avgHR: 148, restingHR: 50, maxHR: 190 })
      const mtb = resolveMIM('mountain_biking', { avgHR: 148, restingHR: 50, maxHR: 190 })
      expect(mtb.mim).toBeCloseTo(cycling.mim * 1.2, 3)
      expect(mtb.ifSource).toBe('hr_reserve')
    })
  })

  describe('non-dynamic sports — stay on the static MIM_MATRIX', () => {
    it('running stays at 1.0×', () => {
      const r = resolveMIM('running', { avgHR: 148, restingHR: 50, maxHR: 190 })
      expect(r.mim).toBe(1.0)
      expect(r.ifSource).toBe('static')
    })

    it('ebike stays at 0.30× regardless of HR (pedal-assist makes IF unreliable)', () => {
      const r = resolveMIM('ebike', { avgHR: 180, restingHR: 50, maxHR: 190 })
      expect(r.mim).toBe(0.30)
      expect(r.ifSource).toBe('static')
    })

    it('strength_lower stays at the static eccentric MIM 2.0', () => {
      const r = resolveMIM('strength_lower', {})
      expect(r.mim).toBe(2.0)
    })
  })
})

describe('stravaActivityToTRIMP — cycling MIM uses power when present', () => {
  const baseActivity: Partial<StravaActivity> = {
    id: 1,
    name: 'Threshold ride',
    type: 'Ride',
    sport_type: 'Ride',
    distance: 30000, // 30 km
    moving_time: 3600, // 60 min
    elapsed_time: 3600,
    total_elevation_gain: 200,
    average_heartrate: 148,
    start_date_local: '2026-04-15T08:00:00Z',
    start_date: '2026-04-15T08:00:00Z',
  }

  it('uses normalized power / FTP when activity has device_watts', () => {
    const record = stravaActivityToTRIMP(
      { ...baseActivity, weighted_average_watts: 240, average_watts: 220, device_watts: true } as StravaActivity,
      50, 190,
      250,  // FTP
    )
    expect(record).not.toBeNull()
    expect(record!.ifSource).toBe('power')
    expect(record!.intensityFactor).toBe(0.96)
    // cyclingMIM(0.96) = 0.4 + 0.4 * 0.9216 = 0.769
    expect(record!.sportMultiplier).toBeCloseTo(0.769, 2)
  })

  it('falls back to HR-reserve when no power on the activity', () => {
    const record = stravaActivityToTRIMP(
      { ...baseActivity } as StravaActivity,
      50, 190,
      250,
    )
    expect(record).not.toBeNull()
    expect(record!.ifSource).toBe('hr_reserve')
    expect(record!.intensityFactor).toBeCloseTo(0.7, 2)
    expect(record!.sportMultiplier).toBeCloseTo(0.596, 2)
  })

  it('falls back to HR-reserve when athlete has no FTP', () => {
    const record = stravaActivityToTRIMP(
      { ...baseActivity, weighted_average_watts: 240 } as StravaActivity,
      50, 190,
      undefined,  // no FTP
    )
    expect(record).not.toBeNull()
    expect(record!.ifSource).toBe('hr_reserve')
  })
})

describe('garminActivityToTRIMP — hiking MIM uses average grade', () => {
  const baseHike: GarminActivity = {
    date: '2026-04-15',
    type: 'hiking',
    name: 'Marin Headlands',
    durationMinutes: 90,
    avgHR: 130,
    elevationGainFt: 1500,
    distanceMi: 5,
    activityTrainingLoad: 60,
  }

  it('5.7% avg grade gives hikingMIM ≈ 1.06× (vs prior static 0.8 / 1.2)', () => {
    const record = garminActivityToTRIMP(baseHike, 50, 190)
    expect(record).not.toBeNull()
    expect(record!.ifSource).toBe('grade')
    expect(record!.sportMultiplier).toBeCloseTo(1.06, 1)
  })

  it('flat hike (no elevation) reports static fallback', () => {
    const record = garminActivityToTRIMP(
      { ...baseHike, elevationGainFt: 0, distanceMi: 5 },
      50, 190,
    )
    expect(record).not.toBeNull()
    expect(record!.ifSource).toBe('grade')
    expect(record!.sportMultiplier).toBeCloseTo(0.694, 2)
  })

  it('hike with no distance falls back to static MIM matrix', () => {
    const record = garminActivityToTRIMP(
      { ...baseHike, distanceMi: undefined, elevationGainFt: 1500 },
      50, 190,
    )
    expect(record).not.toBeNull()
    // 1500 ft > 500 → classifyHiking → 'hiking_steep' → static 1.2
    expect(record!.sportType).toBe('hiking_steep')
    expect(record!.sportMultiplier).toBe(1.2)
    expect(record!.ifSource).toBe('static')
  })
})

describe('describeMIMEngine', () => {
  it('marks cycling as the IF² formula', async () => {
    const { describeMIMEngine } = await import('../utils/trimp')
    const desc = describeMIMEngine('cycling')
    expect(desc.engine).toBe('cycling-if')
    expect(desc.formulaLabel).toMatch(/IF/)
    expect(desc.staticValue).toBe(0.65)
    expect(desc.typicalRange?.[0]).toBeGreaterThan(0)
  })

  it('marks mountain biking with the MTB terrain bump', async () => {
    const { describeMIMEngine } = await import('../utils/trimp')
    const desc = describeMIMEngine('mountain_biking')
    expect(desc.engine).toBe('mountain-biking-if')
    expect(desc.formulaLabel).toMatch(/1\.2/)
  })

  it('marks hiking variants as grade-based (Minetti)', async () => {
    const { describeMIMEngine } = await import('../utils/trimp')
    expect(describeMIMEngine('hiking').engine).toBe('hiking-grade')
    expect(describeMIMEngine('hiking_steep').engine).toBe('hiking-grade')
    expect(describeMIMEngine('hiking').formulaLabel).toMatch(/Minetti/)
  })

  it('marks running variants as grade-based (Minetti run polynomial)', async () => {
    const { describeMIMEngine } = await import('../utils/trimp')
    expect(describeMIMEngine('running').engine).toBe('running-grade')
    expect(describeMIMEngine('trail_running').engine).toBe('running-grade')
    expect(describeMIMEngine('running_steep').engine).toBe('running-grade')
    expect(describeMIMEngine('running').formulaLabel).toMatch(/Minetti run/)
  })

  it('marks strength + swimming as static (no dynamic formula yet)', async () => {
    const { describeMIMEngine } = await import('../utils/trimp')
    expect(describeMIMEngine('strength_lower').engine).toBe('static')
    expect(describeMIMEngine('swimming').engine).toBe('static')
  })

  it('marks ebike as static (pedal assist breaks IF)', async () => {
    const { describeMIMEngine } = await import('../utils/trimp')
    expect(describeMIMEngine('ebike').engine).toBe('static')
    expect(describeMIMEngine('ebike').staticValue).toBe(0.30)
  })
})

describe('resolveMIM uses cached GAP MIM for runs when provided', () => {
  it('prefers gapMIM over avg-grade when supplied', async () => {
    const { resolveMIM } = await import('../utils/trimp')
    const out = resolveMIM('running_steep', {
      elevationGainFt: 800,    // would give ~5% avg over 3 mi → 1.30×
      distanceMi: 3.0,
      gapMIM: 1.85,            // simulates per-second weighting that captured peaks
    })
    expect(out.mim).toBe(1.85)
    expect(out.ifSource).toBe('grade')
  })

  it('falls back to avg-grade running MIM when gapMIM not provided', async () => {
    const { resolveMIM } = await import('../utils/trimp')
    const out = resolveMIM('running', {
      elevationGainFt: 800,
      distanceMi: 3.0,
    })
    // 800 / (3.0 × 5280) = 5.05% grade → ~1.31×
    expect(out.mim).toBeCloseTo(1.31, 1)
    expect(out.ifSource).toBe('grade')
  })

  it('falls back to static when neither gapMIM nor distance is available', async () => {
    const { resolveMIM } = await import('../utils/trimp')
    const out = resolveMIM('running', {})
    expect(out.mim).toBe(1.0)
    expect(out.ifSource).toBe('static')
  })

  it('ignores zero / negative gapMIM', async () => {
    const { resolveMIM } = await import('../utils/trimp')
    const out = resolveMIM('running', {
      elevationGainFt: 0,
      distanceMi: 5.0,
      gapMIM: 0,
    })
    // gapMIM 0 should be skipped, avg-grade 0% → 1.0×
    expect(out.mim).toBeCloseTo(1.0, 2)
  })
})

describe('runningMIM (Minetti run polynomial)', () => {
  it('matches the Hill Running Load v1.1 quick-reference table at the inflection points', async () => {
    const { runningMIM } = await import('../engines/terrain/locomotion/running')
    // Ranges per the v1.1 research summary; widen tolerance slightly since
    // the underlying Minetti polynomial is fitted to lab data.
    expect(runningMIM(0)).toBeCloseTo(1.00, 2)
    expect(runningMIM(0.05)).toBeCloseTo(1.30, 1)
    expect(runningMIM(0.10)).toBeCloseTo(1.66, 1)
    expect(runningMIM(0.15)).toBeCloseTo(2.06, 1)
    expect(runningMIM(0.20)).toBeCloseTo(2.50, 1)
    // Descents (energy cost only — eccentric handled by DOMS_CARRY)
    expect(runningMIM(-0.10)).toBeLessThan(1.0)
    expect(runningMIM(-0.20)).toBeLessThan(0.6)
  })

  it('is monotonic on climbs — steeper costs more', async () => {
    const { runningMIM } = await import('../engines/terrain/locomotion/running')
    expect(runningMIM(0.05)).toBeLessThan(runningMIM(0.10))
    expect(runningMIM(0.10)).toBeLessThan(runningMIM(0.15))
    expect(runningMIM(0.15)).toBeLessThan(runningMIM(0.20))
    expect(runningMIM(0.20)).toBeLessThan(runningMIM(0.30))
  })
})
