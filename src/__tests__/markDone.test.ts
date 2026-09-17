/**
 * "Mark as done": the planned duration becomes the logged duration, a walk
 * logs as a walk, and the receipt line says where a session came from.
 */
import { describe, it, expect } from 'vitest'
import { plannedMinutes, actualFromPlanned, completionSummary } from '../utils/markDone'
import type { PlannedDay } from '../types'

const walk: PlannedDay = { day: 'Thu 9/17', type: 'limited', workout: 'Easy walk (RED day)', detail: 'Flat walk 20-30 min @ Z1 · Foam roll 15 min', zone: 'Z1', route: '—', time: '20-30 min' }

describe('plannedMinutes', () => {
  it('reads ranges, approximate, hours and plain minutes; null when nothing is named', () => {
    expect(plannedMinutes('20-30 min')).toBe(25)
    expect(plannedMinutes('45-60 min')).toBe(53)
    expect(plannedMinutes('~90 min')).toBe(90)
    expect(plannedMinutes('1.5 hr')).toBe(90)
    expect(plannedMinutes('60 min')).toBe(60)
    expect(plannedMinutes('—')).toBeNull()
    expect(plannedMinutes(undefined)).toBeNull()
  })
})

describe('actualFromPlanned', () => {
  it('logs the planned session for its planned duration on the given date, as a manual entry', () => {
    const a = actualFromPlanned(walk, '2026-09-17', new Date(2026, 8, 17, 15, 50).getTime())
    expect(a).toMatchObject({ source: 'manual', type: 'walk', name: 'Easy walk (RED day)', movingTime: 25 * 60, elapsedTime: 25 * 60, distance: 0, notes: 'Marked as done' })
    expect(a.startDate).toBe('2026-09-17T15:50:00')
  })

  it('a run-type day logs as a run; a strength day as a workout; no duration falls back to 30 min', () => {
    expect(actualFromPlanned({ ...walk, type: 'run', workout: 'Easy run', detail: '', time: '—' }, '2026-09-17', 1).type).toBe('run')
    expect(actualFromPlanned({ ...walk, type: 'strength', workout: 'Strength', detail: '', time: '45-60 min' }, '2026-09-17', 1).type).toBe('workout')
    expect(actualFromPlanned({ ...walk, type: 'run', workout: 'Easy run', detail: '', time: '—' }, '2026-09-17', 1).movingTime).toBe(30 * 60)
  })
})

describe('completionSummary', () => {
  it('names duration, distance, heart rate and source', () => {
    expect(completionSummary({ stravaId: 1, source: 'garmin', distance: 1.62, movingTime: 24 * 60, elapsedTime: 25 * 60, elevationGain: 0, type: 'walk', name: 'Walk', startDate: '2026-09-17T15:00:00', avgHR: 101.4 })).toBe('24 min · 1.6 mi · 101 bpm avg · from Garmin')
    expect(completionSummary(actualFromPlanned(walk, '2026-09-17', 1))).toBe('25 min · marked done')
  })
})
