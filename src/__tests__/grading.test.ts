import { describe, it, expect, beforeEach } from 'vitest'
import { calculateGrade } from '../utils/grading'
import type { PlannedDay, ActualWorkout, HRZone } from '../types'

const mkActual = (overrides: Partial<ActualWorkout> = {}): ActualWorkout => ({
  stravaId: 1,
  source: 'strava',
  distance: 0,
  movingTime: 46 * 60,
  elapsedTime: 46 * 60,
  elevationGain: 0,
  type: 'indoor_cycling',
  name: 'Indoor Cycling',
  startDate: '2026-05-06T08:00:00',
  ...overrides,
})

const mkDay = (overrides: Partial<PlannedDay> = {}): PlannedDay => ({
  day: 'Wed 5/6',
  type: 'quality',
  workout: 'Bike intervals — Z4 efforts',
  detail: '6×3 min @ Z4',
  zone: '0.0 mi · Z4 (167–177)',
  route: 'Indoor',
  time: '60 min',
  actual: mkActual(),
  ...overrides,
})

const userZones200: HRZone[] = [
  { zone: 'Z1 – Recovery', hr: '110–130', pct: '55–65%', desc: '' },
  { zone: 'Z2 – Aerobic', hr: '130–150', pct: '65–75%', desc: '' },
  { zone: 'Z3 – Tempo', hr: '150–170', pct: '75–85%', desc: '' },
  { zone: 'Z4 – Threshold', hr: '170–180', pct: '85–90%', desc: '' },
]

beforeEach(() => {
  // Make sure no cached HR streams interfere — calculateGrade probes
  // localStorage by activity ID, and tests should run against avgHR fallback.
  if (typeof localStorage !== 'undefined') localStorage.clear()
})

describe('calculateGrade — sport-aware HR band', () => {
  it('grades a Z4 indoor-cycling workout in zone when avgHR matches cycling Z4', () => {
    // Plan Z4 = 167-177 (running). Cycling offset −10 → effective 157-167.
    // avgHR 162 falls inside the cycling-adjusted band → HR full credit.
    // Plan time 60 min, actual 46 min → 77% of plan → 0.85 effort + structure.
    const day = mkDay({ actual: mkActual({ avgHR: 162 }) })
    const result = calculateGrade(day)
    expect(result).not.toBeNull()
    expect(result!.reason).toContain('HR in zone')
    // Without the fix, avgHR=162 vs 167-177 grades as below zone → C/D.
    // With the fix, HR is in zone; with the 0-distance duration fallback,
    // effortScore picks up duration credit instead of staying at 0.5.
    expect(result!.score).toBeGreaterThanOrEqual(80)
  })

  it('still penalizes a cycling workout that was way too hard', () => {
    // Cycling Z4 effective band 157-167. avgHR=190 is far over (190 > 167+5).
    const day = mkDay({ actual: mkActual({ avgHR: 190 }) })
    const result = calculateGrade(day)
    expect(result).not.toBeNull()
    // 190 is more than 10 over high (167+5=172 expanded), so hrScore drops.
    expect(result!.reason).toContain('HR above zone')
  })

  it('uses athlete-customized zones (maxHR=200) over plan defaults', () => {
    // Running plan Z4 (167–177) + maxHR=200 customization → user Z4 = 170–180.
    // For a RUN actual, no sport offset. avgHR 175 sits in customized band.
    const day = mkDay({
      type: 'quality',
      detail: 'Hill bounding',  // no tempo intervals → run-grading branch
      zone: '4.0 mi · Z4 bounds (167–177)',
      actual: mkActual({
        type: 'running',
        name: 'Z4 hill bounding',
        distance: 4.0,
        avgHR: 175,
      }),
    })
    const result = calculateGrade(day, userZones200)
    expect(result).not.toBeNull()
    expect(result!.reason).toContain('HR in zone')
  })

  it('stacks customized zones with cycling offset: maxHR=200 + indoor cycle', () => {
    // user Z4 = 170-180; cycling offset -10 → effective 160-170. avgHR 165 in band.
    const day = mkDay({ actual: mkActual({ avgHR: 165 }) })
    const result = calculateGrade(day, userZones200)
    expect(result).not.toBeNull()
    expect(result!.reason).toContain('HR in zone')
    expect(result!.score).toBeGreaterThanOrEqual(80)
  })

  it('returns null for rest days regardless of inputs', () => {
    const day: PlannedDay = {
      day: 'Sun 5/3',
      type: 'rest',
      workout: 'Rest',
      detail: '',
      zone: '—',
      route: '—',
      time: '—',
    }
    expect(calculateGrade(day, userZones200)).toBeNull()
  })

  it('falls back to plan zones when no user zones provided (backward compat)', () => {
    // No user zones, no sport offset for running. Plan Z4 = 167-177.
    // avgHR=172 in band → HR full credit.
    const day = mkDay({
      detail: 'Hill bounding',
      zone: '4.0 mi · Z4 (167–177)',
      actual: mkActual({
        type: 'running',
        name: 'Z4 hill bounding',
        distance: 4.0,
        avgHR: 172,
      }),
    })
    const result = calculateGrade(day)
    expect(result).not.toBeNull()
    expect(result!.reason).toContain('HR in zone')
  })
})
