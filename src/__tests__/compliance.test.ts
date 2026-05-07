import { describe, it, expect } from 'vitest'
import { gradeWorkoutDay, computeHRTimeInZone } from '../hooks/useCompliance'
import { parsePlannedTargets } from '../utils/targets'
import type { PlannedDay, ActualWorkout } from '../types'

// ─── Helpers ─────────────────────────────────────────────────────

const mkActual = (overrides: Partial<ActualWorkout> = {}): ActualWorkout => ({
  stravaId: 1,
  source: 'strava',
  distance: 3.0,
  movingTime: 45 * 60,  // 45 min
  elapsedTime: 45 * 60,
  elevationGain: 0,
  type: 'Run',
  name: 'Easy run',
  startDate: '2026-04-14T08:00:00',
  ...overrides,
})

const mkDay = (overrides: Partial<PlannedDay> = {}): PlannedDay => ({
  day: 'Tue 4/14',
  type: 'run',
  workout: 'Easy run',
  detail: 'Conversational pace',
  zone: '3.0 mi · Z1–2 (108–148)',
  route: 'Temescal',
  time: '45 min',
  actual: mkActual(),
  ...overrides,
})

// ─── gradeWorkoutDay ─────────────────────────────────────────────

describe('gradeWorkoutDay — distance grading', () => {
  it('grades exact match as hit', () => {
    const day = mkDay({ actual: mkActual({ distance: 3.0 }) })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.distanceGrade).toBe('hit')
    expect(result.distancePct).toBeCloseTo(1.0)
  })

  it('grades +5% as hit', () => {
    const day = mkDay({ actual: mkActual({ distance: 3.15 }) })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.distanceGrade).toBe('hit')
  })

  it('grades +15% as close', () => {
    const day = mkDay({ actual: mkActual({ distance: 3.45 }) })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.distanceGrade).toBe('close')
  })

  it('grades +25% as over', () => {
    const day = mkDay({ actual: mkActual({ distance: 3.75 }) })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.distanceGrade).toBe('over')
  })

  it('grades -15% as close (slight miss)', () => {
    const day = mkDay({ actual: mkActual({ distance: 2.55 }) })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.distanceGrade).toBe('close')
  })

  it('grades -40% as miss and flags', () => {
    const day = mkDay({ actual: mkActual({ distance: 1.8 }) })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.distanceGrade).toBe('miss')
    expect(result.flagged).toBe(true)
    expect(result.flagReasons[0]).toContain('Distance')
  })
})

