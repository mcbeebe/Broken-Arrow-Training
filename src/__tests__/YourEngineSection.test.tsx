/**
 * Adaptive engine PR 5 — "Your Engine": the model rendered with its
 * receipts, and honest not-enough-data states.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import YourEngineSection from '../components/YourEngineSection'
import type { PlannedDay, TrainingWeek, ActualWorkout } from '../types'

afterEach(cleanup)

function run(iso: string, miles: number, sec: number, avgHR?: number): PlannedDay {
  const actual: ActualWorkout = {
    stravaId: 1, source: 'strava', distance: miles, movingTime: sec, elapsedTime: sec + 60,
    elevationGain: 0, type: 'Run', name: 'Run', startDate: `${iso}T07:00:00`, avgHR,
  }
  return {
    day: 'Tue', type: 'run', workout: 'Run', detail: '', zone: `${miles} mi · Z2 (130–148)`,
    route: '', time: '45 min', actual,
  }
}

function weeksOf(days: PlannedDay[]): TrainingWeek[] {
  return [{ num: 1, dates: '', startIso: '2026-06-01', miles: 0, focus: 'Build', days }]
}

describe('YourEngineSection', () => {
  it('renders measured cards with their provenance', () => {
    const days = [
      run('2026-08-10', 4, 2400, 140),
      run('2026-08-17', 3, 1500, 150),   // faster short effort — spreads the frontier
      run('2026-08-20', 6, 3900, 141),
      run('2026-08-24', 2, 900, 155),
    ]
    render(<YourEngineSection weeks={weeksOf(days)} capacity={{ measuredAt: '2026-08-26', erg500Sec: 112 }} />)
    expect(screen.getByText('⚙️ Your engine')).toBeTruthy()
    expect(screen.getByText(/Critical speed/i)).toBeTruthy()
    // Provenance line present in one form or the other.
    expect(screen.getByText(/fit from \d+ efforts|best-effort floor/)).toBeTruthy()
    expect(screen.getByText(/measured, trailing 4 weeks/)).toBeTruthy()
    expect(screen.getByText('500 m erg')).toBeTruthy()
    expect(screen.getByText('1:52')).toBeTruthy()
  })

  it('renders honest not-enough-data states for a fresh athlete', () => {
    render(<YourEngineSection weeks={weeksOf([])} />)
    expect(screen.getAllByText(/Not enough data yet/).length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText(/Race projection/)).toBeNull()
  })
})
