/**
 * Per-set time: the number that matters on a wall-ball set, a SkiErg
 * 500 m or a sled push. Microwave-style entry (digits fill from the
 * right into m:ss), one display format everywhere.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { secondsFromDigits, digitsFromSeconds, formatSetTime, formatDigits } from '../utils/setTime'
import { lastSessionSummary } from '../utils/strengthDraft'
import { buildProgression, normalizeExerciseName } from '../utils/strengthProgression'
import WorkoutModal from '../components/WorkoutModal'
import type { PlannedDay, TrainingWeek } from '../types'

afterEach(cleanup)

describe('digits ↔ seconds', () => {
  it('fills from the right: 1 → 0:01, 14 → 0:14, 145 → 1:45, 1245 → 12:45', () => {
    expect(secondsFromDigits('1')).toBe(1)
    expect(secondsFromDigits('14')).toBe(14)
    expect(secondsFromDigits('145')).toBe(105)
    expect(secondsFromDigits('1245')).toBe(765)
    expect(secondsFromDigits('')).toBe(0)
  })

  it('seconds past 59 roll into minutes instead of making an impossible clock', () => {
    expect(secondsFromDigits('175')).toBe(135) // typed 1:75 → 2:15
    expect(formatSetTime(secondsFromDigits('175'))).toBe('2:15')
  })

  it('round-trips a stored time back into the keypad buffer', () => {
    for (const sec of [1, 45, 60, 105, 765, 3725]) {
      expect(secondsFromDigits(digitsFromSeconds(sec))).toBe(sec)
    }
    expect(digitsFromSeconds(undefined)).toBe('')
    expect(digitsFromSeconds(0)).toBe('')
  })

  it('always shows the seconds', () => {
    expect(formatSetTime(105)).toBe('1:45')
    expect(formatSetTime(765)).toBe('12:45')   // never "12 min"
    expect(formatSetTime(3725)).toBe('62:05')
    expect(formatSetTime(undefined)).toBe('')
    expect(formatDigits('')).toBe('0:00')
    expect(formatDigits('9')).toBe('0:09')
  })
})

function timedWeek(): TrainingWeek {
  return {
    num: 3, dates: 'Sep 14–20', startIso: '2026-09-14', miles: 12, focus: 'Build',
    days: [{
      day: 'Mon 9/14', type: 'strength', workout: 'STRENGTH', detail: 'Wall ball 3×20', zone: 'Z1', route: 'Gym', time: '45 min',
      actual: {
        stravaId: 7, source: 'manual', distance: 0, movingTime: 2400, elapsedTime: 2400, elevationGain: 0,
        type: 'strength_training', name: 'Strength — Mon 9/14', startDate: '2026-09-14T08:00:00',
        strengthLog: [
          { name: 'Wall ball', focus: 'full', sets: [
            { reps: 20, weight: '18 lb', timeSec: 105 },
            { reps: 15, weight: '18 lb', timeSec: 110 },
            { reps: 15, weight: '18 lb', done: false, timeSec: 999 }, // skipped: never in history
          ] },
          { name: 'Goblet squats', focus: 'lower', sets: [{ reps: 12, weight: '20 lb' }, { reps: 12, weight: '20 lb' }] },
        ],
      },
    }],
  }
}

describe('where the time shows', () => {
  it('the "Last time" line carries the times when the sets were timed, and stays as it was when not', () => {
    const prog = buildProgression([timedWeek()])
    expect(lastSessionSummary(prog.get(normalizeExerciseName('Wall ball')))).toBe('18 lb × 20, 15 · 1:45, 1:50')
    expect(lastSessionSummary(prog.get(normalizeExerciseName('Goblet squats')))).toBe('20 lb × 12, 12')
  })

  it('the workout modal prints each set\'s time after its load', () => {
    const day: PlannedDay = timedWeek().days[0]
    render(<WorkoutModal day={day} weekNum={3} onClose={() => {}} />)
    expect(screen.getByText(/20 reps @ 18 lb · 1:45/)).toBeTruthy()
    expect(screen.getByText(/15 reps @ 18 lb · 1:50/)).toBeTruthy()
    expect(screen.getAllByText(/12 reps @ 20 lb$/)).toHaveLength(2) // untimed sets stay as they were
  })
})
