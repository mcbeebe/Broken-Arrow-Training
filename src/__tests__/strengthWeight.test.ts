/**
 * Starting-weight engine — verifies body-weight ratios and experience
 * multipliers produce sensible, athlete-specific load prescriptions and
 * fall back cleanly when inputs are missing.
 */
import { describe, it, expect } from 'vitest'
import { computeStartingWeight } from '../utils/strengthWeight'

function lbOf(result: string | null): number {
  if (!result) return 0
  const m = result.match(/(\d+)\s*lb/)
  return m ? parseInt(m[1], 10) : 0
}

describe('computeStartingWeight — missing inputs', () => {
  it('returns null when body weight is missing', () => {
    expect(computeStartingWeight('Goblet Squat 3×12', undefined, 'intermediate')).toBeNull()
  })

  it('returns null when body weight is zero', () => {
    expect(computeStartingWeight('Goblet Squat 3×12', 0, 'intermediate')).toBeNull()
  })

  it('returns null for bodyweight-only exercises so caller falls back to guide text', () => {
    expect(computeStartingWeight('Plank 3×45s', 160, 'intermediate')).toBeNull()
    expect(computeStartingWeight('Dead Bug 3×10/side', 160, 'intermediate')).toBeNull()
    expect(computeStartingWeight('Calf Raise 3×15', 160, 'intermediate')).toBeNull()
  })

  it('returns null for unknown exercise names', () => {
    expect(computeStartingWeight('Made-Up Exercise 3×10', 160, 'intermediate')).toBeNull()
  })
})

describe('computeStartingWeight — body weight scales load', () => {
  it('heavier athlete gets a heavier prescription', () => {
    const lighter = lbOf(computeStartingWeight('Goblet Squat', 130, 'intermediate'))
    const heavier = lbOf(computeStartingWeight('Goblet Squat', 200, 'intermediate'))
    expect(heavier).toBeGreaterThan(lighter)
  })

  it('Goblet Squat: 160-lb intermediate ≈ 0.20 × 160 = 32 → 30 lb dumbbell', () => {
    const result = computeStartingWeight('Goblet Squat 3×12', 160, 'intermediate')
    expect(result).toMatch(/30 lb dumbbell/)
  })

  it('BB Back Squat: 180-lb intermediate ≈ 0.65 × 180 = 117 → 115 lb barbell', () => {
    const result = computeStartingWeight('Barbell Back Squat 3×8', 180, 'intermediate')
    expect(result).toMatch(/115 lb barbell/)
  })
})

describe('computeStartingWeight — experience multiplier', () => {
  it('beginner gets lighter weight than intermediate', () => {
    const beg = lbOf(computeStartingWeight('Goblet Squat', 160, 'beginner'))
    const inter = lbOf(computeStartingWeight('Goblet Squat', 160, 'intermediate'))
    expect(beg).toBeLessThan(inter)
  })

  it('advanced gets heavier weight than intermediate', () => {
    const inter = lbOf(computeStartingWeight('Goblet Squat', 160, 'intermediate'))
    const adv = lbOf(computeStartingWeight('Goblet Squat', 160, 'advanced'))
    expect(adv).toBeGreaterThan(inter)
  })

  it('none gets the lightest weight of all', () => {
    const none = lbOf(computeStartingWeight('Goblet Squat', 160, 'none'))
    const beg = lbOf(computeStartingWeight('Goblet Squat', 160, 'beginner'))
    expect(none).toBeLessThan(beg)
  })

  it('defaults to beginner multiplier when experience is undefined', () => {
    const def = lbOf(computeStartingWeight('Goblet Squat', 160, undefined))
    const beg = lbOf(computeStartingWeight('Goblet Squat', 160, 'beginner'))
    expect(def).toBe(beg)
  })
})

describe('computeStartingWeight — load shape formatting', () => {
  it('single-dumbbell exercises produce "N lb dumbbell"', () => {
    const result = computeStartingWeight('Goblet Squat', 160, 'intermediate')
    expect(result).toMatch(/^\d+ lb dumbbell$/)
  })

  it('two-dumbbell exercises produce "N lb dumbbells (each hand)"', () => {
    const result = computeStartingWeight('Bulgarian Split Squat 3×10/leg', 160, 'intermediate')
    expect(result).toMatch(/^\d+ lb dumbbells \(each hand\)$/)
  })

  it('barbell exercises produce "N lb barbell"', () => {
    const result = computeStartingWeight('Barbell Back Squat', 180, 'intermediate')
    expect(result).toMatch(/^\d+ lb barbell$/)
  })
})

describe('computeStartingWeight — plate rounding', () => {
  it('rounds to nearest 5 lb', () => {
    // Goblet Squat × 0.20 × 0.75 × 145 = 21.75 → 20
    const result = computeStartingWeight('Goblet Squat', 145, 'beginner')
    expect(lbOf(result) % 5).toBe(0)
  })

  it('clamps to 5 lb minimum for very light athletes', () => {
    const result = computeStartingWeight('Goblet Squat', 80, 'none')
    expect(lbOf(result)).toBeGreaterThanOrEqual(5)
  })
})

describe('computeStartingWeight — exercise name matching', () => {
  it('matches across name variants ("RDL" vs "Romanian Deadlift")', () => {
    const rdl = computeStartingWeight('RDL 3×10', 160, 'intermediate')
    const full = computeStartingWeight('Romanian Deadlift (RDL) 3×10', 160, 'intermediate')
    expect(rdl).toEqual(full)
  })

  it('matches "Back Squat" and "BB Back Squat" to the same load profile', () => {
    expect(lbOf(computeStartingWeight('BB Back Squat', 180, 'intermediate')))
      .toBe(lbOf(computeStartingWeight('Back Squat', 180, 'intermediate')))
  })
})
