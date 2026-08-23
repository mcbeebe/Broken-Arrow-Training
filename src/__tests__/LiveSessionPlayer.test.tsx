/**
 * The live-session player (Phase 2, PR 4) — full-screen flow over the
 * engine: preview → exercise → rest → summary, plus crash-resume.
 * Timing displays are not asserted (the engine's own suite covers the
 * clock math); these tests pin the flow and the save contract.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import LiveSessionPlayer from '../components/LiveSessionPlayer'
import { startSession, saveDraft } from '../utils/liveSession'
import type { ActualWorkout, PlannedDay, TrainingWeek } from '../types'

afterEach(cleanup)
beforeEach(() => localStorage.clear())

const plannedDay: PlannedDay = {
  day: 'Mon 8/24', type: 'strength', workout: 'STRENGTH',
  detail: 'Goblet squats 2×12 · Plank 1×45s',
  zone: 'Z1', route: 'Gym', time: '1 hr',
}

function historyWeeks(): TrainingWeek[] {
  return [{
    num: 6, dates: 'Aug 10–16', miles: 10, focus: 'Build',
    days: [{
      day: 'Mon 8/10', type: 'strength', workout: 'STRENGTH',
      detail: 'Goblet squats 2×12', zone: 'Z1', route: 'Gym', time: '1 hr',
      actual: {
        stravaId: 1, source: 'manual', distance: 0, movingTime: 3000,
        elapsedTime: 3000, elevationGain: 0, type: 'strength_training',
        name: 'Strength', startDate: '2026-08-10T08:00:00',
        strengthLog: [{
          name: 'Goblet squats', focus: 'lower',
          sets: [{ reps: 12, weight: '20 lb' }, { reps: 12, weight: '20 lb' }],
        }],
      },
    }],
  }]
}

function renderPlayer(overrides: Partial<Parameters<typeof LiveSessionPlayer>[0]> = {}) {
  const onSave = vi.fn()
  const onClose = vi.fn()
  render(
    <LiveSessionPlayer
      planned={plannedDay}
      dayLabel="Mon 8/24"
      dayIso="2026-08-24"
      athleteId="mike"
      allWeeks={historyWeeks()}
      onSave={onSave}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onSave, onClose }
}

describe('preview (screen 5)', () => {
  it('lists the drafted prescription with history and offers Start', () => {
    const { onClose } = renderPlayer()
    expect(screen.getByText('Goblet squats')).toBeTruthy()
    expect(screen.getByText(/last: 20 lb × 12, 12/)).toBeTruthy()
    expect(screen.getByText('Start workout')).toBeTruthy()
    fireEvent.click(screen.getByText('or log it afterwards'))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('the session flow', () => {
  it('start → log sets through rest → summary, with the save contract intact', () => {
    const { onSave, onClose } = renderPlayer()
    fireEvent.click(screen.getByText('Start workout'))

    // Exercise view: goblet squats, set 1 current.
    expect(screen.getByText('Exercise 1 of 2')).toBeTruthy()
    fireEvent.click(screen.getByText(/Log set 1/))

    // Rest screen (dark) with the escape hatches.
    expect(screen.getByText('Rest')).toBeTruthy()
    expect(screen.getByText('+30s')).toBeTruthy()
    fireEvent.click(screen.getByText('Skip rest'))

    // Set 2 → rest → Plank (final set logs straight to summary).
    fireEvent.click(screen.getByText(/Log set 2/))
    fireEvent.click(screen.getByText('Skip rest'))
    expect(screen.getByText('Exercise 2 of 2')).toBeTruthy()
    fireEvent.click(screen.getByText(/Log set 1 · finish/))

    // Summary.
    expect(screen.getByText(/Session done/)).toBeTruthy()
    expect(screen.getByText('3/3')).toBeTruthy()
    fireEvent.click(screen.getByText('Save workout'))

    const workout: ActualWorkout = onSave.mock.calls[0][0]
    const meta = onSave.mock.calls[0][1]
    expect(meta).toEqual({ dayLabel: 'Mon 8/24', dayIso: '2026-08-24' })
    expect(workout.type).toBe('strength_training')
    expect(workout.strengthLog).toHaveLength(2)
    expect(workout.strengthLog![0].sets.every(s => s.done === true)).toBe(true)
    expect(onClose).toHaveBeenCalled()
    // Draft cleared — nothing to resume.
    expect(localStorage.getItem('ba_live_session_draft_mike')).toBeNull()
  })

  it('skip set advances without credit and the summary counts it honestly', () => {
    renderPlayer()
    fireEvent.click(screen.getByText('Start workout'))
    fireEvent.click(screen.getByText('skip set'))          // set 1 skipped
    fireEvent.click(screen.getByText(/Log set 2/))
    fireEvent.click(screen.getByText('Skip rest'))
    fireEvent.click(screen.getByText(/Log set 1 · finish/))
    expect(screen.getByText('2/3')).toBeTruthy()
  })

  it('steppers edit the current set in place', () => {
    renderPlayer()
    fireEvent.click(screen.getByText('Start workout'))
    // Ghosted from history: 20 lb. One bump → 22.5.
    fireEvent.click(screen.getAllByLabelText('plus lb')[0])
    expect(screen.getByText('22.5')).toBeTruthy()
    fireEvent.click(screen.getAllByLabelText('minus reps')[0])
    expect(screen.getByText('11')).toBeTruthy()
  })
})

describe('crash resume', () => {
  it('a saved draft resumes mid-session, whatever day the player was opened for', () => {
    // A session from ANOTHER day died mid-rest…
    const s = startSession(
      [{ name: 'Wall balls', focus: 'full', sets: [{ reps: 15, weight: '14 lb', done: false }, { reps: 15, weight: '14 lb', done: false }] }],
      { dayLabel: 'Fri 8/21', dayIso: '2026-08-21' },
      Date.now() - 60_000,
    )
    saveDraft(s, 'mike')

    // …and the player opens straight into it, not the preview.
    const { onSave } = renderPlayer()
    expect(screen.queryByText('Start workout')).toBeNull()
    expect(screen.getByText('Wall balls')).toBeTruthy()

    fireEvent.click(screen.getByText(/Log set 1/))
    fireEvent.click(screen.getByText('Skip rest'))
    fireEvent.click(screen.getByText(/Log set 2 · finish/))
    fireEvent.click(screen.getByText('Save workout'))
    // Saved against the DRAFT's day, not the opened day.
    expect(onSave.mock.calls[0][1]).toEqual({ dayLabel: 'Fri 8/21', dayIso: '2026-08-21' })
  })

  it('discard clears the draft without saving', () => {
    const s = startSession(
      [{ name: 'Wall balls', focus: 'full', sets: [{ reps: 15, weight: '14 lb', done: false }] }],
      { dayLabel: 'Fri 8/21' }, Date.now(),
    )
    saveDraft({ ...s }, 'mike')
    const { onSave } = renderPlayer()
    fireEvent.click(screen.getByText('End'))
    fireEvent.click(screen.getByText('Discard session'))
    expect(onSave).not.toHaveBeenCalled()
    expect(localStorage.getItem('ba_live_session_draft_mike')).toBeNull()
  })
})
