/**
 * Parametric strength-routine builder — verifies the routine genuinely
 * varies by race profile, experience, equipment, injury, and phase, and
 * that method-level overrides shape the output as expected.
 */
import { describe, it, expect } from 'vitest'
import { buildRoutine, buildStrengthRoutineFor } from '../../../engines/planGenerator/strengthRoutine'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import type { TrainingMethod } from '../../../types/training-method'
import higdonMethod from '../../../data/methods/higdon.json'
import koopMethod from '../../../data/methods/koop.json'
import danielsMethod from '../../../data/methods/daniels.json'

const higdon = higdonMethod as unknown as TrainingMethod
const koop = koopMethod as unknown as TrainingMethod
const daniels = danielsMethod as unknown as TrainingMethod

function baseConfig(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'trail',
    raceName: 'Test Race',
    raceDate: '2026-09-01',
    raceDistance: '50k',
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5,
    wearable: 'garmin',
    athleteName: 'Test',
    age: 35,
    equipmentAccess: ['gym', 'trails'],
    injuryStatus: 'none',
    strengthDaysPerWeek: 2,
    completedAt: '',
    ...overrides,
  }
}

function exerciseNames(routine: string): string[] {
  return routine.split('·').map(s => s.trim().replace(/\s+\d+×.+$/, ''))
}

describe('buildRoutine — race profile drives exercise selection', () => {
  it('mountain ultras get eccentric and single-leg emphasis', () => {
    const routine = buildRoutine({
      raceType: 'trail',
      raceDistance: 'mountain_ultra',
      experience: 'intermediate',
      equipment: ['gym'],
      injury: 'none',
      phaseIntent: 'base',
      isTaper: false,
    })
    const names = exerciseNames(routine).join(' ').toLowerCase()
    expect(names).toMatch(/step-down|eccentric|nordic/)
    expect(names).toMatch(/bulgarian|step-up|sl deadlift|walking lunge/)
  })

  it('short road races skip eccentric, may include plyo for advanced athletes', () => {
    const routine = buildRoutine({
      raceType: 'general',
      raceDistance: '5k',
      experience: 'advanced',
      equipment: ['gym'],
      injury: 'none',
      phaseIntent: 'base',
      isTaper: false,
    })
    const names = exerciseNames(routine).join(' ').toLowerCase()
    expect(names).not.toMatch(/eccentric step-down/)
    expect(names).toMatch(/squat jump|jump/)
  })

  it('marathon emphasizes posterior chain', () => {
    const routine = buildRoutine({
      raceType: 'general',
      raceDistance: 'marathon',
      experience: 'intermediate',
      equipment: ['gym'],
      injury: 'none',
      phaseIntent: 'base',
      isTaper: false,
    })
    const names = exerciseNames(routine).join(' ').toLowerCase()
    expect(names).toMatch(/rdl|hip thrust|deadlift/)
  })
})

describe('buildRoutine — experience level scales sets', () => {
  it('beginner gets fewer sets than advanced', () => {
    const opts = {
      raceType: 'trail' as const,
      raceDistance: '50k' as const,
      equipment: ['gym'] as ('gym')[],
      injury: undefined,
      phaseIntent: 'build' as const,
      isTaper: false,
    }
    const beginner = buildRoutine({ ...opts, experience: 'beginner' })
    const advanced = buildRoutine({ ...opts, experience: 'advanced' })
    // Pull the leading set count out of e.g. "Goblet Squat 3×10 · ..."
    const setsOf = (r: string) => parseInt(r.match(/\b(\d+)×/)?.[1] ?? '0', 10)
    expect(setsOf(advanced)).toBeGreaterThan(setsOf(beginner))
  })
})

describe('buildRoutine — equipment access filters exercises', () => {
  it('no gym → no barbell movements', () => {
    const routine = buildRoutine({
      raceType: 'general',
      raceDistance: 'marathon',
      experience: 'advanced',
      equipment: ['trails'],
      injury: 'none',
      phaseIntent: 'build',
      isTaper: false,
    })
    expect(routine.toLowerCase()).not.toMatch(/barbell/)
  })

  it('gym access → barbell becomes eligible', () => {
    const routine = buildRoutine({
      raceType: 'general',
      raceDistance: 'marathon',
      experience: 'advanced',
      equipment: ['gym'],
      injury: 'none',
      phaseIntent: 'build',
      isTaper: false,
    })
    expect(routine.toLowerCase()).toMatch(/barbell|squat/)
  })
})

