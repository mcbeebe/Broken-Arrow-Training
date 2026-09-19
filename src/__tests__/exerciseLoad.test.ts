/**
 * Manual strength load — the path a logged session takes into readiness
 * when there is no watch record. Station circuits now draft as one
 * effort per station (reps 1); the model must read that as the work it
 * was, not as a 1-rep set.
 */
import { describe, it, expect } from 'vitest'
import { calculateExerciseLoad } from '../utils/trimp'
import type { StrengthExerciseLog } from '../types'

const full = (sets: StrengthExerciseLog['sets']): StrengthExerciseLog => ({ name: 'SkiErg 500m', focus: 'full', sets })

describe('calculateExerciseLoad', () => {
  it('a 10-rep bodyweight set of a full-body movement is the 2.5 baseline', () => {
    expect(calculateExerciseLoad([full([{ reps: 10, weight: '' }])])).toBe(2.5)
  })

  it('a timed station effort counts every 40 s as one set — a 4-minute sled push is not a 1-rep set', () => {
    expect(calculateExerciseLoad([full([{ reps: 1, weight: '', timeSec: 240 }])])).toBe(15) // 6 sets
    expect(calculateExerciseLoad([full([{ reps: 1, weight: '', timeSec: 20 }])])).toBe(2.5) // floor: one set
    expect(calculateExerciseLoad([full([{ reps: 1, weight: '', timeSec: 3600 }])])).toBe(20) // cap: eight sets
  })

  it('an untimed station effort counts as the three working sets it used to draft as', () => {
    // A hand-logged circuit scores what the old 3 × 10 draft scored.
    expect(calculateExerciseLoad([full([{ reps: 1, weight: '' }])])).toBe(7.5)
    expect(calculateExerciseLoad([full([{ reps: 10, weight: '' }, { reps: 10, weight: '' }, { reps: 10, weight: '' }])])).toBe(7.5)
  })

  it('a weighted single with no time is a lift, scored by its reps', () => {
    const lift: StrengthExerciseLog = { name: 'Deadlift', focus: 'lower', sets: [{ reps: 1, weight: '300 lb' }] }
    expect(calculateExerciseLoad([lift])).toBe(0.8) // 4.0 × 2.0 × 0.1
  })

  it('skipped sets are planned work, not performed — they add nothing', () => {
    expect(calculateExerciseLoad([full([{ reps: 10, weight: '' }, { reps: 10, weight: '', done: false }])])).toBe(2.5)
    expect(calculateExerciseLoad([full([{ reps: 1, weight: '', timeSec: 240, done: false }])])).toBe(0)
  })
})
