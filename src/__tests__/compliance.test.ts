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
})

describe('gradeWorkoutDay — duration grading', () => {
  it('grades near-exact duration as hit', () => {
    const day = mkDay({ actual: mkActual({ movingTime: 47 * 60 }) })  // 47 min vs 45
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.durationGrade).toBe('hit')
  })

  it('grades 38-min actual vs 45-min target as close (below hit band)', () => {
    const day = mkDay({ actual: mkActual({ movingTime: 38 * 60 }) })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    // 38/45 = 0.844 → within close band [0.8, 1.2] but outside hit [0.9, 1.1]
    expect(result.durationGrade).toBe('close')
  })

  it('grades 30-min actual vs 45-min target as miss (>20% short)', () => {
    const day = mkDay({ actual: mkActual({ movingTime: 30 * 60 }) })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    // 30/45 = 0.666 → below 0.8 → miss
    expect(result.durationGrade).toBe('miss')
  })

  it('grades no movingTime as na', () => {
    const day = mkDay({ actual: mkActual({ movingTime: 0 }) })
    const result = gradeWorkoutDay(day, parsePlannedTargets(day))
    expect(result.durationGrade).toBe('na')
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
})
