/**
 * P3 — the rhythm strip.
 *
 * Consistency made visible without shame: a day is resolved (trained, or
 * rested as planned) or open. "Missed" is not a state this product has.
 */
import { describe, it, expect } from 'vitest'
import { buildRhythm, resolvedCount, newestOpenDay } from '../utils/rhythm'
import type { TrainingWeek, PlannedDay, WorkoutType, ActualWorkout } from '../types'

const TODAY = '2026-08-29'

const day = (type: WorkoutType, actual?: Partial<ActualWorkout>): PlannedDay => ({
  day: 'D', type, workout: type === 'rest' ? 'Rest' : 'Session',
  detail: '', zone: 'Z2', route: '', time: '40 min',
  ...(actual ? { actual: { type: 'run', durationMinutes: 40, ...actual } as ActualWorkout } : {}),
})

/** A week starting 6 days before today, so it ends on today. */
const week = (types: [WorkoutType, boolean][]): TrainingWeek[] => ([{
  num: 1, dates: '', miles: 20, focus: 'Build',
  startIso: '2026-08-23',
  days: types.map(([t, done]) => day(t, done ? {} : undefined)),
}])

describe('what the dots mean', () => {
  it('counts a trained day and a planned rest day both as resolved', () => {
    const r = buildRhythm(week([
      ['run', true], ['quality', true], ['rest', false],
      ['run', true], ['rest', false], ['long', true], ['run', false],
    ]), TODAY)
    expect(r.map(d => d.state)).toEqual(['done', 'done', 'rest', 'done', 'rest', 'done', 'today'])
    expect(resolvedCount(r)).toEqual({ resolved: 6, of: 6 })
  })

  it('marks a planned session with nothing logged as open, never missed', () => {
    const r = buildRhythm(week([
      ['run', true], ['quality', false], ['rest', false],
      ['run', true], ['rest', false], ['long', true], ['run', false],
    ]), TODAY)
    expect(r[1].state).toBe('open')
    expect(resolvedCount(r)).toEqual({ resolved: 5, of: 6 })
    // The vocabulary is enforced by the type: there is no 'missed' state.
    expect(r.every(d => (d.state as string) !== 'missed')).toBe(true)
  })

  it('never counts today or a future day as resolved or open', () => {
    const r = buildRhythm(week([
      ['run', true], ['run', true], ['rest', false],
      ['run', true], ['rest', false], ['run', true], ['quality', false],
    ]), TODAY)
    expect(r[r.length - 1].state).toBe('today')
    expect(resolvedCount(r).of).toBe(6)
  })
})

describe('the open day the strip asks about', () => {
  it('picks the most recent one, which is the one still worth remembering', () => {
    const r = buildRhythm(week([
      ['quality', false], ['run', true], ['rest', false],
      ['long', false], ['rest', false], ['run', true], ['run', false],
    ]), TODAY)
    const open = newestOpenDay(r)
    expect(open?.iso).toBe('2026-08-26') // the Thursday long run, not Sunday's quality
  })

  it('returns nothing when the week is fully resolved', () => {
    const r = buildRhythm(week([
      ['run', true], ['run', true], ['rest', false],
      ['run', true], ['rest', false], ['run', true], ['run', false],
    ]), TODAY)
    expect(newestOpenDay(r)).toBeNull()
  })
})

describe('when the plan cannot be read', () => {
  it('returns nothing rather than inventing days', () => {
    expect(buildRhythm(undefined, TODAY)).toEqual([])
    expect(buildRhythm([], TODAY)).toEqual([])
  })

  it('skips weeks with no date anchor rather than mis-dating them', () => {
    const undated: TrainingWeek[] = [{
      num: 1, dates: '', miles: 10, focus: '', days: [day('run')],
    }]
    expect(buildRhythm(undated, TODAY)).toEqual([])
  })

  it('reports zero of zero rather than dividing by nothing', () => {
    expect(resolvedCount([])).toEqual({ resolved: 0, of: 0 })
  })
})
