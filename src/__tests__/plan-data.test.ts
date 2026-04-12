import { describe, it, expect } from 'vitest'
import { mikePlan } from '../data'
import type { WorkoutType } from '../types'

const VALID_TYPES: WorkoutType[] = [
  'strength', 'run', 'quality', 'long', 'cross', 'rest', 'limited', 'travel', 'race',
]

describe('mikePlan data', () => {
  it('has 10 weeks', () => {
    expect(mikePlan.weeks).toHaveLength(10)
  })

  it('each week has 7 days', () => {
    mikePlan.weeks.forEach(week => {
      expect(week.days).toHaveLength(7)
    })
  })

  it('weeks are numbered 1-10', () => {
    mikePlan.weeks.forEach((week, i) => {
      expect(week.num).toBe(i + 1)
    })
  })

  it('all workout types are valid', () => {
    mikePlan.weeks.forEach(week => {
      week.days.forEach(day => {
        expect(VALID_TYPES).toContain(day.type)
      })
    })
  })

  it('every day has required fields', () => {
    mikePlan.weeks.forEach(week => {
      week.days.forEach(day => {
        expect(day.day).toBeTruthy()
        expect(day.workout).toBeTruthy()
        expect(typeof day.zone).toBe('string')
        expect(typeof day.route).toBe('string')
        expect(typeof day.time).toBe('string')
      })
    })
  })

  it('athlete profile is complete', () => {
    expect(mikePlan.athlete.name).toBe('Mike')
    expect(mikePlan.athlete.maxHR).toBe(197)
    expect(mikePlan.athlete.currentBase).toBeTruthy()
  })

  it('has 4 HR zones', () => {
    expect(mikePlan.zones).toHaveLength(4)
  })

  it('race info is complete', () => {
    expect(mikePlan.race.name).toContain('Broken Arrow')
    expect(mikePlan.race.distanceMiles).toBe(11)
    expect(mikePlan.race.landmarks.length).toBeGreaterThan(0)
    expect(mikePlan.race.gear.length).toBeGreaterThan(0)
  })
})
