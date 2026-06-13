import { describe, it, expect, beforeEach } from 'vitest'
import { calculateGrade } from '../utils/grading'
import type { PlannedDay, ActualWorkout } from '../types'

/** Build a 1 Hz HR stream from {hr, seconds} segments and cache it the way
 *  the app does so `getCachedHRStream` finds it during grading. */
function cacheStream(id: number, segments: { hr: number; seconds: number }[]): number {
  const time: number[] = []
  const heartrate: number[] = []
  let t = 0
  for (const seg of segments) {
    for (let s = 0; s < seg.seconds; s++) {
      time.push(t)
      heartrate.push(seg.hr)
      t++
    }
  }
  localStorage.setItem(`ba_strava_streams_${id}`, JSON.stringify({ time, heartrate }))
  return id
}

function actual(overrides: Partial<ActualWorkout>): ActualWorkout {
  return {
    stravaId: 1,
    distance: 0,
    movingTime: 0,
    elapsedTime: 0,
    elevationGain: 0,
    type: 'Run',
    name: 'Test',
    startDate: '2026-06-10T08:00:00Z',
    ...overrides,
  }
}

describe('calculateGrade — interval/warm-up awareness', () => {
  beforeEach(() => localStorage.clear())

  it('does NOT tank a well-executed sharpener that overshoots the cap', () => {
    // 15 min easy warm-up + 3×5 min Z4 reps (above the Z3 cap) + recoveries.
    cacheStream(900, [
      { hr: 120, seconds: 15 * 60 },
      { hr: 178, seconds: 5 * 60 },
      { hr: 120, seconds: 2 * 60 },
      { hr: 178, seconds: 5 * 60 },
      { hr: 120, seconds: 2 * 60 },
      { hr: 178, seconds: 5 * 60 },
    ])
    const day: PlannedDay = {
      day: 'Wed 6/10',
      type: 'quality',
      workout: 'Sharpener',
      detail: '3x5 min @ Z3 with 2 min easy recovery',
      zone: '3.5 mi · Z3 (148–167)',
      route: 'Track',
      time: '34 min',
      actual: actual({
        stravaId: 900,
        distance: 3.5,
        movingTime: 34 * 60,
        avgHR: 150,
      }),
    }

    const g = calculateGrade(day)
    expect(g).not.toBeNull()
    // Old strict-in-band math gave this a D (~29% in zone). Crediting the
    // work + excluding the warm-up should land it solidly in B/A territory.
    expect(g!.score).toBeGreaterThanOrEqual(80)
    expect(['D', 'D+', 'C-', 'C', 'C+']).not.toContain(g!.grade)
    expect(g!.reason).toContain('working')
    expect(g!.reason).toContain('warm-up excluded')
  })

  it('still rewards a steady run, with the warm-up no longer dragging it down', () => {
    cacheStream(901, [
      { hr: 115, seconds: 10 * 60 }, // easy start
      { hr: 138, seconds: 40 * 60 }, // steady Z2
      { hr: 110, seconds: 5 * 60 },  // easy finish
    ])
    const day: PlannedDay = {
      day: 'Tue 6/9',
      type: 'run',
      workout: 'Easy run',
      detail: '5 mi easy Z2',
      zone: '5 mi · Z2 (128–148)',
      route: 'Road',
      time: '55 min',
      actual: actual({
        stravaId: 901,
        distance: 5,
        movingTime: 55 * 60,
        avgHR: 134,
      }),
    }

    const g = calculateGrade(day)
    expect(g).not.toBeNull()
    expect(g!.score).toBeGreaterThanOrEqual(85)
    expect(g!.reason).toContain('HR in zone')
  })
})
