/**
 * Tests for the method-selection engine (Q2).
 *
 * Verifies the weighted scoring + top-3 picks against the real 8-method
 * library for representative user profiles, plus the helper mappings.
 */
import { describe, it, expect } from 'vitest'
import {
  selectMethods,
  scoreMethods,
  mapExperience,
  inferTerrain,
  inputsFromOnboarding,
} from '../../../engines/planGenerator/methodSelection'
import type { TrainingMethod } from '../../../types/training-method'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'

import danielsMethod from '../../../data/methods/daniels.json'
import pfitzingerMethod from '../../../data/methods/pfitzinger.json'
import hansonsMethod from '../../../data/methods/hansons.json'
import higdonMethod from '../../../data/methods/higdon.json'
import gallowayMethod from '../../../data/methods/galloway.json'
import fitzgeraldMethod from '../../../data/methods/fitzgerald_8020.json'
import koopMethod from '../../../data/methods/koop.json'
import rocheMethod from '../../../data/methods/roche_swap.json'

const ALL_METHODS = [
  danielsMethod,
  pfitzingerMethod,
  hansonsMethod,
  higdonMethod,
  gallowayMethod,
  fitzgeraldMethod,
  koopMethod,
  rocheMethod,
] as unknown as TrainingMethod[]

describe('mapExperience', () => {
  it('collapses first_timer to beginner', () => {
    expect(mapExperience('first_timer')).toBe('beginner')
  })
  it('passes through other levels', () => {
    expect(mapExperience('intermediate')).toBe('intermediate')
    expect(mapExperience('advanced')).toBe('advanced')
    expect(mapExperience('elite')).toBe('elite')
  })
})

describe('inferTerrain', () => {
  it('uses mountain_vertical only for mountain_ultra', () => {
    expect(inferTerrain('trail', 'mountain_ultra')).toBe('mountain_vertical')
  })
  it('uses trail_rolling for other trail distances', () => {
    expect(inferTerrain('trail', '50k')).toBe('trail_rolling')
    expect(inferTerrain('trail', 'marathon')).toBe('trail_rolling')
  })
  it('falls back to road for hyrox / general', () => {
    expect(inferTerrain('hyrox', undefined)).toBe('road')
    expect(inferTerrain('general', undefined)).toBe('road')
  })
})

describe('inputsFromOnboarding', () => {
  const base: OnboardingConfig = {
    raceType: 'trail',
    raceName: 'X',
    raceDate: '2026-09-01',
    raceDistance: '50k',
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5,
    wearable: 'none',
    athleteName: 'A',
    age: 40,
    completedAt: '',
  }

  it('returns null when raceDistance is missing', () => {
    expect(inputsFromOnboarding({ ...base, raceDistance: undefined })).toBeNull()
  })

  it('produces typed inputs from a complete config', () => {
    expect(inputsFromOnboarding(base)).toEqual({
      raceDistance: '50k',
      experience: 'intermediate',
      terrain: 'trail_rolling',
    })
  })
})

describe('selectMethods — typical profiles', () => {
  it('advanced marathoner on road → four methods tie at max; alphabetical tiebreak picks daniels/fitzgerald/hansons', () => {
    const picks = selectMethods(ALL_METHODS, {
      raceDistance: 'marathon',
      experience: 'advanced',
      terrain: 'road',
    })
    expect(picks).toHaveLength(3)
    // daniels, fitzgerald_8020, hansons, pfitzinger all = BEST/BEST/BEST → score 24.
    // Tiebreak is alphabetical by id, so pfitzinger ('p') drops off behind hansons ('h').
    expect(picks.map(p => p.methodId)).toEqual(['daniels', 'fitzgerald_8020', 'hansons'])
    expect(picks.every(p => p.score === 24)).toBe(true)
  })

  it('beginner half-marathon road runner → higdon and galloway dominate, daniels is excluded', () => {
    const picks = selectMethods(ALL_METHODS, {
      raceDistance: 'half_marathon',
      experience: 'beginner',
      terrain: 'road',
    })
    const ids = picks.map(p => p.methodId)
    expect(ids).toContain('higdon')
    expect(ids).toContain('galloway')
    // Daniels is NOT_SUITED for beginners and only GOOD on half-marathon → should not be top
    expect(picks[0].methodId).not.toBe('daniels')
  })

  it('advanced 100-mile mountain ultra → koop and roche dominate', () => {
    const picks = selectMethods(ALL_METHODS, {
      raceDistance: 'mountain_ultra',
      experience: 'advanced',
      terrain: 'mountain_vertical',
    })
    expect(picks[0].methodId === 'koop' || picks[0].methodId === 'roche_swap').toBe(true)
    expect(picks[1].methodId === 'koop' || picks[1].methodId === 'roche_swap').toBe(true)
    // Daniels has NOT_SUITED on mountain_ultra → must be excluded from top 3
    expect(picks.map(p => p.methodId)).not.toContain('daniels')
  })

  it('top-3 ordering is deterministic on score ties (alphabetical by id)', () => {
    // A profile where multiple methods tie — verify stable, repeatable output
    const a = selectMethods(ALL_METHODS, { raceDistance: 'marathon', experience: 'advanced', terrain: 'road' })
    const b = selectMethods(ALL_METHODS, { raceDistance: 'marathon', experience: 'advanced', terrain: 'road' })
    expect(a.map(x => x.methodId)).toEqual(b.map(x => x.methodId))
  })

  it('always returns exactly 3 methods when 3+ viable exist', () => {
    const picks = selectMethods(ALL_METHODS, { raceDistance: '10k', experience: 'intermediate', terrain: 'road' })
    expect(picks).toHaveLength(3)
  })
})

