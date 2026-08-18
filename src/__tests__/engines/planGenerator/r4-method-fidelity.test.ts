/**
 * R4 — method fidelity & evidence calibration (docs/running-plan-audit.md).
 *
 * Two gates:
 *  1. Volume envelopes: a generated 5K/10K plan's peak must land inside
 *     the method's own published-program band (± the stated adaptation
 *     tolerance) when generated for the audience that program addresses.
 *     Catching category errors — a 5K plan peaking at half or double the
 *     published program — not enforcing table-exact mileage.
 *  2. Structural specificity: short-race plans are intensity-forward
 *     (reps/intervals/race-pace lead; the long run stays proportionate),
 *     via the distance-variant weekly patterns, and those variants never
 *     leak into other distances.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { getMethodById } from '../../../data/methods'
import { pickWeeklyPattern } from '../../../engines/planGenerator/workouts'
import {
  PUBLISHED_VOLUME_BENCHMARKS,
  volumeEnvelopeFor,
  type BenchmarkLevel,
} from '../../../engines/planGenerator/volumeEnvelopes'
import { validatePlan } from '../../../engines/planQA/validatePlan'
import type { OnboardingConfig, RaceDistance } from '../../../hooks/useOnboarding'
import type { TrainingPlan } from '../../../types'

const TODAY = '2026-08-17'
const LEVEL_DAYS: Record<BenchmarkLevel, number> = { beginner: 4, intermediate: 5, advanced: 6 }

function cfg(methodId: string, distance: RaceDistance, level: BenchmarkLevel, baseMi: number): OnboardingConfig {
  return {
    raceType: 'road', raceName: 'Envelope Check', raceDate: '2026-11-28',
    raceDistance: distance, raceDistanceMiles: distance === '5k' ? 3.1 : 6.2,
    athleteName: 'Bench', age: 34, sex: 'female', experienceLevel: level,
    trainingDaysPerWeek: LEVEL_DAYS[level], currentWeeklyMileage: baseMi,
    longRunDay: 'Saturday', wearable: 'garmin', completedAt: '',
    selectedMethodId: methodId,
  } as unknown as OnboardingConfig
}

const peakOf = (p: TrainingPlan) => Math.max(...p.weeks.map(w => w.targetMi ?? 0))
const categories = (p: TrainingPlan) =>
  p.weeks.flatMap(w => w.days).map(d => d.plannedWorkout?.category).filter(Boolean)

describe('R4 — generated peaks land inside the published-program envelope', () => {
  const cases: [string, string, RaceDistance, BenchmarkLevel][] = []
  for (const [methodId, byDistance] of Object.entries(PUBLISHED_VOLUME_BENCHMARKS)) {
    for (const [distance, byLevel] of Object.entries(byDistance ?? {})) {
      for (const level of Object.keys(byLevel ?? {}) as BenchmarkLevel[]) {
        cases.push([`${methodId} ${distance} ${level}`, methodId, distance as RaceDistance, level])
      }
    }
  }

  it.each(cases)('%s', (_label, methodId, distance, level) => {
    const env = volumeEnvelopeFor(methodId, distance, level)!
    const plan = generatePlanFromMethod(
      getMethodById(methodId)!,
      cfg(methodId, distance, level, env.benchmark.assumesBaseMi),
      TODAY,
    )
    const peak = peakOf(plan)
    expect(peak, `peak vs [${env.peakLoMi}, ${env.peakHiMi}] — ${env.benchmark.source}`).toBeGreaterThanOrEqual(env.peakLoMi)
    expect(peak, `peak vs [${env.peakLoMi}, ${env.peakHiMi}] — ${env.benchmark.source}`).toBeLessThanOrEqual(env.peakHiMi)
    // Envelope personas also pass the full QA gate with the method rulebook on.
    expect(validatePlan({ ...plan, methodId }).errors.map(e => `${e.id}@${e.weekNum}`)).toEqual([])
  })
})

describe('R4 — short-race plans are intensity-forward', () => {
  it('a Daniels 5K carries R-pace repetition days; a Daniels marathon does not', () => {
    const daniels = getMethodById('daniels')!
    const fiveK = generatePlanFromMethod(daniels, cfg('daniels', '5k', 'intermediate', 22), TODAY)
    expect(categories(fiveK)).toContain('speed_repetitions')
    const marathon = generatePlanFromMethod(daniels, {
      ...cfg('daniels', '5k', 'intermediate', 40),
      raceDistance: 'marathon', raceDistanceMiles: 26.2, raceDate: '2026-12-12',
    } as OnboardingConfig, TODAY)
    expect(categories(marathon)).not.toContain('speed_repetitions')
  })

  it('a Higdon advanced 5K sharpens with interval repeats and race-pace runs', () => {
    const plan = generatePlanFromMethod(getMethodById('higdon')!, cfg('higdon', '5k', 'advanced', 26), TODAY)
    const cats = categories(plan)
    expect(cats).toContain('vo2_intervals')
    expect(cats).toContain('race_pace')
  })

  it('a Higdon novice 5K keeps race-pace rhythm but never the advanced interval session', () => {
    const plan = generatePlanFromMethod(getMethodById('higdon')!, cfg('higdon', '5k', 'beginner', 9), TODAY)
    const cats = categories(plan)
    expect(cats).toContain('race_pace')
    expect(cats).not.toContain('vo2_intervals') // higdon_speedwork is advanced-gated
  })

  it('short-race quality is real work, not garnish (some week runs 2 quality days)', () => {
    const plan = generatePlanFromMethod(getMethodById('daniels')!, cfg('daniels', '5k', 'intermediate', 22), TODAY)
    const twoQualityWeeks = plan.weeks.filter(
      w => w.days.filter(d => d.type === 'quality' && !/BENCHMARK/i.test(d.workout)).length >= 2,
    )
    expect(twoQualityWeeks.length).toBeGreaterThan(0)
  })
})

describe('R4 — distance-variant pattern selection', () => {
  const daniels = getMethodById('daniels')!

  it('a 5K picks the authored 5K/10K variant for Phase II', () => {
    const p = pickWeeklyPattern(daniels, 'early_quality', 5, false, '5k')
    expect(p?.distances).toContain('5k')
    expect(p?.schedule.some(d => d.category === 'speed_repetitions')).toBe(true)
  })

  it('a marathon never sees the short-race variants', () => {
    const p = pickWeeklyPattern(daniels, 'early_quality', 5, false, 'marathon')
    expect(p?.distances ?? []).not.toContain('5k')
  })

  it('legacy callers without a distance keep distance-agnostic patterns', () => {
    const p = pickWeeklyPattern(daniels, 'transition_quality', 5, false)
    expect(p?.distances).toBeUndefined()
  })
})
