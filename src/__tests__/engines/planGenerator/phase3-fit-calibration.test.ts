/**
 * Phase 3 — method-fit feedback & anchor freshness (PRD-106 + PRD-107).
 *
 * G5: silently repeated demotion meant an athlete bought Hansons and
 * received generic easy running — now the plan says so once and names a
 * lighter tool. G6: a nine-month-old race silently set every pace and
 * anchored athletes never revalidated — now anchors carry a date, stale
 * ones are called out, and the existing 20-min benchmark lands mid-plan.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { getMethodById, RECOMMENDABLE_METHODS } from '../../../data/methods'
import { suggestLighterMethod } from '../../../engines/planGenerator/methodSelection'
import { TODAY, PERSONAS, buildConfig, satAfterWeeks } from '../../helpers/roadPersonas'
import type { OnboardingConfig, RaceDistance } from '../../../hooks/useOnboarding'
import type { TrainingPlan } from '../../../types'

function cfg(over: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'road', raceName: 'X', raceDate: satAfterWeeks(14),
    raceDistance: 'half_marathon', raceDistanceMiles: 13.1, athleteName: 'T', age: 38,
    sex: 'female', experienceLevel: 'intermediate', trainingDaysPerWeek: 5,
    currentWeeklyMileage: 22, longRunDay: 'Saturday', wearable: 'garmin', completedAt: '',
    selectedMethodId: 'pfitzinger',
    ...over,
  } as unknown as OnboardingConfig
}
const gen = (c: OnboardingConfig) => generatePlanFromMethod(getMethodById(c.selectedMethodId!)!, c, TODAY)
const benchmarkWeeks = (p: TrainingPlan) =>
  p.weeks.filter(w => w.days.some(d => /BENCHMARK/i.test(d.workout))).map(w => w.num)

describe('Phase 3 — method-fit feedback (PRD-106)', () => {
  it('a low-volume athlete on a quality-dense method is told, with a lighter suggestion', () => {
    const ava = PERSONAS.find(x => x.label.startsWith('Ava'))!
    const plan = generatePlanFromMethod(getMethodById('daniels')!, buildConfig(ava, 16), TODAY)
    const adv = plan.advisories?.find(a => a.id === 'method_volume_mismatch')
    expect(adv).toBeTruthy()
    expect(adv!.suggestion).toMatch(/Switch to/)
    expect(adv!.suggestion).not.toMatch(/Daniels/)
  })

  it('an adequate-volume athlete never sees it (Dmitri on Hansons)', () => {
    const dmitri = PERSONAS.find(x => x.label.startsWith('Dmitri'))!
    const plan = generatePlanFromMethod(getMethodById('hansons')!, buildConfig(dmitri, dmitri.runways[1]), TODAY)
    expect(plan.advisories?.some(a => a.id === 'method_volume_mismatch') ?? false).toBe(false)
  })

  it('suggestLighterMethod is deterministic, never the incumbent, never NOT_SUITED', () => {
    for (const d of ['5k', '10k', 'half_marathon', 'marathon'] as RaceDistance[]) {
      for (const m of RECOMMENDABLE_METHODS) {
        const alt = suggestLighterMethod(d, 4, m.id)
        if (!alt) continue
        expect(alt.id).not.toBe(m.id)
        expect(alt.applicability?.byDistance?.[d]).not.toBe('NOT_SUITED')
        expect(suggestLighterMethod(d, 4, m.id)!.id).toBe(alt.id) // deterministic
      }
    }
  })
})

describe('Phase 3 — anchor freshness (PRD-107)', () => {
  const anchored = (dateIso?: string) =>
    cfg({ fitnessAnchor: { type: 'race_10k', valueSeconds: 50 * 60, ...(dateIso ? { dateIso } : {}) } })

  it('fresh anchor (10 wk): no advisory, no mid-plan benchmark', () => {
    const plan = gen(anchored('2026-06-08')) // ~10 weeks before TODAY
    expect(plan.advisories?.some(a => a.id === 'anchor_stale') ?? false).toBe(false)
    expect(benchmarkWeeks(plan)).toEqual([])
  })

  it('16-wk-old anchor: info advisory + exactly one mid-plan benchmark at the phase boundary', () => {
    const plan = gen(anchored('2026-04-27'))
    const adv = plan.advisories?.find(a => a.id === 'anchor_stale')
    expect(adv?.severity).toBe('info')
    const bw = benchmarkWeeks(plan)
    expect(bw.length).toBe(1)
    expect(bw[0]).toBeGreaterThan(1) // mid-plan, not week 1
  })

  it('30-wk-old anchor escalates to caution', () => {
    const plan = gen(anchored('2026-01-20'))
    expect(plan.advisories?.find(a => a.id === 'anchor_stale')?.severity).toBe('caution')
  })

  it('date unknown (every legacy config): no stale claim, but the benchmark still lands', () => {
    const plan = gen(anchored(undefined))
    expect(plan.advisories?.some(a => a.id === 'anchor_stale') ?? false).toBe(false)
    expect(benchmarkWeeks(plan).length).toBe(1)
  })

  it('easy-pace anchors are self-reports: the existing week-1/2 calibration benchmark, no mid-plan one', () => {
    const plan = gen(cfg({ fitnessAnchor: { type: 'easy_pace', valueSeconds: 570 } }))
    const bw = benchmarkWeeks(plan)
    expect(bw.length).toBe(1)
    expect(bw[0]).toBeLessThanOrEqual(2) // P4.1's early calibration, not the stale-anchor mid-plan test
  })

  it('unanchored athletes keep the existing week-1/2 calibration benchmark (107-F4)', () => {
    const plan = gen(cfg({ fitnessAnchor: undefined }))
    const bw = benchmarkWeeks(plan)
    expect(bw.length).toBe(1)
    expect(bw[0]).toBeLessThanOrEqual(2)
  })

  it('plans with the mid-plan benchmark still pass the QA gate', () => {
    const plan = gen(anchored('2026-04-27'))
    expect((plan.advisories ?? []).filter(a => a.severity === 'critical')).toEqual([])
  })
})
