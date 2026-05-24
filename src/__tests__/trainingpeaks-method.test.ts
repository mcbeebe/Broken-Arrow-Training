/**
 * The TrainingPeaks (Joe Friel / PMC) method is the default philosophy for
 * the seed athletes. It's derived from the koop structural template, so it
 * must clear the same schema + content-integrity bar as the Phase 1 methods.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

import schema from '../schema/training-method.schema.json'
import trainingPeaks from '../data/methods/trainingpeaks.json'
import { getMethodById } from '../data/methods'
import type { TrainingMethod, WorkoutCategory } from '../types/training-method'

const NON_RUNNING: ReadonlySet<WorkoutCategory> = new Set(['rest', 'cross_training', 'strength'])
const method = trainingPeaks as unknown as TrainingMethod

describe('TrainingPeaks method — schema + integrity', () => {
  let validate: ValidateFunction
  beforeAll(() => {
    const ajv = new Ajv2020({ strict: false, allErrors: true })
    addFormats(ajv)
    validate = ajv.compile(schema)
  })

  it('validates against the TrainingMethod schema', () => {
    const ok = validate(trainingPeaks)
    if (!ok) console.error('Schema errors:', validate.errors)
    expect(ok).toBe(true)
  })

  it('is registered and resolvable by id', () => {
    expect(method.id).toBe('trainingpeaks')
    expect(getMethodById('trainingpeaks')?.name).toContain('TrainingPeaks')
  })

  it('every workout primaryZone + segment paceZone references a declared zone', () => {
    const declared = new Set(method.paceZones.map(z => z.canonical))
    for (const w of method.workouts) {
      expect(declared.has(w.primaryZone)).toBe(true)
      const segs = [
        ...(w.structure.warmup ? [w.structure.warmup] : []),
        ...w.structure.mainSet,
        ...(w.structure.cooldown ? [w.structure.cooldown] : []),
      ]
      for (const seg of segs) if (seg.paceZone) expect(declared.has(seg.paceZone)).toBe(true)
    }
  })

  it('every workout validPhaseIds + phase keyWorkoutIds resolve', () => {
    const phaseIds = new Set(method.phases.map(p => p.id))
    const workoutIds = new Set(method.workouts.map(w => w.id))
    for (const w of method.workouts) for (const pid of w.validPhaseIds) expect(phaseIds.has(pid)).toBe(true)
    for (const p of method.phases) for (const wid of p.keyWorkoutIds) expect(workoutIds.has(wid)).toBe(true)
  })

  it('weekly-pattern + race-week workout refs resolve, phaseIds resolve', () => {
    const phaseIds = new Set(method.phases.map(p => p.id))
    const workoutIds = new Set(method.workouts.map(w => w.id))
    for (const wp of method.weeklyPatterns) {
      expect(phaseIds.has(wp.phaseId)).toBe(true)
      for (const d of wp.schedule) for (const wid of d.preferredWorkoutIds ?? []) expect(workoutIds.has(wid)).toBe(true)
    }
    for (const d of method.taper.raceWeekSchedule) {
      for (const wid of d.preferredWorkoutIds ?? []) expect(workoutIds.has(wid)).toBe(true)
    }
  })

  it('phase math: pctOfPlan ~1.0, intensity sums 100, orders sequential', () => {
    const total = method.phases.reduce((s, p) => s + p.pctOfPlan.default, 0)
    expect(total).toBeGreaterThanOrEqual(0.95)
    expect(total).toBeLessThanOrEqual(1.05)
    for (const p of method.phases) {
      const s = p.intensityDistribution.easyPct + p.intensityDistribution.moderatePct + p.intensityDistribution.hardPct
      expect(s).toBe(100)
    }
    const orders = method.phases.map(p => p.order).sort((a, b) => a - b)
    expect(orders).toEqual(orders.map((_, i) => i + 1))
  })

  it('weekly running-day count matches daysPerWeek; taper volume decreases', () => {
    for (const wp of method.weeklyPatterns) {
      const r = wp.schedule.filter(d => !NON_RUNNING.has(d.category)).length
      expect(r).toBe(wp.daysPerWeek)
    }
    const pcts = method.taper.weeklyVolumePcts
    for (let i = 1; i < pcts.length; i++) expect(pcts[i]).toBeLessThan(pcts[i - 1])
    expect(pcts.length).toBe(method.taper.durationWeeks)
  })

  it('generationRules priorities ref declared phases; all restrictions non-blocking', () => {
    const phaseIds = new Set(method.phases.map(p => p.id))
    for (const pid of method.generationRules.compressionPriority) expect(phaseIds.has(pid)).toBe(true)
    for (const pid of method.generationRules.expansionPriority) expect(phaseIds.has(pid)).toBe(true)
    for (const r of method.restrictions) {
      expect(r.rule.length).toBeGreaterThan(0)
      expect(r.blocking).toBe(false)
    }
  })

  it('applicability has at least one BEST', () => {
    const ratings = [
      ...Object.values(method.applicability.byDistance),
      ...Object.values(method.applicability.byExperience),
      ...Object.values(method.applicability.byTerrain),
    ]
    expect(ratings).toContain('BEST')
  })
})
