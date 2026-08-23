/**
 * The live-session engine (Phase 2, PR 3). Pure state machine — every
 * test drives it with explicit `now` values, no fake timers, because
 * that IS the production discipline: all timing derives from stored
 * timestamps so iOS backgrounding can't drift a counter.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  startSession, logCurrentSet, startNextSet, extendRest, skipCurrentSet,
  pause, resume, endSession, toActualWorkout,
  elapsedSec, restRemainingSec, restSecondsFor, nextCursor,
  saveDraft, loadDraft, clearDraft,
  type LiveSessionState,
} from '../utils/liveSession'
import type { StrengthExerciseLog } from '../types'

const T0 = 1_756_000_000_000 // arbitrary session start (epoch ms)
const sec = (n: number) => n * 1000

function exercises(): StrengthExerciseLog[] {
  return [
    {
      name: 'Goblet squats', focus: 'lower',
      sets: [
        { reps: 12, weight: '22.5 lb', done: false },
        { reps: 12, weight: '22.5 lb', done: false },
      ],
    },
    {
      name: 'Plank', focus: 'core',
      sets: [{ reps: 45, weight: 'BW', done: false }],
    },
  ]
}

function fresh(): LiveSessionState {
  return startSession(exercises(), { dayLabel: 'Mon 8/24', dayIso: '2026-08-24' }, T0)
}

describe('session walkthrough', () => {
  it('logs set → rest → next set → … → finished, marking done as it goes', () => {
    let s = fresh()
    expect(s.phase).toBe('exercise')
    expect(s.cursor).toEqual({ exIdx: 0, setIdx: 0 })

    s = logCurrentSet(s, T0 + sec(60))
    expect(s.phase).toBe('rest')
    expect(s.exercises[0].sets[0].done).toBe(true)

    s = startNextSet(s)
    expect(s.phase).toBe('exercise')
    expect(s.cursor).toEqual({ exIdx: 0, setIdx: 1 })

    s = logCurrentSet(s, T0 + sec(180))
    s = startNextSet(s)
    expect(s.cursor).toEqual({ exIdx: 1, setIdx: 0 }) // crossed into Plank

    // Final set of the session: no rest, straight to finished.
    s = logCurrentSet(s, T0 + sec(300))
    expect(s.phase).toBe('finished')
    expect(s.exercises.every(ex => ex.sets.every(set => set.done))).toBe(true)
  })

  it('skipping a set advances without marking it done — honest data', () => {
    let s = fresh()
    s = skipCurrentSet(s)
    expect(s.exercises[0].sets[0].done).toBe(false)
    expect(s.cursor).toEqual({ exIdx: 0, setIdx: 1 })
    expect(s.phase).toBe('exercise') // no rest earned for a skip
  })

  it('nextCursor skips exercises that have no sets', () => {
    const s = startSession(
      [
        { name: 'A', focus: 'full', sets: [{ reps: 10, weight: '' }] },
        { name: 'empty', focus: 'full', sets: [] },
        { name: 'B', focus: 'full', sets: [{ reps: 10, weight: '' }] },
      ],
      { dayLabel: 'Mon' }, T0,
    )
    expect(nextCursor(s, { exIdx: 0, setIdx: 0 })).toEqual({ exIdx: 2, setIdx: 0 })
  })
})

describe('rest timing — wall clock, not counters', () => {
  it('counts down from the guide prescription and reads 0 after expiry', () => {
    let s = fresh()
    s = logCurrentSet(s, T0 + sec(60))
    const planned = s.restPlannedSec!
    expect(planned).toBeGreaterThan(0)
    expect(restRemainingSec(s, T0 + sec(60))).toBe(planned)
    expect(restRemainingSec(s, T0 + sec(60) + sec(planned / 2))).toBe(planned / 2)
    // The app was dead for 10 minutes: rest is simply over, not frozen.
    expect(restRemainingSec(s, T0 + sec(60) + sec(600))).toBe(0)
  })

  it('+30s extends the planned rest', () => {
    let s = fresh()
    s = logCurrentSet(s, T0 + sec(60))
    const planned = s.restPlannedSec!
    s = extendRest(s, 30)
    expect(restRemainingSec(s, T0 + sec(60))).toBe(planned + 30)
  })

  it('restSecondsFor parses guide prescriptions and defaults to 60', () => {
    // Guide-backed exercise: "60 sec between sets" (or similar).
    expect(restSecondsFor('Goblet squats')).toBeGreaterThan(0)
    expect(restSecondsFor('made-up exercise nobody knows')).toBe(60)
  })
})

describe('pause — the clock stops, the rest is preserved', () => {
  it('paused time is excluded from the session clock', () => {
    let s = fresh()
    s = pause(s, T0 + sec(100))
    // 5 minutes pass while paused.
    expect(elapsedSec(s, T0 + sec(400))).toBe(100)
    s = resume(s, T0 + sec(400))
    expect(elapsedSec(s, T0 + sec(430))).toBe(130)
  })

  it('a pause during rest shifts the rest anchor — the pause never eats the rest', () => {
    let s = fresh()
    s = logCurrentSet(s, T0 + sec(60))         // rest starts
    const planned = s.restPlannedSec!
    s = pause(s, T0 + sec(70))                 // 10s of rest used
    s = resume(s, T0 + sec(370))               // 5-minute pause
    expect(restRemainingSec(s, T0 + sec(370))).toBe(planned - 10)
  })
})

describe('finishing', () => {
  it('produces an ordinary manual-style ActualWorkout with the done flags', () => {
    let s = fresh()
    s = logCurrentSet(s, T0 + sec(60))
    s = startNextSet(s)
    s = skipCurrentSet(s)                      // set 2 skipped
    s = logCurrentSet(s, T0 + sec(200))        // plank done → finished
    const w = toActualWorkout(s, T0 + sec(200))
    expect(w.type).toBe('strength_training')
    expect(w.source).toBe('manual')
    expect(w.movingTime).toBe(200)
    expect(w.startDate).toBe('2026-08-24T08:00:00')
    expect(w.strengthLog![0].sets.map(x => x.done)).toEqual([true, false])
    expect(w.strengthLog![1].sets[0].done).toBe(true)
  })

  it('endSession finishes early from any phase', () => {
    let s = fresh()
    s = logCurrentSet(s, T0 + sec(60))
    s = endSession(s)
    expect(s.phase).toBe('finished')
  })
})

describe('crash-proof draft', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips through localStorage and resumes mid-rest', () => {
    let s = fresh()
    s = logCurrentSet(s, T0 + sec(60))
    saveDraft(s, 'mike')
    const back = loadDraft('mike')!
    expect(back.cursor).toEqual(s.cursor)
    expect(back.phase).toBe('rest')
    // Reopened later: the rest continued on the wall clock while dead.
    expect(restRemainingSec(back, T0 + sec(60) + sec(20))).toBe(back.restPlannedSec! - 20)
  })

  it('is athlete-scoped and cleared on finish', () => {
    const s = fresh()
    saveDraft(s, 'mike')
    expect(loadDraft('jim')).toBeNull()
    clearDraft('mike')
    expect(loadDraft('mike')).toBeNull()
  })

  it('rejects finished, corrupt, or foreign-version drafts', () => {
    const s = { ...fresh(), phase: 'finished' as const }
    saveDraft(s, 'mike')
    expect(loadDraft('mike')).toBeNull()
    localStorage.setItem('ba_live_session_draft_mike', 'not json {{')
    expect(loadDraft('mike')).toBeNull()
    localStorage.setItem('ba_live_session_draft_mike', JSON.stringify({ v: 99 }))
    expect(loadDraft('mike')).toBeNull()
  })
})
