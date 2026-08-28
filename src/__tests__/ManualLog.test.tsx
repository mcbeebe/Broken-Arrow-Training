/**
 * Field bug: the Station circuit — the day's MAIN workout (type 'cross',
 * route 'Gym') — opened the manual log on the Run/Cardio tab with the
 * circuit's exercises buried under "Mobility / Activation". To the athlete
 * a station circuit IS a strength session: it must open on the Strength
 * tab with the circuit imported as loggable exercises.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ManualLog from '../components/ManualLog'
import type { PlannedDay, ActualWorkout } from '../types'

afterEach(cleanup)

// The generator's real intro-circuit shape (planGenerator.ts).
const circuitDay: PlannedDay = {
  day: 'Fri 8/21',
  type: 'cross',
  workout: 'Station circuit (intro)',
  detail: 'Sled push 4×15m · Wall balls 3×15 · Farmer carry 3×40m · Rest 2 min between',
  zone: 'Z2',
  route: 'Gym',
  time: '45 min',
}

const crossDay: PlannedDay = {
  day: 'Wed 8/19',
  type: 'cross',
  workout: 'Bike or swim',
  detail: 'Easy spin or swim · Hip openers · Leg swings',
  zone: 'Z1',
  route: 'Your choice',
  time: '40 min',
}

function renderLog(planned: PlannedDay, existing?: ActualWorkout) {
  return render(
    <ManualLog
      dayLabel={planned.day}
      planned={planned}
      existing={existing}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />,
  )
}

describe('ManualLog — gym-circuit days log as strength', () => {
  it('opens a station-circuit day on the Strength tab, not Run/Cardio', () => {
    renderLog(circuitDay)
    // Strength mode is active: its exercise toolbar is rendered, and the
    // run-only Distance field is not.
    expect(screen.getByText('+ Add Exercise')).toBeTruthy()
    expect(screen.queryByText('Distance (mi)')).toBeNull()
  })

  it('pre-populates the circuit as loggable exercises from the plan detail', () => {
    renderLog(circuitDay)
    expect(screen.getByDisplayValue('Sled push')).toBeTruthy()
    expect(screen.getByDisplayValue('Wall balls')).toBeTruthy()
    expect(screen.getByDisplayValue('Farmer carry')).toBeTruthy()
  })

  it('never shows the circuit as "Mobility / Activation"', () => {
    renderLog(circuitDay)
    expect(screen.queryByText('Mobility / Activation')).toBeNull()
  })

  it('an existing strength log wins over the plan prescription', () => {
    renderLog(circuitDay, {
      stravaId: 1,
      source: 'garmin',
      distance: 0,
      movingTime: 2400,
      elapsedTime: 2400,
      elevationGain: 0,
      type: 'strength_training',
      name: 'Circuit as done',
      startDate: '2026-08-21T17:00:00',
      strengthLog: [{ name: 'Kettlebell swing', focus: 'full', sets: [{ reps: 15, weight: '16kg' }] }],
    })
    expect(screen.getByDisplayValue('Kettlebell swing')).toBeTruthy()
    expect(screen.queryByDisplayValue('Sled push')).toBeNull()
  })

  it('a non-gym cross day still opens on Run/Cardio with Mobility / Activation', () => {
    renderLog(crossDay)
    expect(screen.getByText('Distance (mi)')).toBeTruthy()
    expect(screen.getByText('Mobility / Activation')).toBeTruthy()
  })

  it('a plain run day keeps the Run/Cardio default', () => {
    renderLog({ ...crossDay, type: 'run', workout: 'Easy run', detail: 'Conversational pace', route: 'Neighborhood' })
    expect(screen.getByText('Distance (mi)')).toBeTruthy()
  })
})

describe('ManualLog — the manual-override escape hatch', () => {
  it('offers Remove when a manual entry exists, and routes it', () => {
    const onRemove = vi.fn()
    render(
      <ManualLog
        dayLabel={crossDay.day}
        planned={crossDay}
        hasManualEntry
        onRemove={onRemove}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/override whatever your watch synced/)).toBeTruthy()
    screen.getByTestId('remove-manual-log').click()
    expect(onRemove).toHaveBeenCalled()
  })

  it('no manual entry, no remove button', () => {
    render(
      <ManualLog dayLabel={crossDay.day} planned={crossDay} onSave={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.queryByTestId('remove-manual-log')).toBeNull()
  })
})
