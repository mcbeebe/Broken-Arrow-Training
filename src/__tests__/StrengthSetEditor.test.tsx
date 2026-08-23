/**
 * Phase 1 of the strength-logging overhaul: the prescription is the
 * draft. These tests pin the set-row editor's contract — ghost values
 * from history, one-tap targets, typing-is-doing confirmation, and
 * honest skipped-set persistence.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import StrengthSetEditor from '../components/StrengthSetEditor'
import { ghostFillFromHistory } from '../utils/strengthDraft'
import { buildProgression, normalizeExerciseName } from '../utils/strengthProgression'
import type { StrengthExerciseLog, TrainingWeek } from '../types'

afterEach(cleanup)

// One prior week of history: goblet squats at 20 lb × 12,12,12.
function historyWeeks(): TrainingWeek[] {
  return [{
    num: 6,
    dates: 'Aug 10–16',
    miles: 10,
    focus: 'Build',
    days: [{
      day: 'Mon 8/10',
      type: 'strength',
      workout: 'STRENGTH',
      detail: 'Goblet squats 3×12',
      zone: 'Z1',
      route: 'Gym',
      time: '1 hr',
      actual: {
        stravaId: 1, source: 'manual', distance: 0, movingTime: 3000,
        elapsedTime: 3000, elevationGain: 0, type: 'strength_training',
        name: 'Strength', startDate: '2026-08-10T08:00:00',
        strengthLog: [{
          name: 'Goblet squats', focus: 'lower',
          sets: [
            { reps: 12, weight: '20 lb' },
            { reps: 12, weight: '20 lb' },
            { reps: 12, weight: '20 lb' },
          ],
        }],
      },
    }],
  }]
}

function planExercises(): StrengthExerciseLog[] {
  return [{
    name: 'Goblet squats',
    focus: 'lower',
    sets: [
      { reps: 12, weight: '' },
      { reps: 12, weight: '' },
      { reps: 12, weight: '' },
    ],
  }]
}

function Harness({ initial, weeks }: { initial: StrengthExerciseLog[]; weeks: TrainingWeek[] }) {
  const progression = buildProgression(weeks)
  const [exercises, setExercises] = useState(initial)
  return (
    <div>
      <StrengthSetEditor exercises={exercises} onChange={setExercises} progression={progression} />
      <pre data-testid="state">{JSON.stringify(exercises)}</pre>
    </div>
  )
}

function state(): StrengthExerciseLog[] {
  return JSON.parse(screen.getByTestId('state').textContent || '[]')
}

describe('ghostFillFromHistory', () => {
  it('borrows last-session weights positionally, keeps plan reps, starts everything unchecked', () => {
    const ghosted = ghostFillFromHistory(planExercises(), buildProgression(historyWeeks()))
    expect(ghosted[0].sets.map(s => s.weight)).toEqual(['20 lb', '20 lb', '20 lb'])
    expect(ghosted[0].sets.map(s => s.reps)).toEqual([12, 12, 12])
    expect(ghosted[0].sets.every(s => s.done === false)).toBe(true)
  })

  it('with no history the rows stay unchecked with empty weights', () => {
    const ghosted = ghostFillFromHistory(planExercises(), new Map())
    expect(ghosted[0].sets.every(s => s.weight === '' && s.done === false)).toBe(true)
  })

  it('a longer prescription than history repeats the last known weight', () => {
    const four = planExercises()
    four[0].sets.push({ reps: 12, weight: '' })
    const ghosted = ghostFillFromHistory(four, buildProgression(historyWeeks()))
    expect(ghosted[0].sets[3].weight).toBe('20 lb')
  })
})

describe('StrengthSetEditor', () => {
  it('shows last session and the progression target', () => {
    render(<Harness initial={ghostFillFromHistory(planExercises(), buildProgression(historyWeeks()))} weeks={historyWeeks()} />)
    expect(screen.getByText(/Last time: 20 lb × 12, 12, 12/)).toBeTruthy()
    // 12 clean reps ×3 at 20 lb → progression suggests more.
    expect(screen.getByText(/Try today:/)).toBeTruthy()
  })

  it('"Use" applies the target to working sets and marks them done', () => {
    render(<Harness initial={ghostFillFromHistory(planExercises(), buildProgression(historyWeeks()))} weeks={historyWeeks()} />)
    fireEvent.click(screen.getByText('Use'))
    const sets = state()[0].sets
    expect(sets.every(s => s.done === true)).toBe(true)
    // 12 reps at 20 lb hit MAX_REPS_BEFORE_WEIGHT_BUMP → load goes up.
    expect(sets.every(s => s.weight !== '20 lb' && s.weight !== '')).toBe(true)
  })

  it('editing through the keypad confirms the set — editing IS doing', () => {
    render(<Harness initial={ghostFillFromHistory(planExercises(), buildProgression(historyWeeks()))} weeks={historyWeeks()} />)
    fireEvent.click(screen.getByLabelText('Set 1 reps'))
    // Keypad opens on that cell; first digit REPLACES the ghost value.
    fireEvent.click(screen.getByRole('button', { name: '9' }))
    const sets = state()[0].sets
    expect(sets[0].done).toBe(true)
    expect(sets[0].reps).toBe(9)
    expect(sets[1].done).toBe(false) // untouched rows stay ghosts
  })

  it('keypad steppers bump weight by 2.5 lb and confirm the set', () => {
    render(<Harness initial={ghostFillFromHistory(planExercises(), buildProgression(historyWeeks()))} weeks={historyWeeks()} />)
    fireEvent.click(screen.getByLabelText('Set 1 weight'))
    fireEvent.click(screen.getByLabelText('plus 2.5'))
    expect(state()[0].sets[0]).toMatchObject({ weight: '22.5 lb', done: true })
  })

  it('keypad quick chips: BW and same-as-last', () => {
    render(<Harness initial={ghostFillFromHistory(planExercises(), buildProgression(historyWeeks()))} weeks={historyWeeks()} />)
    fireEvent.click(screen.getByLabelText('Set 1 weight'))
    fireEvent.click(screen.getByRole('button', { name: 'BW' }))
    expect(state()[0].sets[0].weight).toBe('BW')
    fireEvent.click(screen.getByRole('button', { name: /Last \(20 lb\)/ }))
    expect(state()[0].sets[0].weight).toBe('20 lb')
  })

  it('"Set done" flows to the next set\'s weight — the between-sets rhythm', () => {
    render(<Harness initial={ghostFillFromHistory(planExercises(), buildProgression(historyWeeks()))} weeks={historyWeeks()} />)
    fireEvent.click(screen.getByLabelText('Set 1 weight'))
    expect(screen.getByText(/set 1 of 3 · weight/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Set done/ }))
    expect(state()[0].sets[0].done).toBe(true)
    expect(screen.getByText(/set 2 of 3 · weight/)).toBeTruthy()
  })

  it('the checkbox toggles done both ways', () => {
    render(<Harness initial={ghostFillFromHistory(planExercises(), buildProgression(historyWeeks()))} weeks={historyWeeks()} />)
    fireEvent.click(screen.getByLabelText('Mark set 1 done'))
    expect(state()[0].sets[0].done).toBe(true)
    fireEvent.click(screen.getByLabelText('Mark set 1 not done'))
    expect(state()[0].sets[0].done).toBe(false)
  })

  it('+ Add Set copies the previous row values as a fresh ghost', () => {
    render(<Harness initial={ghostFillFromHistory(planExercises(), buildProgression(historyWeeks()))} weeks={historyWeeks()} />)
    fireEvent.click(screen.getByText('+ Add Set'))
    const sets = state()[0].sets
    expect(sets).toHaveLength(4)
    expect(sets[3]).toMatchObject({ reps: 12, weight: '20 lb', done: false })
  })

  it('tapping the set label cycles working → warm-up → AMRAP → working', () => {
    render(<Harness initial={ghostFillFromHistory(planExercises(), buildProgression(historyWeeks()))} weeks={historyWeeks()} />)
    const label = screen.getAllByTitle(/change set type/)[0]
    fireEvent.click(label)
    expect(state()[0].sets[0].setType).toBe('warmup')
    fireEvent.click(screen.getAllByTitle(/change set type/)[0])
    expect(state()[0].sets[0].setType).toBe('amrap')
    fireEvent.click(screen.getAllByTitle(/change set type/)[0])
    expect(state()[0].sets[0].setType).toBeUndefined()
  })

  it('warm-up rows are exempt from "Use" — the ramp-in is not the target', () => {
    const initial = ghostFillFromHistory(planExercises(), buildProgression(historyWeeks()))
    initial[0].sets[0] = { ...initial[0].sets[0], setType: 'warmup', weight: '10 lb', reps: 8 }
    render(<Harness initial={initial} weeks={historyWeeks()} />)
    fireEvent.click(screen.getByText('Use'))
    const sets = state()[0].sets
    expect(sets[0]).toMatchObject({ setType: 'warmup', weight: '10 lb', reps: 8, done: false })
    expect(sets[1].done).toBe(true)
  })
})

describe('progression math honors the new set fields', () => {
  it('skipped and warm-up sets are excluded from history', () => {
    const weeks = historyWeeks()
    weeks[0].days[0].actual!.strengthLog = [{
      name: 'Goblet squats', focus: 'lower',
      sets: [
        { reps: 8, weight: '10 lb', setType: 'warmup' },   // ramp-in
        { reps: 12, weight: '20 lb' },                      // real work
        { reps: 12, weight: '25 lb', done: false },         // skipped ghost
      ],
    }]
    const prog = buildProgression(weeks).get(normalizeExerciseName('Goblet squats'))!
    expect(prog.last!.topWeightLb).toBe(20)   // not 25 (skipped), not warmup-only
    expect(prog.last!.totalReps).toBe(12)
  })

  it('an exercise whose every set was skipped never enters history', () => {
    const weeks = historyWeeks()
    weeks[0].days[0].actual!.strengthLog = [{
      name: 'Goblet squats', focus: 'lower',
      sets: [{ reps: 12, weight: '20 lb', done: false }],
    }]
    expect(buildProgression(weeks).get(normalizeExerciseName('Goblet squats'))).toBeUndefined()
  })
})

describe('ManualLog pre-population (integration)', () => {
  it('a plain strength day opens with the prescription ghost-filled from history', async () => {
    const { default: ManualLog } = await import('../components/ManualLog')
    render(
      <ManualLog
        dayLabel="Mon 8/17"
        planned={{
          day: 'Mon 8/17', type: 'strength', workout: 'STRENGTH',
          detail: 'Goblet squats 3×12 · Plank 3×45s', zone: 'Z1', route: 'Gym', time: '1 hr',
        }}
        allWeeks={historyWeeks()}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByDisplayValue('Goblet squats')).toBeTruthy()
    expect(screen.getByDisplayValue('Plank')).toBeTruthy()
    // Ghost weight borrowed from last session (cells are keypad buttons).
    expect(screen.getAllByText('20 lb').length).toBeGreaterThan(0)
    expect(screen.getByText(/Last time: 20 lb × 12, 12, 12/)).toBeTruthy()
  })
})