describe('gradeWorkoutDay — HR grading', () => {
  it('marks HR hit when time-in-zone ≥ 75% (zone summary path)', () => {
    // 30 min of Z2 (in zone 108-148), 10 min Z3 (out) = 75% in zone
    const day = mkDay({
      actual: mkActual({
        hrZoneSummary: [
          { zone: 2, seconds: 30 * 60 },  // Z2 mid=138, in 108-148
          { zone: 3, seconds: 10 * 60 },  // Z3 mid=158, out
        ],
      }),
    })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.hrInZonePct).toBe(75)
    expect(result.hrGrade).toBe('hit')
  })

  it('marks HR close when time-in-zone 50-75%', () => {
    const day = mkDay({
      actual: mkActual({
        hrZoneSummary: [
          { zone: 2, seconds: 20 * 60 },  // in zone
          { zone: 3, seconds: 20 * 60 },  // out
        ],
      }),
    })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.hrInZonePct).toBe(50)
    expect(result.hrGrade).toBe('close')
  })

  it('marks HR miss when time-in-zone < 50% and flags', () => {
    const day = mkDay({
      actual: mkActual({
        hrZoneSummary: [
          { zone: 2, seconds: 5 * 60 },    // in zone
          { zone: 3, seconds: 20 * 60 },   // out (ran too hard)
          { zone: 4, seconds: 15 * 60 },   // out (way too hard)
        ],
      }),
    })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.hrInZonePct).toBe(12.5)
    expect(result.hrGrade).toBe('miss')
    expect(result.flagged).toBe(true)
    expect(result.flagReasons.some(r => r.includes('HR'))).toBe(true)
  })

  it('falls back to avgHR binary check when no zone summary', () => {
    const day = mkDay({ actual: mkActual({ avgHR: 135 }) })  // within 108-148
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.hrInZonePct).toBe(100)
    expect(result.hrGrade).toBe('hit')
  })

  it('falls back avgHR out-of-range → 0% and miss', () => {
    const day = mkDay({ actual: mkActual({ avgHR: 165 }) })  // above 148
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.hrInZonePct).toBe(0)
    expect(result.hrGrade).toBe('miss')
  })

  it('returns na hr grade when no HR data at all', () => {
    const day = mkDay({ actual: mkActual({}) })  // no avgHR, no zone summary
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.hrGrade).toBe('na')
    expect(result.hrInZonePct).toBeUndefined()
  })

  it('grades a Z4 bike workout against a sport-shifted target band', () => {
    // Plan: running Z4 (167–177). Athlete swapped in indoor cycling.
    // Cycling pushes typically sit ~10 bpm below the running zone, so
    // an avg of 162 bpm (sustained Z4 cycling) should grade as hit, not
    // a miss for being below the running band.
    const day = mkDay({
      type: 'quality',
      zone: '4.0 mi · Z4 (167–177)',
      actual: mkActual({
        type: 'indoor_cycling',
        name: 'Indoor Cycling',
        distance: 0,
        avgHR: 162,
      }),
    })
    const cyclingTargets = parsePlannedTargets(day, 'cycling')
    const result = gradeWorkoutDay(day, cyclingTargets)
    // Shifted band 157–167 → 162 is in zone → hit
    expect(cyclingTargets.hrLow).toBe(157)
    expect(cyclingTargets.hrHigh).toBe(167)
    expect(result.hrGrade).toBe('hit')
  })
})

describe('gradeWorkoutDay — duration grading', () => {
  // Run days grade against the running-time RANGE (32–38 min for a 3mi
  // easy run), not the 45-min total plan time (which includes drills).

  it('grades actual inside running-time range as hit', () => {
    const day = mkDay({ actual: mkActual({ movingTime: 34 * 60 }) })  // inside 32–38
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.durationGrade).toBe('hit')
  })

  it('grades 45-min actual as over (well above 38 upper bound)', () => {
    const day = mkDay({ actual: mkActual({ movingTime: 47 * 60 }) })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    // 47 > 38 * 1.2 = 45.6 → over
    expect(result.durationGrade).toBe('over')
  })

  it('grades 30-min actual (just below 32 lower bound) as close', () => {
    const day = mkDay({ actual: mkActual({ movingTime: 30 * 60 }) })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    // 30 is in [32*0.8=25.6, 38*1.2=45.6] but outside [32,38] → close
    expect(result.durationGrade).toBe('close')
  })

  it('grades 20-min actual as miss (well below lower bound)', () => {
    const day = mkDay({ actual: mkActual({ movingTime: 20 * 60 }) })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    // 20 < 32 * 0.8 = 25.6 → miss
    expect(result.durationGrade).toBe('miss')
  })

  it('falls back to durationMin for strength/non-run days', () => {
    const day = mkDay({
      type: 'strength',
      zone: 'Z1 (108–128)',  // no distance → no range
      time: '1 hr',
      actual: mkActual({ movingTime: 55 * 60 }),
    })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    // 55/60 = 0.917 → hit
    expect(result.durationGrade).toBe('hit')
  })

  it('grades no movingTime as na', () => {
    const day = mkDay({ actual: mkActual({ movingTime: 0 }) })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.durationGrade).toBe('na')
  })
})

// ─── Drills grading ─────────────────────────────────────────────

