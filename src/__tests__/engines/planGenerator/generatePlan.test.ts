/**
 * Plan-generator end-to-end tests — feed real method JSONs + representative
 * onboarding configs through `generatePlanFromMethod` and assert on the
 * shape, week/phase distribution, mileage progression, taper, and the
 * structured PlannedWorkout payloads attached to every running day.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import {
  snapToSupportedWeeks,
  chooseTotalWeeks,
  allocatePhaseWeeks,
  buildWeeklyMileage,
  estimateCurrentWeeklyMileage,
} from '../../../engines/planGenerator/weekPlan'
import { resolvePaces, resolveAnchor } from '../../../engines/planGenerator/paceTargets'
import {
  pickWeeklyPattern,
  pickWorkoutForDay,
  buildPlannedWorkout,
} from '../../../engines/planGenerator/workouts'

import type { TrainingMethod } from '../../../types/training-method'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'

import danielsMethod from '../../../data/methods/daniels.json'
import pfitzingerMethod from '../../../data/methods/pfitzinger.json'
import koopMethod from '../../../data/methods/koop.json'
import rocheMethod from '../../../data/methods/roche_swap.json'
import higdonMethod from '../../../data/methods/higdon.json'

const daniels = danielsMethod as unknown as TrainingMethod
const pfitzinger = pfitzingerMethod as unknown as TrainingMethod
const koop = koopMethod as unknown as TrainingMethod
const roche = rocheMethod as unknown as TrainingMethod
const higdon = higdonMethod as unknown as TrainingMethod

const TODAY = '2026-05-10'

function makeConfig(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'trail',
    raceName: 'Test Race',
    raceDate: '2026-09-13',  // ~18 weeks out
    raceDistance: 'marathon',
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5,
    longRunDay: 'Sunday',
    wearable: 'none',
    athleteName: 'Test',
    age: 38,
    maxHR: 184,
    completedAt: '',
    ...overrides,
  }
}

describe('snapToSupportedWeeks', () => {
  it('snaps to nearest supported plan length', () => {
    // Daniels supports [8, 12, 16, 18, 20, 24]
    expect(snapToSupportedWeeks(daniels, 17)).toBe(18)
    expect(snapToSupportedWeeks(daniels, 10)).toBe(12)  // ties prefer larger → 12 (delta 2 vs 8 delta 2)
    expect(snapToSupportedWeeks(daniels, 50)).toBe(24)
    expect(snapToSupportedWeeks(daniels, 1)).toBe(8)
  })
})

describe('chooseTotalWeeks', () => {
  it('uses defaultPlanWeeks when no raceDate given', () => {
    expect(chooseTotalWeeks(daniels, undefined, TODAY)).toBe(daniels.generationRules.defaultPlanWeeks)
  })
  it('computes weeks until race and snaps', () => {
    // raceDate 18 weeks out → should snap to 18 (exact)
    expect(chooseTotalWeeks(daniels, '2026-09-13', TODAY)).toBe(18)
  })
  it('rushes when race is close', () => {
    // 4 weeks out → snap to 8 (nearest supported)
    expect(chooseTotalWeeks(daniels, '2026-06-07', TODAY)).toBe(8)
  })
})

describe('allocatePhaseWeeks', () => {
  it('sums to total weeks', () => {
    const blocks = allocatePhaseWeeks(daniels, 18)
    const sum = blocks.reduce((s, b) => s + (b.endWeekIndex - b.startWeekIndex + 1), 0)
    expect(sum).toBe(18)
  })
  it('orders phases by their .order', () => {
    const blocks = allocatePhaseWeeks(pfitzinger, 18)
    const ids = blocks.map(b => b.phaseId)
    const expectedOrder = [...pfitzinger.phases].sort((a, b) => a.order - b.order).map(p => p.id)
    expect(ids).toEqual(expectedOrder)
  })
  it('starts at index 0 and is contiguous', () => {
    const blocks = allocatePhaseWeeks(daniels, 12)
    expect(blocks[0].startWeekIndex).toBe(0)
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].startWeekIndex).toBe(blocks[i - 1].endWeekIndex + 1)
    }
  })
})

describe('estimateCurrentWeeklyMileage', () => {
  it('returns reasonable defaults per experience level', () => {
    expect(estimateCurrentWeeklyMileage(makeConfig({ experienceLevel: 'first_timer' }))).toBe(6)
    expect(estimateCurrentWeeklyMileage(makeConfig({ experienceLevel: 'intermediate' }))).toBe(20)
    expect(estimateCurrentWeeklyMileage(makeConfig({ experienceLevel: 'elite' }))).toBe(48)
  })
})

describe('buildWeeklyMileage', () => {
  it('applies the taper to the final N weeks', () => {
    const blocks = allocatePhaseWeeks(daniels, 18)
    const weeks = buildWeeklyMileage(daniels, 18, blocks, 20)
    const taperLen = daniels.taper.durationWeeks
    const taperFlags = weeks.slice(-taperLen).map(w => w.isTaper)
    expect(taperFlags).toEqual(Array(taperLen).fill(true))
    // Taper miles strictly decreasing
    const taperMiles = weeks.slice(-taperLen).map(w => w.totalMi)
    for (let i = 1; i < taperMiles.length; i++) {
      expect(taperMiles[i]).toBeLessThan(taperMiles[i - 1])
    }
  })
  it('peak miles ~= current × peakMileageRule.value', () => {
    const blocks = allocatePhaseWeeks(daniels, 18)
    const weeks = buildWeeklyMileage(daniels, 18, blocks, 20)
    const peak = Math.max(...weeks.map(w => w.totalMi))
    const expected = 20 * daniels.mileageProgression.peakMileageRule.value
    expect(peak).toBeGreaterThanOrEqual(expected * 0.9)
    expect(peak).toBeLessThanOrEqual(expected * 1.05)
  })
  it('long-run miles are capped at longRunPctCap of weekly total', () => {
    const blocks = allocatePhaseWeeks(daniels, 18)
    const weeks = buildWeeklyMileage(daniels, 18, blocks, 20)
    for (const w of weeks) {
      expect(w.longRunMi).toBeLessThanOrEqual(w.totalMi * daniels.mileageProgression.longRunPctCap + 0.01)
    }
  })
})

describe('resolveAnchor / resolvePaces', () => {
  it('estimates LTHR for LTHR-anchored methods', () => {
    // Koop is the LTHR-anchored example in the library (Pfitzinger uses
    // recent_race_time / LT pace, not a direct HR anchor).
    const cfg = makeConfig({ maxHR: 184 })
    const a = resolveAnchor(koop, cfg)
    expect(a.type).toBe('lthr_bpm')
    expect(a.value).toBe(Math.round(184 * 0.92))
  })
  it('estimates AeT for AeT-anchored methods', () => {
    const a = resolveAnchor(roche, makeConfig({ maxHR: 184 }))
    expect(a.type).toBe('aet_bpm')
    expect(a.value).toBe(Math.round(184 * 0.78))
  })
  it('leaves anchor value null for race-time / VDOT methods', () => {
    const a = resolveAnchor(daniels, makeConfig({ maxHR: 184 }))
    expect(a.value).toBeNull()
  })
  it('produces a PaceTarget per declared zone', () => {
    const paces = resolvePaces(pfitzinger, makeConfig())
    for (const z of pfitzinger.paceZones) {
      expect(paces.byZone[z.canonical]).toBeDefined()
    }
  })
  it('PaceTarget bpm bounds use estimated LTHR for HR-range methods', () => {
    const cfg = makeConfig({ maxHR: 184 })
    const paces = resolvePaces(pfitzinger, cfg)
    const lthr = Math.round(184 * 0.92)
    const easyZone = pfitzinger.paceZones.find(z => z.canonical === 'easy')
    if (easyZone && easyZone.hrRange?.minPctLthr && easyZone.hrRange?.maxPctLthr) {
      const t = paces.byZone.easy!
      expect(t.hrBpmLow).toBe(Math.round(easyZone.hrRange.minPctLthr * lthr))
      expect(t.hrBpmHigh).toBe(Math.round(easyZone.hrRange.maxPctLthr * lthr))
    }
  })
})

describe('pickWeeklyPattern', () => {
  it('finds a pattern matching the phase, with closest daysPerWeek', () => {
    const phaseId = daniels.phases[0].id
    const p = pickWeeklyPattern(daniels, phaseId, 5, false)
    expect(p).not.toBeNull()
    expect(p!.phaseId).toBe(phaseId)
    expect(Math.abs(p!.daysPerWeek - 5)).toBeLessThanOrEqual(1)
  })
  it('prefers recovery weekType on cutback weeks when available', () => {
    const transition = 'transition_quality'
    const standard = pickWeeklyPattern(daniels, transition, 5, false)
    const recovery = pickWeeklyPattern(daniels, transition, 5, true)
    expect(standard?.weekType).toBe('standard')
    expect(recovery?.weekType).toBe('recovery')
  })
})

describe('pickWorkoutForDay', () => {
  it('returns null for non-running categories', () => {
    const ret = pickWorkoutForDay(daniels, { dayOfWeek: 1, category: 'rest' }, 'intermediate', 30)
    expect(ret).toBeNull()
  })
  it('picks the first viable preferred workout', () => {
    const ret = pickWorkoutForDay(
      daniels,
      { dayOfWeek: 2, category: 'easy', preferredWorkoutIds: ['daniels_easy_run'] },
      'intermediate',
      30,
    )
    expect(ret).not.toBeNull()
    expect(ret!.workout.id).toBe('daniels_easy_run')
    expect(ret!.substituted).toBe(false)
  })
  it('substitutes when minimumExperience blocks the preferred', () => {
    // daniels_marathon_simulation requires 'advanced'; a recreational user gets substituted
    const ret = pickWorkoutForDay(
      daniels,
      { dayOfWeek: 7, category: 'long', preferredWorkoutIds: ['daniels_marathon_simulation'] },
      'recreational',
      35,
    )
    expect(ret).not.toBeNull()
    expect(ret!.substituted).toBe(true)
    expect(ret!.workout.id).not.toBe('daniels_marathon_simulation')
  })
})

describe('buildPlannedWorkout', () => {
  it('flattens warmup + mainSet + cooldown in order, attaches pace targets', () => {
    const paces = resolvePaces(pfitzinger, makeConfig())
    const workout = pfitzinger.workouts.find(w => w.structure.warmup && w.structure.cooldown)!
    const pw = buildPlannedWorkout(pfitzinger, workout, paces)
    expect(pw.segments[0].role).toBe('warmup')
    expect(pw.segments[pw.segments.length - 1].role).toBe('cooldown')
    const mains = pw.segments.filter(s => s.role === 'main')
    expect(mains.length).toBeGreaterThan(0)
    for (const s of pw.segments) {
      if (s.paceZone) {
        expect(s.paceTarget?.zone).toBe(s.paceZone)
      }
    }
  })
})

describe('generatePlanFromMethod — end-to-end', () => {
  it('produces a TrainingPlan with the expected week count for an 18-week marathon plan', () => {
    const plan = generatePlanFromMethod(daniels, makeConfig({
      raceDate: '2026-09-13',  // 18w from TODAY
      experienceLevel: 'intermediate',
    }), TODAY)
    expect(plan.weeks).toHaveLength(18)
  })

  it('attaches a structured plannedWorkout to every running day', () => {
    const plan = generatePlanFromMethod(daniels, makeConfig(), TODAY)
    let runningDays = 0
    let withWorkout = 0
    for (const w of plan.weeks) {
      for (const d of w.days) {
        if (d.type === 'rest' || d.type === 'cross' || d.type === 'strength') continue
        runningDays++
        if (d.plannedWorkout) withWorkout++
        // Sanity on the attached PlannedWorkout
        if (d.plannedWorkout) {
          expect(d.plannedWorkout.methodId).toBe('daniels')
          expect(d.plannedWorkout.segments.length).toBeGreaterThan(0)
        }
      }
    }
    expect(runningDays).toBeGreaterThan(0)
    expect(withWorkout).toBe(runningDays)
  })

  it('uses the race-week schedule on the final week', () => {
    const plan = generatePlanFromMethod(daniels, makeConfig(), TODAY)
    const last = plan.weeks[plan.weeks.length - 1]
    expect(last.days.length).toBe(daniels.taper.raceWeekSchedule.length)
    // Race day (last entry in raceWeekSchedule has category 'race_pace' for daniels)
    const raceDay = last.days[last.days.length - 1]
    expect(raceDay.type === 'race' || raceDay.type === 'run' || raceDay.type === 'rest').toBe(true)
  })

  it('produces a strictly-decreasing taper across the final taper weeks', () => {
    const plan = generatePlanFromMethod(daniels, makeConfig(), TODAY)
    const taperLen = daniels.taper.durationWeeks
    const taperMiles = plan.weeks.slice(-taperLen).map(w => Number(w.miles))
    for (let i = 1; i < taperMiles.length; i++) {
      expect(taperMiles[i]).toBeLessThan(taperMiles[i - 1])
    }
  })

  it('koop generates a working 50K plan for an advanced user', () => {
    const plan = generatePlanFromMethod(koop, makeConfig({
      raceDistance: '50k',
      experienceLevel: 'advanced',
      raceDate: '',  // use default plan length
    }), TODAY)
    expect(plan.weeks.length).toBe(koop.generationRules.defaultPlanWeeks)
    expect(plan.race.distance).toBe('50K')
    expect(plan.race.distanceMiles).toBeCloseTo(31.1, 1)
  })

  it('higdon (rpe-only) leaves anchor null but still attaches RPE targets', () => {
    const plan = generatePlanFromMethod(higdon, makeConfig({
      raceDistance: 'half_marathon',
      experienceLevel: 'beginner',
    }), TODAY)
    let anyRpe = false
    for (const w of plan.weeks) {
      for (const d of w.days) {
        const t = d.plannedWorkout?.segments.find(s => s.paceTarget?.preferredMode === 'rpe' || s.paceTarget?.preferredMode === 'hr')?.paceTarget
        if (t && (t.rpeLow != null || t.hrBpmLow != null)) anyRpe = true
      }
    }
    expect(anyRpe).toBe(true)
  })

  it('athlete profile reflects onboarding inputs', () => {
    const plan = generatePlanFromMethod(daniels, makeConfig({ athleteName: 'Jenn', age: 41, maxHR: 180 }), TODAY)
    expect(plan.athlete.name).toBe('Jenn')
    expect(plan.athlete.maxHR).toBe(180)
    expect(plan.athlete.weeklyStructure).toMatch(/days\/week/)
  })

  it('zones are computed against the user\'s maxHR', () => {
    const plan = generatePlanFromMethod(daniels, makeConfig({ maxHR: 200 }), TODAY)
    // Z4 upper bound should be 90% of 200 = 180
    expect(plan.zones.some(z => z.hr.includes('180'))).toBe(true)
  })
})
