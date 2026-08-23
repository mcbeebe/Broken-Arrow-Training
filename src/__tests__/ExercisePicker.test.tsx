/**
 * The exercise picker (Phase 1, PR 2): plan → recents → library, free
 * text as escape hatch. Canonical names keep progression history from
 * fragmenting.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ExercisePicker from '../components/ExercisePicker'
import { buildProgression } from '../utils/strengthProgression'
import { parsePlanExercises, draftExercise } from '../utils/strengthDraft'
import type { StrengthExerciseLog, TrainingWeek } from '../types'

afterEach(cleanup)

function historyWeeks(): TrainingWeek[] {
  return [{
    num: 6, dates: 'Aug 10–16', miles: 10, focus: 'Build',
    days: [{
      day: 'Mon 8/10', type: 'strength', workout: 'STRENGTH',
      detail: 'Goblet squats 3×12', zone: 'Z1', route: 'Gym', time: '1 hr',
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

const PLAN_DETAIL = 'Goblet squats 3×12 · Walking lunges 3×10/leg · Plank 3×45s'

function renderPicker(overrides: Partial<Parameters<typeof ExercisePicker>[0]> = {}) {
  const onPick = vi.fn()
  render(
    <ExercisePicker
      plannedExercises={parsePlanExercises(PLAN_DETAIL)}
      existingNames={['Goblet squats']}
      progression={buildProgression(historyWeeks())}
      onPick={onPick}
      onClose={vi.fn()}
      {...overrides}
    />,
  )
  return onPick
}

describe('ExercisePicker', () => {
  it('offers the not-yet-added planned exercises first, with the prescription', () => {
    renderPicker()
    // Goblet squats is already in the log — filtered out of the plan section.
    expect(screen.getByText('Walking lunges')).toBeTruthy()
    // 'Plank' also exists in the guide library — the plan section adds a second.
    expect(screen.getAllByText('Plank').length).toBeGreaterThan(0)
    expect(screen.getByText('planned 3 × 10')).toBeTruthy()
  })

  it('picking a planned exercise returns it with prescription reps, ghost-filled and unchecked', () => {
    const onPick = renderPicker()
    fireEvent.click(screen.getByText('Walking lunges'))
    const picked: StrengthExerciseLog = onPick.mock.calls[0][0]
    expect(picked.name).toBe('Walking lunges')
    expect(picked.sets).toHaveLength(3)
    expect(picked.sets.every(s => s.reps === 10 && s.done === false)).toBe(true)
    expect(picked.focus).toBe('lower')
  })

  it('search filters the library and offers the custom escape hatch', () => {
    const onPick = renderPicker()
    fireEvent.change(screen.getByPlaceholderText('Search exercises…'), {
      target: { value: 'incline treadmill push' },
    })
    fireEvent.click(screen.getByText(/as custom/))
    const picked: StrengthExerciseLog = onPick.mock.calls[0][0]
    expect(picked.name).toBe('incline treadmill push')
    expect(picked.sets).toHaveLength(3) // neutral skeleton
  })

  it('draftExercise pulls last-session sets for a known exercise', () => {
    const drafted = draftExercise('Goblet squats', buildProgression(historyWeeks()))
    expect(drafted.sets).toHaveLength(2)                    // last session had 2 sets
    expect(drafted.sets.every(s => s.weight === '20 lb' && s.done === false)).toBe(true)
  })

  it('library rows show last-used history when the athlete has some', () => {
    renderPicker({ existingNames: [] })
    // Goblet squat guide row carries "last Wk 6 · 20 lb".
    expect(screen.getByText(/last Wk 6 · 20 lb/)).toBeTruthy()
  })
})
