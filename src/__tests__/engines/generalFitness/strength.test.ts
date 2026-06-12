import { describe, it, expect } from 'vitest'
import {
  parseGoalEmphasis,
  buildStrengthDay,
  emphasisLabel,
} from '../../../engines/generalFitness/strength'
import { getExerciseGuide } from '../../../utils/exercises'
import type { MuscleEmphasis } from '../../../engines/generalFitness/strength'

describe('parseGoalEmphasis — reads the free-text goal', () => {
  it('maps "big biceps" → arms', () => {
    expect(parseGoalEmphasis('I want big biceps')).toEqual(['arms'])
  })

  it('reads the words real users type (guns, booty, wheels, six-pack)', () => {
    expect(parseGoalEmphasis('bigger guns')).toContain('arms')
    expect(parseGoalEmphasis('grow my booty')).toContain('glutes')
    expect(parseGoalEmphasis('tree-trunk wheels')).toContain('legs')
    expect(parseGoalEmphasis('visible six-pack')).toContain('core')
    expect(parseGoalEmphasis('a wider back')).toContain('back')
    expect(parseGoalEmphasis('boulder shoulders')).toContain('shoulders')
    expect(parseGoalEmphasis('bigger chest')).toContain('chest')
  })

  it('handles multiple named muscles', () => {
    const e = parseGoalEmphasis('big biceps and a wider back')
    expect(e).toContain('arms')
    expect(e).toContain('back')
  })

  it('returns [] for a goal that names no muscle', () => {
    expect(parseGoalEmphasis('just feel healthy and have more energy')).toEqual([])
    expect(parseGoalEmphasis(undefined)).toEqual([])
    expect(parseGoalEmphasis('')).toEqual([])
  })
})

describe('buildStrengthDay — variety + targeting', () => {
  const ALL: MuscleEmphasis[] = ['arms', 'chest', 'back', 'shoulders', 'glutes', 'legs', 'core']

  it('alternates two distinct sessions across days (no two consecutive identical)', () => {
    const a = buildStrengthDay('build_muscle', [], 0).map(m => m.name)
    const b = buildStrengthDay('build_muscle', [], 1).map(m => m.name)
    expect(a).not.toEqual(b)
    // Day 2 returns to session A's base.
    const c = buildStrengthDay('build_muscle', [], 2).map(m => m.name)
    expect(c).toEqual(a)
  })

  it('every movement — base AND emphasis accessory — resolves to a form guide', () => {
    for (const emphasis of ALL) {
      for (let day = 0; day < 4; day++) {
        const moves = buildStrengthDay('build_muscle', [emphasis], day)
        expect(moves.length).toBeGreaterThanOrEqual(6)
        for (const m of moves) {
          expect(getExerciseGuide(m.name), `no guide for "${m.name}"`).not.toBeNull()
        }
      }
    }
  })

  it('a single focused emphasis gets TWO direct accessories per session', () => {
    // "big biceps" → at least two direct arm movements every strength day.
    const armMoves = ['Bicep curl', 'Hammer curl', 'Overhead tricep extension']
    for (let day = 0; day < 4; day++) {
      const names = buildStrengthDay('build_muscle', ['arms'], day).map(m => m.name)
      const directArms = names.filter(n => armMoves.includes(n))
      expect(directArms.length, `day ${day}: ${names.join(', ')}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('never repeats a movement within one session', () => {
    for (const emphasis of ALL) {
      for (let day = 0; day < 4; day++) {
        const names = buildStrengthDay('build_muscle', [emphasis, 'back'], day).map(m => m.name.toLowerCase())
        expect(new Set(names).size).toBe(names.length)
      }
    }
  })

  it('fat-loss keeps its direct-core finisher (Dead bug + Russian twists)', () => {
    const names = buildStrengthDay('lose_fat', [], 0).map(m => m.name)
    expect(names).toContain('Dead bug')
    expect(names).toContain('Russian twists')
  })
})

describe('emphasisLabel', () => {
  it('formats one, two, and three muscles', () => {
    expect(emphasisLabel(['arms'])).toBe('arms')
    expect(emphasisLabel(['arms', 'back'])).toBe('arms and back')
    expect(emphasisLabel(['arms', 'back', 'core'])).toBe('arms, back, and core')
    expect(emphasisLabel([])).toBeNull()
  })
})
