/**
 * P1 improvements — peak-volume sanity cap, the Road race type / terrain,
 * Hyrox midlife (bone) finisher, and the unified Tanaka maxHR.
 */
import { describe, it, expect } from 'vitest'
import { allocatePhaseWeeks, buildWeeklyMileage } from '../../engines/planGenerator/weekPlan'
import { inferTerrain, inputsFromOnboarding } from '../../engines/planGenerator/methodSelection'
import { generatePlanFromMethod } from '../../engines/planGenerator/generatePlan'
import { generateHyroxPlan } from '../../utils/planGenerator'
import { generateGeneralFitnessPlan } from '../../engines/generalFitness'
import { computeMaxHR, MAX_HR_FLOOR } from '../../utils/heartRate'
import type { TrainingMethod } from '../../types/training-method'
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import danielsMethod from '../../data/methods/daniels.json'

const daniels = danielsMethod as unknown as TrainingMethod
const TODAY = '2026-06-14'

function cfg(o: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'road', raceName: 'X', raceDate: '2026-10-18', raceDistance: 'marathon',
    experienceLevel: 'intermediate', trainingDaysPerWeek: 5, wearable: 'none',
    athleteName: 'T', age: 35, completedAt: '', ...o,
  }
}

describe('P1-5: peak volume is capped', () => {
  it('a very high base no longer scales into an impossible marathon peak', () => {
    const weeks = buildWeeklyMileage(daniels, 18, allocatePhaseWeeks(daniels, 18), 90, {}, { raceDistance: 'marathon' })
    const peak = Math.max(...weeks.map(w => w.totalMi))
    expect(peak).toBeLessThanOrEqual(140)      // marathon cap, not 90 × 2.3 = 207
    expect(peak).toBeGreaterThan(120)          // still builds toward the ceiling
  })
  it('a normal base is unaffected by the cap', () => {
    const weeks = buildWeeklyMileage(daniels, 18, allocatePhaseWeeks(daniels, 18), 30, {}, { raceDistance: 'marathon' })
    const peak = Math.max(...weeks.map(w => w.totalMi))
    expect(peak).toBeLessThanOrEqual(30 * 2.3 + 0.1) // multiplier-driven, below the cap
  })
})

describe('P1-4: Road race type → road terrain', () => {
  it('road races infer road terrain (not trail_rolling) at every distance', () => {
    expect(inferTerrain('road', 'marathon')).toBe('road')
    expect(inferTerrain('road', '10k')).toBe('road')
    expect(inferTerrain('trail', 'marathon')).toBe('trail_rolling') // trail unchanged
  })
  it('a road marathon scores road-specialist methods on the road axis', () => {
    const inputs = inputsFromOnboarding(cfg({ raceType: 'road', raceDistance: 'marathon' }))
    expect(inputs?.terrain).toBe('road')
  })
})

describe('P1-6: Hyrox gains a midlife bone finisher', () => {
  it('a perimenopausal athlete gets a bone-loading finisher on a strength day', () => {
    const plan = generateHyroxPlan(cfg({
      raceType: 'hyrox', raceDistance: undefined, age: 50, sex: 'female',
      menopauseStatus: 'perimenopause', equipmentAccess: ['gym'], trainingDaysPerWeek: 4,
    }))
    const boned = plan.weeks.flatMap(w => w.days).some(d => /\+ bone/.test(d.workout) && /Farmer Carry|Squat Jump/.test(d.detail))
    expect(boned).toBe(true)
  })
  it('a male athlete gets no bone finisher (unchanged)', () => {
    const plan = generateHyroxPlan(cfg({ raceType: 'hyrox', raceDistance: undefined, age: 50, sex: 'male', trainingDaysPerWeek: 4 }))
    expect(plan.weeks.flatMap(w => w.days).some(d => /\+ bone/.test(d.workout))).toBe(false)
  })
})

describe('P1-7: unified Tanaka maxHR', () => {
  it('computeMaxHR uses Tanaka (208 − 0.7·age), prefers measured, and floors', () => {
    expect(computeMaxHR({ age: 30 })).toBe(187)
    expect(computeMaxHR({ age: 40 })).toBe(180)
    expect(computeMaxHR({ age: 68 })).toBe(160)          // masters: higher than 220−68=152
    expect(computeMaxHR({ maxHR: 195, age: 30 })).toBe(195) // measured wins
    expect(computeMaxHR({ age: 130 })).toBe(MAX_HR_FLOOR)   // absurd age → floor
  })
  it('all three engines agree on maxHR for the same athlete', () => {
    const base = { age: 52, maxHR: undefined }
    const expected = computeMaxHR(base) // 208 − 36.4 = 172 (rounded)
    const method = generatePlanFromMethod(daniels, cfg({ ...base, raceType: 'road' }), TODAY)
    const hyrox = generateHyroxPlan(cfg({ ...base, raceType: 'hyrox', raceDistance: undefined }))
    const gf = generateGeneralFitnessPlan(cfg({ ...base, raceType: 'general', raceDistance: undefined, generalGoal: 'stay_healthy' }), TODAY)
    expect(method.athlete.maxHR).toBe(expected)
    expect(hyrox.athlete.maxHR).toBe(expected)
    expect(gf.athlete.maxHR).toBe(expected)
  })
})