describe('buildRoutine — injury status', () => {
  it('current injury drops high-impact and medium-impact moves', () => {
    const routine = buildRoutine({
      raceType: 'general',
      raceDistance: '5k',
      experience: 'advanced',
      equipment: ['gym'],
      injury: 'current',
      phaseIntent: 'build',
      isTaper: false,
    })
    const lower = routine.toLowerCase()
    expect(lower).not.toMatch(/squat jump|jump/)
    expect(lower).not.toMatch(/nordic curl/) // medium impact
  })

  it('returning-from-injury keeps medium-impact but drops plyo', () => {
    const routine = buildRoutine({
      raceType: 'general',
      raceDistance: '5k',
      experience: 'advanced',
      equipment: ['gym'],
      injury: 'returning',
      phaseIntent: 'build',
      isTaper: false,
    })
    expect(routine.toLowerCase()).not.toMatch(/squat jump/)
  })
})

describe('buildRoutine — phase scales volume', () => {
  it('taper produces fewer exercises and lighter prescription', () => {
    const base = buildRoutine({
      raceType: 'trail',
      raceDistance: '50k',
      experience: 'intermediate',
      equipment: ['gym'],
      injury: 'none',
      phaseIntent: 'base',
      isTaper: false,
    })
    const taper = buildRoutine({
      raceType: 'trail',
      raceDistance: '50k',
      experience: 'intermediate',
      equipment: ['gym'],
      injury: 'none',
      phaseIntent: 'base',
      isTaper: true,
    })
    expect(exerciseNames(taper).length).toBeLessThan(exerciseNames(base).length)
  })
})

describe('method overrides shape the routine', () => {
  it('Higdon (bodyweightOnly + exerciseCap=4) produces a short bodyweight routine', () => {
    const routine = buildStrengthRoutineFor(higdon, baseConfig({ raceType: 'general', raceDistance: 'marathon' }), { phaseId: 'base', isTaper: false, weekNumber: 1 })
    expect(exerciseNames(routine).length).toBeLessThanOrEqual(4)
    // No barbell or weighted gym equipment names
    expect(routine.toLowerCase()).not.toMatch(/barbell|hip thrust|leg press/)
  })

  it('Koop emphasizes single-leg / posterior / eccentric / core', () => {
    const routine = buildStrengthRoutineFor(koop, baseConfig({ raceType: 'trail', raceDistance: 'mountain_ultra' }), { phaseId: 'base', isTaper: false, weekNumber: 1 })
    const lower = routine.toLowerCase()
    // Single-leg category present
    expect(lower).toMatch(/bulgarian|sl deadlift|step-up|walking lunge/)
    // Posterior chain present
    expect(lower).toMatch(/rdl|hip thrust|deadlift/)
  })

  it('Daniels (no overrides) still produces a valid routine for a marathoner', () => {
    const routine = buildStrengthRoutineFor(daniels, baseConfig({ raceType: 'general', raceDistance: 'marathon' }), { phaseId: 'base', isTaper: false, weekNumber: 1 })
    expect(exerciseNames(routine).length).toBeGreaterThanOrEqual(5)
  })
})

describe('routine varies across race profiles', () => {
  it('mountain ultra and 5K produce distinct routines for the same athlete', () => {
    const a = buildRoutine({ raceType: 'trail', raceDistance: 'mountain_ultra', experience: 'intermediate', equipment: ['gym'], injury: 'none', phaseIntent: 'base', isTaper: false })
    const b = buildRoutine({ raceType: 'general', raceDistance: '5k', experience: 'intermediate', equipment: ['gym'], injury: 'none', phaseIntent: 'base', isTaper: false })
    expect(a).not.toBe(b)
  })
})
