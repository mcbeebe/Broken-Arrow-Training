/**
 * Field bug (2026-09-23): the plan wrote "Plank 3×60s" and the live player
 * drafted it as 60 reps. A hold is measured in time. It drafts with the
 * plan's time and no reps, reads as a time everywhere it is shown, and
 * progresses by time.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import StrengthSetEditor from '../components/StrengthSetEditor'
import {
  parsePlanPrescription, parseHoldSeconds, prescriptionLabel, holdLabel, lastSessionSummary,
} from '../utils/strengthDraft'
import { buildProgression, normalizeExerciseName, suggestNextTarget, targetLine } from '../utils/strengthProgression'
import { isTimedSet } from '../utils/setTime'
import { calculateExerciseLoad } from '../utils/trimp'
import type { StrengthExerciseLog, StrengthSet, TrainingWeek } from '../types'

afterEach(cleanup)

function history(name: string, sets: StrengthSet[]): TrainingWeek[] {
  return [{
    num: 6, dates: 'Aug 10–16', miles: 10, focus: 'Build',
    days: [{
      day: 'Mon 8/10', type: 'strength', workout: 'STRENGTH', detail: `${name} 3×45s`,
      zone: 'Z1', route: 'Gym', time: '1 hr',
      actual: {
        stravaId: 1, source: 'manual', distance: 0, movingTime: 3000, elapsedTime: 3000,
        elevationGain: 0, type: 'strength_training', name: 'Strength', startDate: '2026-08-10T08:00:00',
        strengthLog: [{ name, focus: 'core', sets }],
      },
    }],
  }]
}
const prog = (name: string, sets: StrengthSet[]) =>
  buildProgression(history(name, sets)).get(normalizeExerciseName(name))!

describe('parsing: a hold is a time, not reps', () => {
  it.each([
    ['Plank 3×60s', 'Plank', 3, 60],
    ['Side plank 3×20s/side', 'Side plank', 3, 20],
    ['Wall sit 2×20 sec', 'Wall sit', 2, 20],
    ['Dead hang 2×1 min', 'Dead hang', 2, 60],
    ['Farmer Carry 3×30s', 'Farmer Carry', 3, 30],
  ])('%s → %i × %i s', (text, name, sets, sec) => {
    const [ex] = parsePlanPrescription(text).exercises
    expect(ex.name).toBe(name)
    expect(ex.sets).toHaveLength(sets)
    expect(ex.sets.every(s => s.reps === 0 && s.timeSec === sec && isTimedSet(s))).toBe(true)
  })

  it.each([
    ['Walking lunges 3×10/leg', 10], ['Bench 5×5 reps', 5], ['Goblet squats 3×12', 12], ['Farmer carry 3×40m', 40],
  ])('%s stays %i reps (metres are not minutes)', (text, reps) => {
    const [ex] = parsePlanPrescription(text).exercises
    expect(ex.sets[0].reps).toBe(reps)
    expect(ex.sets[0].timeSec).toBeUndefined()
  })

  it('parseHoldSeconds reads only a duration', () => {
    expect(parseHoldSeconds('45s')).toBe(45)
    expect(parseHoldSeconds('20s/side')).toBe(20)
    expect(parseHoldSeconds('1.5 min')).toBe(90)
    expect(parseHoldSeconds('12')).toBeNull()
    expect(parseHoldSeconds('10/leg')).toBeNull()
    expect(parseHoldSeconds('40m')).toBeNull()
  })
})

describe('reading a hold', () => {
  it('the prescription says "3 × 45 s", never "3 × 0"', () => {
    const [plank] = parsePlanPrescription('Plank 3×45s').exercises
    expect(prescriptionLabel(plank)).toBe('3 × 45 s')
    expect(holdLabel(150)).toBe('2:30')
  })

  it('the last session lists times, not zero reps', () => {
    expect(lastSessionSummary(prog('Plank', [
      { reps: 0, weight: '', timeSec: 45 }, { reps: 0, weight: '', timeSec: 45 }, { reps: 0, weight: '', timeSec: 40 },
    ]))).toBe('BW · 0:45, 0:45, 0:40')
    expect(lastSessionSummary(prog('Farmer carry', [{ reps: 0, weight: '40 lb', timeSec: 30 }]))).toBe('40 lb · 0:30')
    // A rep exercise reads exactly as before.
    expect(lastSessionSummary(prog('Goblet squats', [{ reps: 12, weight: '20 lb' }]))).toBe('20 lb × 12')
  })
})

describe('the next target for a hold is a time', () => {
  const held = (...t: number[]) => t.map(timeSec => ({ reps: 0, weight: '', timeSec }))

  it('held every set at the plan → +5 s', () => {
    const t = suggestNextTarget(prog('Plank', held(45, 45, 45)), 3, 0, 45)
    expect(t).toMatchObject({ tier: 'progress', timeSec: 50, reps: 0, sets: 3 })
    expect(targetLine(t)).toBe('BW · hold 0:50')
  })

  it('close (≥ 80%) → hold the plan', () => {
    expect(suggestNextTarget(prog('Plank', held(45, 40, 38)), 3, 0, 45)).toMatchObject({ tier: 'hold', timeSec: 45 })
  })

  it('well short → build back from the shortest hold', () => {
    expect(suggestNextTarget(prog('Plank', held(30, 25, 22)), 3, 0, 45)).toMatchObject({ tier: 'deload', timeSec: 20 })
  })

  it('history alone makes it a hold, even when the caller only knows reps', () => {
    expect(suggestNextTarget(prog('Plank', held(60, 60, 60)), 3, 0)).toMatchObject({ tier: 'progress', timeSec: 65 })
  })

  it('a plank logged before holds were timed (45 "reps") is no basis for a time', () => {
    const legacy = prog('Plank', [{ reps: 45, weight: '' }, { reps: 45, weight: '' }])
    expect(suggestNextTarget(legacy, 3, 0, 45)).toMatchObject({ tier: 'starting', timeSec: 45, reps: 0 })
  })

  it('a rep exercise is untouched', () => {
    const t = suggestNextTarget(prog('Goblet squats', [{ reps: 12, weight: '20 lb' }]), 1, 12)
    expect(t.timeSec).toBeUndefined()
    expect(targetLine(t)).toMatch(/lb × \d+$/)
  })
})

describe('load scoring', () => {
  it('a 3 × 45 s plank scores as three timed core efforts (45/40 set-equivalents each)', () => {
    const plank: StrengthExerciseLog = { name: 'Plank', focus: 'core', sets: [45, 45, 45].map(t => ({ reps: 0, weight: '', timeSec: t })) }
    expect(calculateExerciseLoad([plank])).toBe(3.4)
  })
})

describe('the log editor: "Try today" and Use speak time for a hold', () => {
  function Harness({ initial, weeks }: { initial: StrengthExerciseLog[]; weeks: TrainingWeek[] }) {
    const [exercises, setExercises] = useState(initial)
    return (
      <>
        <StrengthSetEditor exercises={exercises} onChange={setExercises} progression={buildProgression(weeks)} />
        <pre data-testid="state">{JSON.stringify(exercises)}</pre>
      </>
    )
  }

  it('suggests "BW · hold 0:50" and Use writes the time, not reps', () => {
    const weeks = history('Plank', [45, 45, 45].map(t => ({ reps: 0, weight: '', timeSec: t })))
    const [plank] = parsePlanPrescription('Plank 3×45s').exercises
    render(<Harness initial={[plank]} weeks={weeks} />)
    expect(screen.getByText(/Try today: BW · hold 0:50/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    const state = JSON.parse(screen.getByTestId('state').textContent!) as StrengthExerciseLog[]
    expect(state[0].sets.every(s => s.reps === 0 && s.timeSec === 50 && s.done === true)).toBe(true)
  })
})