describe('scoreMethods — axis-level scoring', () => {
  it('uses BEST=4, GOOD=3, OK=2, CAUTION=1, NOT_SUITED=0', () => {
    const scored = scoreMethods(ALL_METHODS, {
      raceDistance: 'marathon',
      experience: 'advanced',
      terrain: 'road',
    })
    const daniels = scored.find(s => s.methodId === 'daniels')!
    // daniels: marathon=BEST(4)*3 + advanced=BEST(4)*2 + road=BEST(4)*1 = 24
    expect(daniels.score).toBe(24)
    expect(daniels.axes.distance.rating).toBe('BEST')
    expect(daniels.axes.experience.rating).toBe('BEST')
    expect(daniels.axes.terrain.rating).toBe('BEST')
  })

  it('NOT_SUITED contributes 0 points but does not crash', () => {
    const scored = scoreMethods(ALL_METHODS, {
      raceDistance: '100_mile',
      experience: 'advanced',
      terrain: 'mountain_vertical',
    })
    const daniels = scored.find(s => s.methodId === 'daniels')!
    expect(daniels.axes.distance.rating).toBe('NOT_SUITED')
    expect(daniels.axes.distance.points).toBe(0)
  })

  it('produces non-empty rationale lines for every method', () => {
    const scored = scoreMethods(ALL_METHODS, {
      raceDistance: 'marathon',
      experience: 'intermediate',
      terrain: 'road',
    })
    for (const s of scored) {
      expect(s.rationale.length).toBeGreaterThan(0)
      // First line is always the method signature
      expect(s.rationale[0]).toBe(s.method.signature)
    }
  })

  it('rationale includes a "Heads-up" line when a CAUTION/NOT_SUITED axis applies', () => {
    const scored = scoreMethods(ALL_METHODS, {
      raceDistance: '50k',
      experience: 'recreational',
      terrain: 'trail_rolling',
    })
    const daniels = scored.find(s => s.methodId === 'daniels')!
    // daniels: 50k=CAUTION
    expect(daniels.rationale.some(line => line.startsWith('Heads-up'))).toBe(true)
  })

  it('warnings pull from matching restriction types on weak axes', () => {
    const scored = scoreMethods(ALL_METHODS, {
      raceDistance: '100_mile',
      experience: 'intermediate',
      terrain: 'trail_rolling',
    })
    const daniels = scored.find(s => s.methodId === 'daniels')!
    // daniels has a `distance` restriction with warningMessage; user's 100_mile = NOT_SUITED
    expect(daniels.warnings.length).toBeGreaterThan(0)
    expect(daniels.warnings.some(w => /ultra/i.test(w))).toBe(true)
  })

  it('strong axes generate a "Why we picked it" line', () => {
    const scored = scoreMethods(ALL_METHODS, {
      raceDistance: 'marathon',
      experience: 'advanced',
      terrain: 'road',
    })
    const daniels = scored.find(s => s.methodId === 'daniels')!
    expect(daniels.rationale.some(line => line.startsWith('Why we picked it'))).toBe(true)
  })
})

describe('selectMethods — degenerate / edge cases', () => {
  it('returns top 3 even when all viable methods score the same', () => {
    // Synthetic: 4 trivial methods, all identical applicability
    const trivial = (id: string): TrainingMethod => ({
      ...(danielsMethod as unknown as TrainingMethod),
      id,
      restrictions: [],
    })
    const synth = ['a_method', 'b_method', 'c_method', 'd_method'].map(trivial)
    const picks = selectMethods(synth, {
      raceDistance: 'marathon',
      experience: 'advanced',
      terrain: 'road',
    })
    expect(picks).toHaveLength(3)
    // Alphabetical tiebreak → a, b, c (d drops off)
    expect(picks.map(p => p.methodId)).toEqual(['a_method', 'b_method', 'c_method'])
  })

  it('falls through to NOT_SUITED methods when fewer than 3 viable candidates exist', () => {
    // Pick a synthetic combo where most methods are excluded:
    // Build a method library of 2 viable + 4 NOT_SUITED on distance.
    const viable = (id: string): TrainingMethod => ({
      ...(danielsMethod as unknown as TrainingMethod),
      id,
      applicability: {
        ...(danielsMethod as unknown as TrainingMethod).applicability,
        byDistance: { marathon: 'GOOD' },
      },
    })
    const unviable = (id: string): TrainingMethod => ({
      ...(danielsMethod as unknown as TrainingMethod),
      id,
      applicability: {
        ...(danielsMethod as unknown as TrainingMethod).applicability,
        byDistance: { marathon: 'NOT_SUITED' },
      },
    })
    const synth = [viable('v1'), viable('v2'), unviable('u1'), unviable('u2'), unviable('u3')]
    const picks = selectMethods(synth, {
      raceDistance: 'marathon',
      experience: 'advanced',
      terrain: 'road',
    })
    expect(picks).toHaveLength(3)
    expect(picks.map(p => p.methodId)).toEqual(expect.arrayContaining(['v1', 'v2']))
  })
})
