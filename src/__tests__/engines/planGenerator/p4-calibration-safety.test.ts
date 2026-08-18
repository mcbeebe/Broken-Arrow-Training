/**
 * P4 — athlete calibration & safety: benchmark scheduling for estimate-
 * grade zones, RPE-only zones freed of fake pace bands, injury-area
 * prehab + descent caution, and the joint time+vert load-spike guard.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { generateHyroxPlan } from '../../../utils/planGenerator'
import { validatePlan } from '../../../engines/planQA/validatePlan'
import { getMethodById } from '../../../data/methods'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'

const TODAY = '2026-08-16'
const roche = () => getMethodById('roche_swap')!

function mikeConfig(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'trail',
    raceName: 'Oakland Hills Trail Run',
    raceDate: '2026-10-24',
    raceDistance: 'half_marathon',
    raceDistanceMiles: 13.3,
    elevationGainFt: 2900,
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5,
    longRunDay: 'Sunday',
    wearable: 'garmin',
    athleteName: 'Mike',
    age: 45,
    maxHR: 200,
    fitnessAnchor: { type: 'easy_pace', valueSeconds: 9 * 60 + 30 },
    completedAt: '',
    ...overrides,
  }
}

const allDays = (p: ReturnType<typeof generatePlanFromMethod>) => p.weeks.flatMap(w => w.days)

describe('P4.1 — benchmark scheduling', () => {
  it('an easy-pace-anchored athlete gets a week-1/2 time trial, with structured segments', () => {
    const plan = generatePlanFromMethod(roche(), mikeConfig(), TODAY)
    const early = plan.weeks.slice(0, 2).flatMap(w => w.days)
    const test = early.find(d => /BENCHMARK/i.test(d.workout))
    expect(test, 'no benchmark scheduled').toBeDefined()
    expect(test!.plannedWorkout?.segments.map(s => s.role)).toEqual(['warmup', 'main', 'cooldown'])
    expect(plan.advisories?.some(a => a.id === 'zones_estimated' && a.severity === 'info')).toBe(true)
    expect(validatePlan(plan).findings.map(f => f.id)).not.toContain('qa_benchmark_missing')
  })

  it('a FRESH race-anchored athlete gets no benchmark and no estimate advisory', () => {
    // Phase 3 (PRD-107): anchor freshness matters — a dated, recent anchor
    // keeps the original no-benchmark contract; an undated one now gets a
    // mid-plan revalidation test (see phase3-fit-calibration.test.ts).
    const plan = generatePlanFromMethod(roche(), mikeConfig({
      fitnessAnchor: { type: 'race_10k', valueSeconds: 48 * 60, dateIso: '2026-07-20' },
    }), TODAY)
    expect(allDays(plan).some(d => /BENCHMARK/i.test(d.workout))).toBe(false)
    expect(plan.advisories?.some(a => a.id === 'zones_estimated')).toBeFalsy()
  })

  it('an injured athlete defers the test to an advisory instead of time-trialing in the lead-in', () => {
    const plan = generatePlanFromMethod(roche(), mikeConfig({ injuryStatus: 'returning', injuryArea: 'knee' }), TODAY)
    expect(allDays(plan).some(d => /BENCHMARK/i.test(d.workout))).toBe(false)
    const adv = plan.advisories?.find(a => a.id === 'zones_estimated')
    expect(adv?.severity).toBe('caution')
    expect(adv?.detail).toMatch(/time trial/i)
  })
})

describe('P4.2 — RPE-only zones carry no fake pace band', () => {
  it('hill strides (Roche vo2max, rpe_only) show no per-mile pace', () => {
    // v1 stamped "Fast (30-30 / VO2) · 6:50-7:12 /mi" on 10-second uphill
    // strides — a flat-ground pace on a hill sprint has no meaning.
    const plan = generatePlanFromMethod(roche(), mikeConfig({ elevationGainFt: undefined, raceDistanceMiles: undefined }), TODAY)
    const hills = allDays(plan).filter(d => /hill strides/i.test(d.workout))
    expect(hills.length).toBeGreaterThan(0)
    for (const d of hills) {
      expect(d.zone, `${d.day} "${d.workout}" zone reads "${d.zone}"`).not.toMatch(/\d+:\d{2}.*\/mi/)
    }
  })
})

describe('P4.3 — injury-area prehab + descent caution', () => {
  it('a knee history injects the knee prehab block across the plan (method generator)', () => {
    const plan = generatePlanFromMethod(roche(), mikeConfig({ injuryStatus: 'returning', injuryArea: 'knee' }), TODAY)
    const prehabDays = allDays(plan).filter(d => /PREHAB \(knee\)/.test(d.detail))
    expect(prehabDays.length).toBeGreaterThanOrEqual(Math.min(6, plan.weeks.length))
    expect(validatePlan({ ...plan, injuryArea: 'knee' }).findings.map(f => f.id)).not.toContain('qa_prehab_missing')
  })

  it('the Hyrox generator injects prehab on strength/cross days too', () => {
    const plan = generateHyroxPlan({
      ...mikeConfig({ injuryStatus: 'returning', injuryArea: 'achilles_calf' }),
      raceType: 'hyrox', raceName: 'Hyrox Anaheim', raceDate: '2026-12-05',
      equipmentAccess: ['gym'],
    } as OnboardingConfig, '2026-09-01')
    expect(plan.weeks.flatMap(w => w.days).some(d => /PREHAB \(achilles\/calf\)/.test(d.detail))).toBe(true)
  })

  it('a knee history reduces the descent dose and adds the cut-vert-first advisory', () => {
    const healthy = generatePlanFromMethod(roche(), mikeConfig(), TODAY)
    const knee = generatePlanFromMethod(roche(), mikeConfig({ injuryStatus: 'returning', injuryArea: 'knee' }), TODAY)
    const downhillCount = (p: typeof healthy) =>
      allDays(p).filter(d => /Downhill repeats/.test(d.detail)).length
    expect(downhillCount(knee)).toBeLessThan(downhillCount(healthy))
    expect(downhillCount(knee)).toBeGreaterThan(0) // reduced, not removed
    const kneeNotes = allDays(knee).filter(d => /Downhill repeats/.test(d.detail))
    for (const d of kneeNotes) expect(d.detail).toMatch(/Knee\/lower-leg history/)
    expect(knee.advisories?.some(a => a.id === 'descent_caution')).toBe(true)
    expect(healthy.advisories?.some(a => a.id === 'descent_caution')).toBeFalsy()
  })
})

describe('P4.4 — joint time+vert load-spike guard', () => {
  it('flags a tampered week that spikes both time and vert >35%', () => {
    const plan = generatePlanFromMethod(roche(), mikeConfig(), TODAY)
    const weeks = plan.weeks.map(w => ({ ...w, days: w.days.map(d => ({ ...d })) }))
    // Tamper week 5: massive day durations + a huge vert stamp.
    for (const d of weeks[4].days) {
      if (d.time) d.time = '180 min'
    }
    weeks[4].days[0].detail += ' · ~9000 ft gain'
    expect(validatePlan({ ...plan, weeks }).findings.map(f => f.id)).toContain('qa_load_spike')
  })

  it('the untampered climby persona does not trip the guard', () => {
    const plan = generatePlanFromMethod(roche(), mikeConfig(), TODAY)
    expect(validatePlan(plan).findings.map(f => f.id)).not.toContain('qa_load_spike')
  })
})

describe('P4 — personas stay clean through the gate', () => {
  it('healthy, injured, and race-anchored Mike variants all generate with zero errors', () => {
    for (const overrides of [
      {},
      { injuryStatus: 'returning' as const, injuryArea: 'knee' },
      { fitnessAnchor: { type: 'race_10k' as const, valueSeconds: 48 * 60 } },
    ]) {
      const plan = generatePlanFromMethod(roche(), mikeConfig(overrides), TODAY)
      expect(validatePlan(plan).errors.map(e => `${e.id}: ${e.detail}`), JSON.stringify(overrides)).toEqual([])
    }
  })
})
