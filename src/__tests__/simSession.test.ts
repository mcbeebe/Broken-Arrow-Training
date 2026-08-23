/**
 * Race-simulation sessions (Phase 3b) — sim-day detection, race-spec
 * segment drafting, and the sim save contract through the live engine:
 * splits per segment, distance from completed run legs, no strength log.
 */
import { describe, it, expect } from 'vitest'
import type { PlannedDay } from '../types'
import { isSimDay, simRoundCount, simTitle, draftSimSegments } from '../utils/simSession'
import {
  startSession, logCurrentSet, skipCurrentSet, endSession,
  collectStationSplits, toActualWorkout,
} from '../utils/liveSession'

const T0 = 1_756_000_000_000
const sec = (n: number) => n * 1000

const fullSim: PlannedDay = {
  day: 'Sat 9/12', type: 'long', workout: '★ FULL RACE SIMULATION',
  detail: 'The complete race at full race spec…', zone: '5 mi + stations · Z3–Z4',
  route: 'Gym', time: '~110 min',
}
const halfSim: PlannedDay = {
  day: 'Sat 8/29', type: 'long', workout: 'HALF SIMULATION: 4 runs + 4 stations',
  detail: 'Race order, race weights…', zone: '2.5 mi + stations · Z3–Z4',
  route: 'Gym', time: '~60 min',
}

describe('sim-day detection', () => {
  it('recognizes the generator\'s FULL and HALF simulation days', () => {
    expect(isSimDay(fullSim)).toBe(true)
    expect(isSimDay(halfSim)).toBe(true)
    expect(simRoundCount(fullSim)).toBe(8)
    expect(simRoundCount(halfSim)).toBe(4)
    expect(simTitle(fullSim)).toBe('Race simulation')
    expect(simTitle(halfSim)).toBe('Half simulation')
  })

  it('does not fire on ordinary long runs or station circuits', () => {
    expect(isSimDay({ ...fullSim, workout: 'Long run' })).toBe(false)
    expect(isSimDay({ ...fullSim, type: 'cross', workout: 'Station circuit (intro)' })).toBe(false)
  })
})

describe('draftSimSegments', () => {
  it('drafts the full race as 16 alternating run/station segments in race order', () => {
    const segs = draftSimSegments(fullSim)
    expect(segs).toHaveLength(16)
    expect(segs.map(s => s.name.split(' — ')[0])).toEqual([
      'Run 1', 'SkiErg', 'Run 2', 'Sled push', 'Run 3', 'Sled pull',
      'Run 4', 'Burpee broad jumps', 'Run 5', 'Row', 'Run 6', 'Farmer carry',
      'Run 7', 'Sandbag lunges', 'Run 8', 'Wall balls',
    ])
    // Every segment is exactly one set — round-major traversal walks them
    // strictly in order.
    expect(segs.every(s => s.sets.length === 1)).toBe(true)
    // Open-male loads render into the segment name.
    expect(segs[3].name).toBe('Sled push — 50 m @ 152 kg')
    expect(segs[15].name).toBe('Wall balls — 100 reps @ 6 kg to 3.0 m')
  })

  it('the half sim is the first 4 stations; loads follow division and sex', () => {
    const segs = draftSimSegments(halfSim, { division: 'pro', sex: 'female' })
    expect(segs).toHaveLength(8)
    expect(segs[7].name.startsWith('Burpee broad jumps')).toBe(true)
    expect(segs[3].name).toBe('Sled push — 50 m @ 152 kg') // pro female = open male push
    expect(segs[5].name).toBe('Sled pull — 50 m @ 103 kg')
  })
})

describe('the sim save contract', () => {
  function played() {
    let s = startSession(
      draftSimSegments(halfSim),
      { dayLabel: 'Sat 8/29', dayIso: '2026-08-29', traversal: 'round', sim: true, title: 'Half simulation' },
      T0,
    )
    // Run 1 (300s) → SkiErg (250s) → Run 2 (310s) → skip Sled push → …
    s = logCurrentSet(s, T0 + sec(300))
    s = logCurrentSet(s, T0 + sec(550))
    s = logCurrentSet(s, T0 + sec(860))
    s = skipCurrentSet(s, T0 + sec(870))
    return s
  }

  it('collectStationSplits keeps traversal order, kinds, and honest skips', () => {
    const splits = collectStationSplits(endSession(played()))
    expect(splits).toEqual([
      { label: 'Run 1 — 1 km', kind: 'run', sec: 300 },
      { label: 'SkiErg — 1000 m', kind: 'station', sec: 250 },
      { label: 'Run 2 — 1 km', kind: 'run', sec: 310 },
      // Sled push skipped — no split, no credit.
    ])
  })

  it('a sim saves as a generic workout: splits, run distance, no strength log', () => {
    const s = endSession(played())
    const w = toActualWorkout(s, T0 + sec(900))
    expect(w.type).toBe('workout')
    expect(w.name).toBe('Half simulation — Sat 8/29')
    expect(w.stationSplits).toHaveLength(3)
    expect(w.strengthLog).toBeUndefined()
    // 2 completed run legs × 1 km.
    expect(w.distance).toBeCloseTo(1.24, 2)
    expect(w.movingTime).toBe(900)
    expect(w.startDate).toBe('2026-08-29T08:00:00')
  })

  it('multi-round circuits stamp the round on split labels; strength saves are unchanged', () => {
    let s = startSession(
      [
        { name: 'SkiErg', focus: 'full', sets: [{ reps: 1, weight: '' }, { reps: 1, weight: '' }] },
        { name: 'Wall balls', focus: 'full', sets: [{ reps: 15, weight: '14 lb' }, { reps: 15, weight: '14 lb' }] },
      ],
      { dayLabel: 'Fri 8/28', dayIso: '2026-08-28', traversal: 'round' },
      T0,
    )
    s = logCurrentSet(s, T0 + sec(64))
    s = logCurrentSet(s, T0 + sec(120))
    s = endSession(s)
    const w = toActualWorkout(s, T0 + sec(120))
    expect(w.type).toBe('strength_training')
    expect(w.strengthLog).toHaveLength(2)
    expect(w.stationSplits).toEqual([
      { label: 'SkiErg — round 1', kind: 'station', sec: 64 },
      { label: 'Wall balls — round 1', kind: 'station', sec: 56 },
    ])
  })

  it('straight-sets sessions never carry stationSplits', () => {
    let s = startSession(
      [{ name: 'Goblet squats', focus: 'lower', sets: [{ reps: 12, weight: '20 lb' }] }],
      { dayLabel: 'Mon 8/24' },
      T0,
    )
    s = logCurrentSet(s, T0 + sec(60))
    const w = toActualWorkout(s, T0 + sec(60))
    expect(w.stationSplits).toBeUndefined()
  })
})
