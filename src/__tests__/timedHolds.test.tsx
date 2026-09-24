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
import { draftExercise } from '../utils/strengthDraft'
import { parseRoutine } from '../utils/exercises'
import { holdField } from '../utils/coachSnapshot'
import { startSession, addRound, logCurrentSet } from '../utils/liveSession'
import { isHoldSet } from '../utils/setTime'
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
    expect(ex.sets.every(s => s.reps === 0 && s.timeSec === sec && isHoldSet(s))).toBe(true)
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
      { reps: 0, weight: '', timeSec: 45, hold: true }, { reps: 0, weight: '', timeSec: 45, hold: true }, { reps: 0, weight: '', timeSec: 40, hold: true },
    ]))).toBe('BW · 0:45, 0:45, 0:40')
    expect(lastSessionSummary(prog('Farmer carry', [{ reps: 0, weight: '40 lb', timeSec: 30, hold: true }]))).toBe('40 lb · 0:30')
    // A rep exercise reads exactly as before.
    expect(lastSessionSummary(prog('Goblet squats', [{ reps: 12, weight: '20 lb' }]))).toBe('20 lb × 12')
  })
})

describe('the next target for a hold is a time', () => {
  const held = (...t: number[]) => t.map(timeSec => ({ reps: 0, weight: '', timeSec, hold: true }))

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
    const plank: StrengthExerciseLog = { name: 'Plank', focus: 'core', sets: [45, 45, 45].map(t => ({ reps: 0, weight: '', timeSec: t, hold: true })) }
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
    const weeks = history('Plank', [45, 45, 45].map(t => ({ reps: 0, weight: '', timeSec: t, hold: true })))
    const [plank] = parsePlanPrescription('Plank 3×45s').exercises
    render(<Harness initial={[plank]} weeks={weeks} />)
    expect(screen.getByText(/Try today: BW · hold 0:50/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    const state = JSON.parse(screen.getByTestId('state').textContent!) as StrengthExerciseLog[]
    expect(state[0].sets.every(s => s.reps === 0 && s.timeSec === 50 && s.done === true)).toBe(true)
  })
})

describe('an erg piece logged by time is not a hold (review finding: shorter is better there)', () => {
  const erg = (t: number): StrengthSet => ({ reps: 0, weight: '', timeSec: t })

  it('a slower SkiErg is never "progress" and never "hold 2:05"', () => {
    const t = suggestNextTarget(prog('SkiErg 500m', [erg(120)]), 1, 1)
    expect(t.timeSec).toBeUndefined()
    expect(targetLine(t)).not.toMatch(/hold/)
  })

  it('the coach snapshot sends no holdSec for it; a real hold sends its shortest set', () => {
    expect(holdField([erg(120)])).toEqual({})
    expect(holdField([{ reps: 0, timeSec: 60, hold: true }, { reps: 0, timeSec: 55, hold: true }])).toEqual({ holdSec: 55 })
    expect(holdField([{ reps: 12 }])).toEqual({})
  })
})

describe('a hold keeps its time wherever a set is copied', () => {
  const holdSets = [60, 60, 60].map(t => ({ reps: 0, weight: '', timeSec: t, hold: true }))

  it('picking it from history drafts the hold, not three empty sets', () => {
    const ex = draftExercise('Plank', buildProgression(history('Plank', holdSets)))
    expect(ex.sets.every(s => s.hold === true && s.timeSec === 60 && s.reps === 0)).toBe(true)
  })

  it('"Add round" copies the hold', () => {
    const s = startSession([{ name: 'Plank', focus: 'core', sets: [{ reps: 0, weight: '', timeSec: 45, hold: true }] }],
      { dayLabel: 'Thu', traversal: 'round' }, 0)
    const next = addRound(s).exercises[0].sets[1]
    expect(next).toMatchObject({ hold: true, timeSec: 45, reps: 0 })
  })

  it('in a circuit, logging a hold keeps its time; the station clock is not the hold', () => {
    const s = startSession([
      { name: 'Plank', focus: 'core', sets: [{ reps: 0, weight: '', timeSec: 45, hold: true }] },
      { name: 'SkiErg', focus: 'full', sets: [{ reps: 1, weight: '' }] },
    ], { dayLabel: 'Thu', traversal: 'round' }, 0)
    const logged = logCurrentSet(s, 95_000) // 95 s on the clock, walk-over included
    expect(logged.exercises[0].sets[0].timeSec).toBe(45)
    const station = logCurrentSet(logged, 200_000)
    expect(station.exercises[1].sets[0].timeSec).toBe(105) // a station still takes its split
  })

  it('"+ Add Set" in the log editor copies the hold', () => {
    function Harness() {
      const [exercises, setExercises] = useState<StrengthExerciseLog[]>([{ name: 'Plank', focus: 'core', sets: [{ reps: 0, weight: '', timeSec: 45, hold: true }] }])
      return (
        <>
          <StrengthSetEditor exercises={exercises} onChange={setExercises} progression={new Map()} />
          <pre data-testid="state">{JSON.stringify(exercises)}</pre>
        </>
      )
    }
    render(<Harness />)
    fireEvent.click(screen.getByText('+ Add Set'))
    const state = JSON.parse(screen.getByTestId('state').textContent!) as StrengthExerciseLog[]
    expect(state[0].sets[1]).toMatchObject({ hold: true, timeSec: 45, reps: 0 })
  })
})

describe('review follow-ups', () => {
  it('without a plan time, a fading session is not "progress"', () => {
    const t = suggestNextTarget(prog('Plank', [60, 20, 15].map(timeSec => ({ reps: 0, weight: '', timeSec, hold: true }))), 3, 0)
    expect(t.tier).not.toBe('progress')
  })

  it('decimal minutes parse: "Hang 3×1.5 min" is a 90 s hold', () => {
    const [ex] = parsePlanPrescription('Hang 3×1.5 min').exercises
    expect(ex).toMatchObject({ name: 'Hang' })
    expect(ex.sets.every(s => s.hold && s.timeSec === 90)).toBe(true)
  })

  it('the workout sheet reads "2×1 min" as a minute, and metres stay reps', () => {
    expect(parseRoutine('Dead hang 2×1 min')[0].reps).toBe('1 min')
    expect(parseRoutine('Farmer carry 3×40m')[0].reps).toBe('40')
    expect(parseRoutine('Plank 3×45s')[0].reps).toBe('45s')
  })
})
