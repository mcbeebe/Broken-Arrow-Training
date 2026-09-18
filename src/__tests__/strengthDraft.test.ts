/**
 * The plan-detail parser. Field bug: a station circuit's detail ended
 * "· Rest 2 min between · Grip note: finish with 2× dead hang…" and both
 * lines logged as exercises (3 × 10 each, "Last time: BW × 10"). The
 * prescription now separates work from instructions.
 */
import { describe, it, expect } from 'vitest'
import { parsePlanPrescription, parsePlanExercises, parseRestDirective } from '../utils/strengthDraft'

const INTRO_CIRCUIT =
  'SkiErg 500m · Sled push 25m @ 152 kg · Sled pull 25m @ 103 kg · Burpee broad jumps 40m · Row 500m'
  + ' · Wall balls 50 @ 6 kg to 3.0 m · Wall balls practice · Rest 2 min between'
  + ' · Grip note: finish with 2× dead hang to build the carry/pull grip the race demands'

describe('parseRestDirective', () => {
  it('reads minutes and seconds, and which boundary the rest sits on', () => {
    expect(parseRestDirective('Rest 2 min between')).toEqual({ sec: 120, between: 'rounds' })
    expect(parseRestDirective('Walk 2 min between rounds')).toEqual({ sec: 120, between: 'rounds' })
    expect(parseRestDirective('90 sec rest between stations')).toEqual({ sec: 90, between: 'stations' })
    expect(parseRestDirective('Rest 1.5 min between sets')).toEqual({ sec: 90, between: 'stations' })
  })

  it('is null for exercises, and for rest lines with no duration', () => {
    expect(parseRestDirective('Farmer carry 3×40m')).toBeNull()
    expect(parseRestDirective('Rest fully between tests — this is a measurement')).toBeNull()
    expect(parseRestDirective('Wall balls 50 @ 6 kg to 3.0 m')).toBeNull()
  })
})

describe('parsePlanPrescription', () => {
  it('keeps the stations, lifts the rest out, and files the grip note as a note', () => {
    const p = parsePlanPrescription(INTRO_CIRCUIT)
    expect(p.exercises.map(e => e.name)).toEqual([
      'SkiErg 500m', 'Sled push 25m @ 152 kg', 'Sled pull 25m @ 103 kg', 'Burpee broad jumps 40m',
      'Row 500m', 'Wall balls 50 @ 6 kg to 3.0 m', 'Wall balls practice',
    ])
    expect(p.rest).toEqual({ sec: 120, between: 'rounds' })
    expect(p.notes).toEqual(['Grip note: finish with 2× dead hang to build the carry/pull grip the race demands'])
  })

  it('the multi-station circuit rests between stations', () => {
    const p = parsePlanPrescription('SkiErg 500m · Row 500m · Wall balls extra set · Light sled — focus on form · 90 sec rest between stations')
    expect(p.rest).toEqual({ sec: 90, between: 'stations' })
    expect(p.exercises.map(e => e.name)).toEqual(['SkiErg 500m', 'Row 500m', 'Wall balls extra set', 'Light sled — focus on form'])
  })

  it('a durationless "rest between" line is a note, not a timer', () => {
    const p = parsePlanPrescription('Push-ups: as many as you can · Rest fully between tests — this is a measurement, not a workout')
    expect(p.rest).toBeUndefined()
    expect(p.notes).toEqual(['Rest fully between tests — this is a measurement, not a workout'])
    expect(p.exercises).toHaveLength(1)
  })

  it('a plain strength day has no rest or notes and parses sets as before', () => {
    const p = parsePlanPrescription('Goblet squats 3×12 · Walking lunges 3×10/leg · Plank 3×45s')
    expect(p.rest).toBeUndefined()
    expect(p.notes).toEqual([])
    expect(p.exercises.map(e => [e.name, e.sets.length, e.sets[0].reps])).toEqual([
      ['Goblet squats', 3, 12], ['Walking lunges', 3, 10], ['Plank', 3, 45],
    ])
  })

  it('empty detail is an empty prescription', () => {
    expect(parsePlanPrescription('')).toEqual({ exercises: [], notes: [] })
  })
})

describe('parsePlanExercises', () => {
  it('is the prescription minus rest and notes — the manual log stops drafting "Rest 2 min between"', () => {
    const names = parsePlanExercises('Sled push 4×15m · Wall balls 3×15 · Farmer carry 3×40m · Rest 2 min between').map(e => e.name)
    expect(names).toEqual(['Sled push', 'Wall balls', 'Farmer carry'])
  })
})
