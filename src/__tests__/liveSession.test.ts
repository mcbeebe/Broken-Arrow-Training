/**
 * The live-session engine (Phase 2, PR 3). Pure state machine — every
 * test drives it with explicit `now` values, no fake timers, because
 * that IS the production discipline: all timing derives from stored
 * timestamps so iOS backgrounding can't drift a counter.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  startSession, logCurrentSet, startNextSet, extendRest, skipCurrentSet,
  addExercise, addRound, collectStationSplits,
  pause, resume, endSession, toActualWorkout,
  elapsedSec, restRemainingSec, restSecondsFor, nextCursor, segmentElapsedSec,
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

    s = startNextSet(s, T0 + sec(120))
    expect(s.phase).toBe('exercise')
    expect(s.cursor).toEqual({ exIdx: 0, setIdx: 1 })

    s = logCurrentSet(s, T0 + sec(180))
    s = startNextSet(s, T0 + sec(240))
    expect(s.cursor).toEqual({ exIdx: 1, setIdx: 0 }) // crossed into Plank

    // Final set of the session: no rest, straight to finished.
    s = logCurrentSet(s, T0 + sec(300))
    expect(s.phase).toBe('finished')
    expect(s.exercises.every(ex => ex.sets.every(set => set.done))).toBe(true)
  })

  it('a straight set is logged without a time — its wall-clock duration is not a measurement', () => {
    let s = fresh()
    s = logCurrentSet(s, T0 + sec(60))
    expect(s.exercises[0].sets[0].done).toBe(true)
    expect(s.exercises[0].sets[0].timeSec).toBeUndefined()
  })

  it('skipping a set advances without marking it done — honest data', () => {
    let s = fresh()
    s = skipCurrentSet(s, T0 + sec(30))
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

describe('circuit mode — round-major traversal with station splits', () => {
  function circuit(): LiveSessionState {
    return startSession(
      [
        { name: 'SkiErg', focus: 'full', sets: [{ reps: 1, weight: '' }, { reps: 1, weight: '' }] },
        { name: 'Wall balls', focus: 'full', sets: [{ reps: 15, weight: '14 lb' }, { reps: 15, weight: '14 lb' }] },
        { name: 'Farmer carry', focus: 'full', sets: [{ reps: 1, weight: '35 lb' }] }, // drops out of round 2
      ],
      { dayLabel: 'Fri 8/28', traversal: 'round' },
      T0,
    )
  }

  it('walks every station once per round, ragged stations drop out, no rest screens', () => {
    let s = circuit()
    const visits: string[] = []
    while (s.phase === 'exercise') {
      visits.push(`${s.cursor.exIdx}.${s.cursor.setIdx}`)
      s = logCurrentSet(s, T0 + sec(visits.length * 70))
      expect(s.phase === 'rest').toBe(false) // stations never enter rest
    }
    expect(visits).toEqual(['0.0', '1.0', '2.0', '0.1', '1.1'])
    expect(s.phase).toBe('finished')
  })

  it('records each station\'s split as the set\'s timeSec', () => {
    let s = circuit()
    s = logCurrentSet(s, T0 + sec(64))          // SkiErg round 1: 64s
    expect(s.exercises[0].sets[0].timeSec).toBe(64)
    s = logCurrentSet(s, T0 + sec(64 + 58))     // Wall balls round 1: 58s
    expect(s.exercises[1].sets[0].timeSec).toBe(58)
  })

  it('the station count-up derives from the segment anchor and survives a pause', () => {
    let s = circuit()
    expect(segmentElapsedSec(s, T0 + sec(30))).toBe(30)
    s = pause(s, T0 + sec(30))
    s = resume(s, T0 + sec(330))                // 5-minute pause
    expect(segmentElapsedSec(s, T0 + sec(340))).toBe(40)
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
    s = startNextSet(s, T0 + sec(120))
    s = skipCurrentSet(s, T0 + sec(130))       // set 2 skipped
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

describe('circuit rest — the plan\'s "Rest 2 min between" is a timed rest, not a station', () => {
  function circuit(circuitRest: { sec: number; between: 'rounds' | 'stations' }) {
    return startSession(
      [
        { name: 'SkiErg', focus: 'full', sets: [{ reps: 1, weight: '' }, { reps: 1, weight: '' }] },
        { name: 'Wall balls', focus: 'full', sets: [{ reps: 15, weight: '14 lb' }, { reps: 15, weight: '14 lb' }] },
      ],
      { dayLabel: 'Fri 9/18', traversal: 'round', plannedRest: circuitRest },
      T0,
    )
  }

  it('between rounds: stations flow straight, the round boundary rests for the prescribed time', () => {
    let s = circuit({ sec: 120, between: 'rounds' })
    s = logCurrentSet(s, T0 + sec(60))          // SkiErg r1 → Wall balls r1, no rest
    expect(s.phase).toBe('exercise')
    expect(s.cursor).toEqual({ exIdx: 1, setIdx: 0 })
    s = logCurrentSet(s, T0 + sec(120))         // Wall balls r1 → rest before round 2
    expect(s.phase).toBe('rest')
    expect(s.restPlannedSec).toBe(120)
    expect(s.cursor).toEqual({ exIdx: 1, setIdx: 0 }) // still on the logged station
    expect(restRemainingSec(s, T0 + sec(150))).toBe(90)
    s = startNextSet(s, T0 + sec(240))
    expect(s.phase).toBe('exercise')
    expect(s.cursor).toEqual({ exIdx: 0, setIdx: 1 }) // round 2 opens at SkiErg
    expect(segmentElapsedSec(s, T0 + sec(250))).toBe(10)
    // The last station of the last round finishes, never rests.
    s = logCurrentSet(s, T0 + sec(300))
    s = logCurrentSet(s, T0 + sec(360))
    expect(s.phase).toBe('finished')
  })

  it('between stations: every station hands off through a rest screen', () => {
    let s = circuit({ sec: 90, between: 'stations' })
    s = logCurrentSet(s, T0 + sec(60))
    expect(s.phase).toBe('rest')
    expect(s.restPlannedSec).toBe(90)
    s = startNextSet(s, T0 + sec(150))
    expect(s.cursor).toEqual({ exIdx: 1, setIdx: 0 })
  })

  it('a skipped station earns no rest, and the split still records for logged ones', () => {
    let s = circuit({ sec: 120, between: 'rounds' })
    s = logCurrentSet(s, T0 + sec(64))
    s = skipCurrentSet(s, T0 + sec(70))          // Wall balls r1 skipped — closes the round
    expect(s.phase).toBe('exercise')
    expect(s.cursor).toEqual({ exIdx: 0, setIdx: 1 })
    expect(s.exercises[0].sets[0].timeSec).toBe(64)
  })

  it('straight sets: the plan\'s rest replaces the guide default after every set', () => {
    let s = startSession(exercises(), { dayLabel: 'Mon', plannedRest: { sec: 90, between: 'rounds' } }, T0)
    s = logCurrentSet(s, T0 + sec(60))
    expect(s.phase).toBe('rest')
    expect(s.restPlannedSec).toBe(90)
    // A zero-second prescription is no prescription.
    expect(startSession(exercises(), { dayLabel: 'Mon', plannedRest: { sec: 0, between: 'rounds' } }, T0).plannedRest).toBeUndefined()
  })
})

describe('adding a round — the one-pass draft grows when the athlete goes again', () => {
  it('every station gets one more unchecked set and the cursor walks into it', () => {
    let s = startSession(
      [
        { name: 'SkiErg', focus: 'full', sets: [{ reps: 1, weight: '' }] },
        { name: 'Row', focus: 'full', sets: [{ reps: 1, weight: '' }] },
      ],
      { dayLabel: 'Fri 9/18', traversal: 'round', plannedRest: { sec: 120, between: 'stations' } },
      T0,
    )
    s = logCurrentSet(s, T0 + sec(60))
    s = startNextSet(s, T0 + sec(180))
    expect(nextCursor(s, s.cursor)).toBeNull()       // last station of the only round
    s = addRound(s)
    expect(s.exercises.map(ex => ex.sets.length)).toEqual([2, 2])
    expect(s.exercises[0].sets[1]).toEqual({ reps: 1, weight: '', done: false })
    expect(nextCursor(s, s.cursor)).toEqual({ exIdx: 0, setIdx: 1 })
    // Not for straight sets, not for a simulation, not after finishing.
    const straight = fresh()
    expect(addRound(straight)).toBe(straight)
    const sim = { ...s, sim: true }
    expect(addRound(sim)).toBe(sim)
    const done = endSession(s)
    expect(addRound(done)).toBe(done)
  })
})

describe('adding an exercise mid-session — the pivot when the sleds are taken', () => {
  const legPress: StrengthExerciseLog = {
    name: 'Single-Leg Leg Press', focus: 'lower',
    sets: [{ reps: 10, weight: '70 lb' }, { reps: 10, weight: '70 lb' }, { reps: 10, weight: '70 lb' }],
  }

  it('straight sets: slots in right after the current exercise and is up next, cursor untouched', () => {
    let s = fresh()
    s = addExercise(s, legPress)
    expect(s.exercises.map(ex => ex.name)).toEqual(['Goblet squats', 'Single-Leg Leg Press', 'Plank'])
    expect(s.cursor).toEqual({ exIdx: 0, setIdx: 0 })
    expect(s.exercises[1].sets.every(set => set.done === false)).toBe(true)
    // Finish the squats: rest, then the new exercise is what comes next.
    s = logCurrentSet(s, T0 + sec(60))
    s = startNextSet(s, T0 + sec(120))
    s = logCurrentSet(s, T0 + sec(180))
    s = startNextSet(s, T0 + sec(240))
    expect(s.cursor).toEqual({ exIdx: 1, setIdx: 0 })
    expect(s.exercises[1].name).toBe('Single-Leg Leg Press')
  })

  it('during rest after an exercise\'s last set, the added exercise is where the rest lands', () => {
    let s = fresh()
    s = logCurrentSet(s, T0 + sec(60))
    s = startNextSet(s, T0 + sec(120))
    s = logCurrentSet(s, T0 + sec(180))          // squats done → resting
    expect(s.phase).toBe('rest')
    s = addExercise(s, legPress)
    s = startNextSet(s, T0 + sec(240))
    expect(s.exercises[s.cursor.exIdx].name).toBe('Single-Leg Leg Press')
  })

  it('circuit: one set per round, next up in the current round, earlier rounds left unchecked', () => {
    let s = startSession(
      [
        { name: 'SkiErg', focus: 'full', sets: [{ reps: 1, weight: '' }, { reps: 1, weight: '' }] },
        { name: 'Sled push', focus: 'full', sets: [{ reps: 1, weight: '' }, { reps: 1, weight: '' }] },
        { name: 'Row', focus: 'full', sets: [{ reps: 1, weight: '' }, { reps: 1, weight: '' }] },
      ],
      { dayLabel: 'Fri 9/18', traversal: 'round' },
      T0,
    )
    s = logCurrentSet(s, T0 + sec(60))            // SkiErg r1 done, standing on Sled push
    s = addExercise(s, legPress)                  // sleds are taken
    expect(s.exercises.map(ex => ex.name)).toEqual(['SkiErg', 'Sled push', 'Single-Leg Leg Press', 'Row'])
    expect(s.exercises[2].sets).toHaveLength(2)   // one per round, not the draft's three
    expect(s.exercises[2].sets[0].weight).toBe('70 lb')
    s = skipCurrentSet(s, T0 + sec(65))           // skip the sled
    expect(s.cursor).toEqual({ exIdx: 2, setIdx: 0 })
    s = logCurrentSet(s, T0 + sec(125))
    expect(s.exercises[2].sets[0]).toMatchObject({ done: true, timeSec: 60 })
    expect(s.cursor).toEqual({ exIdx: 3, setIdx: 0 })
    const w = toActualWorkout({ ...s, phase: 'finished' }, T0 + sec(125))
    expect(w.stationSplits!.map(x => x.label)).toEqual(['SkiErg — round 1', 'Single-Leg Leg Press — round 1'])
  })

  it('circuit, added in round 2: round 1 of the new station reads as skipped, round 2 is live', () => {
    let s = startSession(
      [
        { name: 'SkiErg', focus: 'full', sets: [{ reps: 1, weight: '' }, { reps: 1, weight: '' }] },
        { name: 'Row', focus: 'full', sets: [{ reps: 1, weight: '' }, { reps: 1, weight: '' }] },
      ],
      { dayLabel: 'Fri 9/18', traversal: 'round' },
      T0,
    )
    s = logCurrentSet(s, T0 + sec(60))
    s = logCurrentSet(s, T0 + sec(120))           // round 2 opens at SkiErg
    expect(s.cursor).toEqual({ exIdx: 0, setIdx: 1 })
    s = addExercise(s, { ...legPress, sets: [legPress.sets[0]] })
    expect(s.exercises[1].name).toBe('Single-Leg Leg Press')
    expect(s.exercises[1].sets.map(x => x.done)).toEqual([false, false])
    s = logCurrentSet(s, T0 + sec(180))
    expect(s.cursor).toEqual({ exIdx: 1, setIdx: 1 })
    s = logCurrentSet(s, T0 + sec(240))
    expect(s.exercises[1].sets.map(x => x.done)).toEqual([false, true])
    // The round-1 gap is honest: only round 2 has a split.
    expect(collectStationSplits(s).filter(x => x.label.startsWith('Single-Leg')).map(x => x.label)).toEqual(['Single-Leg Leg Press — round 2'])
  })

  it('circuit, added during the rest that closes a round: it opens the next round, and there is one rest, not two', () => {
    let s = startSession(
      [
        { name: 'SkiErg', focus: 'full', sets: [{ reps: 1, weight: '' }, { reps: 1, weight: '' }] },
        { name: 'Row', focus: 'full', sets: [{ reps: 1, weight: '' }, { reps: 1, weight: '' }] },
      ],
      { dayLabel: 'Fri 9/18', traversal: 'round', plannedRest: { sec: 120, between: 'rounds' } },
      T0,
    )
    s = logCurrentSet(s, T0 + sec(60))
    s = logCurrentSet(s, T0 + sec(120))           // Row r1 closes the round → rest
    expect(s.phase).toBe('rest')
    s = addExercise(s, legPress)
    expect(s.exercises.map(ex => ex.name)).toEqual(['Single-Leg Leg Press', 'SkiErg', 'Row'])
    expect(s.cursor).toEqual({ exIdx: 2, setIdx: 0 }) // still the Row just logged
    s = startNextSet(s, T0 + sec(240))
    expect(s.cursor).toEqual({ exIdx: 0, setIdx: 1 }) // round 2 opens on the leg press
    s = logCurrentSet(s, T0 + sec(300))
    expect(s.phase).toBe('exercise')                  // no second rest
    expect(s.cursor).toEqual({ exIdx: 1, setIdx: 1 })
  })

  it('refuses a nameless exercise, an empty one, and any add after finishing', () => {
    const s = fresh()
    expect(addExercise(s, { name: '  ', focus: 'full', sets: [{ reps: 10, weight: '' }] })).toBe(s)
    expect(addExercise(s, { name: 'Row', focus: 'upper', sets: [] })).toBe(s)
    const done = endSession(s)
    expect(addExercise(done, legPress)).toBe(done)
  })
})