describe('gradeWorkoutDay — drills', () => {
  const mkDrillDay = (drillsOverride?: Partial<ActualWorkout['drills']>, detail = 'Conversational pace · A-skips 3×20m · Strides 4×100m') =>
    mkDay({
      detail,
      actual: mkActual({
        drills: drillsOverride as ActualWorkout['drills'],
      }),
    })

  it('grades drill as hit when completed', () => {
    const day = mkDrillDay({ completed: true })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.drillsPlanned).toBe(true)
    expect(result.drillGrade).toBe('hit')
  })

  it('grades drill as miss when planned + not completed', () => {
    const day = mkDrillDay({ completed: false })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.drillsPlanned).toBe(true)
    expect(result.drillGrade).toBe('miss')
    expect(result.flagReasons.some(r => r.includes('Drills'))).toBe(true)
  })

  it('grades drill as na when no drills planned', () => {
    const day = mkDay({ detail: 'Conversational pace' })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.drillsPlanned).toBe(false)
    expect(result.drillGrade).toBe('na')
  })

  it('drill duration credits total time when logged', () => {
    // Plan: 45 min total, 3mi easy run (32-38 min running-time range)
    // Actual: 34 min moving + 10 min drills = 44 min
    // With drills logged, grade against total 45 → 44/45 = 0.978 → hit
    const day = mkDay({
      detail: '· A-skips 3×20m · Strides 4×100m',
      actual: mkActual({
        movingTime: 34 * 60,
        drills: { completed: true, durationMin: 10 },
      }),
    })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.durationGrade).toBe('hit')
  })
})

// ─── computeHRTimeInZone direct tests ────────────────────────────

describe('computeHRTimeInZone', () => {
  it('credits zones whose midpoint falls inside target band', () => {
    const pct = computeHRTimeInZone(
      [
        { zone: 1, seconds: 600 },  // Z1 mid=118, in 108-148 ✓
        { zone: 2, seconds: 600 },  // Z2 mid=138, in 108-148 ✓
        { zone: 3, seconds: 600 },  // Z3 mid=158, out ✗
      ],
      108, 148,
    )
    expect(pct).toBeCloseTo((1200 / 1800) * 100)
  })

  it('returns undefined when summary is empty', () => {
    expect(computeHRTimeInZone([], 108, 148)).toBeUndefined()
  })

  it('returns undefined when no summary and no avgHR', () => {
    expect(computeHRTimeInZone(undefined, 108, 148)).toBeUndefined()
  })

  it('returns 100 when summary missing but avgHR in range', () => {
    expect(computeHRTimeInZone(undefined, 108, 148, 130)).toBe(100)
  })

  it('returns 0 when summary missing and avgHR out of range', () => {
    expect(computeHRTimeInZone(undefined, 108, 148, 155)).toBe(0)
  })

  it('uses device-reported zone boundaries when present (fractional overlap)', () => {
    // Garmin device zones: Z1 100-119, Z2 120-139, Z3 140-159, Z4 160-179, Z5 180+
    // Plan target: 108-148 — overlaps Z1 (108-119 = 12 of 20), Z2 (fully, 20/20),
    // Z3 (140-148 = 9 of 20). Z4/Z5 = 0.
    const summary = [
      { zone: 1, seconds: 100, lowHR: 100, highHR: 119 },  // 12/20 = 0.6 in target
      { zone: 2, seconds: 200, lowHR: 120, highHR: 139 },  // 20/20 = 1.0
      { zone: 3, seconds: 100, lowHR: 140, highHR: 159 },  // 9/20 = 0.45
      { zone: 4, seconds: 100, lowHR: 160, highHR: 179 },  // 0
    ]
    const pct = computeHRTimeInZone(summary, 108, 148)!
    // In-zone = 100*0.6 + 200*1.0 + 100*0.45 + 0 = 60 + 200 + 45 = 305
    // Total = 500. 305/500 = 61%
    expect(pct).toBeCloseTo(61, 0)
  })

  it('device zone labeled Z3 but band overlaps plan target → still credited', () => {
    // Scenario: Garmin Z3 = 130-149, plan target = 108-148.
    // User spent 90% in device Z3 (actually in plan Z2 range).
    const summary = [
      { zone: 2, seconds: 60, lowHR: 110, highHR: 129 },
      { zone: 3, seconds: 540, lowHR: 130, highHR: 149 },  // 19/20 of this zone in target
    ]
    const pct = computeHRTimeInZone(summary, 108, 148)!
    // Z2 fully in target (110-129 ⊆ 108-148): 60 * 1.0 = 60
    // Z3: overlap 130-148 = 19 of 20: 540 * 0.95 = 513
    // Total 600 → (573/600)*100 ≈ 95.5%
    expect(pct).toBeGreaterThan(90)
  })
})
