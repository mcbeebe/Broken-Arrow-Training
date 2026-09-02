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
import { mergeBenchmarkAnchors } from '../../../hooks/useOnboarding'
import { dayIsoInWeek } from '../../../utils/planDates'
import { resolveAnchor, resolvePaces } from '../../../engines/planGenerator/paceTargets'

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

  // ── verified audit: the suppression keyed on the wrong predicate, and the
  // VDOT branch (the one v1 actually broke on) had no test ─────────────
  const PACE = /\d{1,2}:\d{2}\s*(?:[-–]\s*\d{1,2}:\d{2}\s*)?\/mi/
  const raceAnchored = (extra: Partial<OnboardingConfig> = {}) => mikeConfig({
    fitnessAnchor: { type: 'race_10k', valueSeconds: 48 * 60, dateIso: '2026-07-20' }, ...extra,
  })
  const noPaceAnywhere = (days: ReturnType<typeof allDays>) => {
    expect(days.length).toBeGreaterThan(0)
    for (const d of days) {
      expect(d.zone, `${d.day} zone`).not.toMatch(PACE)
      expect(d.detail, `${d.day} detail`).not.toMatch(PACE)
      for (const s of d.plannedWorkout?.segments ?? []) {
        expect(s.paceTarget?.paceSecPerMileLow, `${d.day} segment "${s.description}"`).toBeUndefined()
      }
    }
  }

  it('a RACE-anchored athlete (the VDOT branch) still gets no pace on Roche hill strides — day, detail, and segments', () => {
    const plan = generatePlanFromMethod(roche(), raceAnchored(), TODAY)
    noPaceAnywhere(allDays(plan).filter(d => /hill strides/i.test(d.workout)))
  })

  it("Koop's climbing repeats (a pct_of_hr zone, category hills) carry HR and effort but never a flat pace", () => {
    const koop = getMethodById('koop')!
    const plan = generatePlanFromMethod(koop, raceAnchored({ raceDistance: '50k', raceDistanceMiles: 31, elevationGainFt: 6000 }), TODAY)
    const climbs = allDays(plan).filter(d => d.plannedWorkout?.category === 'hills')
    noPaceAnywhere(climbs)
    // The real guidance survives: an HR band on the day and the main segment.
    expect(climbs.some(d => /bpm/.test(d.zone ?? ''))).toBe(true)
    expect(climbs.some(d => (d.plannedWorkout?.segments ?? []).some(s => s.paceTarget?.hrBpmLow != null))).toBe(true)
    expect(validatePlan(plan).errors.map(e => e.id)).not.toContain('qa_pace_on_hills')
  })

  it("Higdon's tempo and speedwork are pace-defined and now resolve to a pace for a race-anchored athlete (easy stays by feel)", () => {
    // v1 tagged both zones rpe_only although Higdon defines Tempo as
    // "10K-HM race pace" and Speedwork as "5K-10K race pace": a race-anchored
    // athlete got no pace for flat 400m repeats. The zones are now
    // vdot_table; the half-marathon program itself schedules only easy,
    // long and pace runs, so this is asserted where the zones resolve.
    const higdon = getMethodById('higdon')!
    const paces = resolvePaces(higdon, raceAnchored({ raceType: 'road' }))
    expect(paces.byZone.lactate_threshold?.paceSecPerMileLow).toBeDefined()
    expect(paces.byZone.vo2max?.paceSecPerMileLow).toBeDefined()
    expect(paces.byZone.easy?.paceSecPerMileLow).toBeUndefined()
    // And it is a real threshold band for a 48:00 10K runner (~7:30-8:30 /mi).
    const t = paces.byZone.lactate_threshold?.paceSecPerMileLow ?? 0
    expect(t).toBeGreaterThan(6 * 60)
    expect(t).toBeLessThan(9 * 60)
  })

  it('qa_pace_on_hills fires when a hill session is stamped with a flat pace', () => {
    const koop = getMethodById('koop')!
    const plan = generatePlanFromMethod(koop, raceAnchored({ raceDistance: '50k', raceDistanceMiles: 31, elevationGainFt: 6000 }), TODAY)
    const tampered = {
      ...plan,
      weeks: plan.weeks.map(w => ({
        ...w,
        days: w.days.map(d => d.plannedWorkout?.category === 'hills' ? { ...d, zone: 'ClimbingRepeats (Zone 5) · 7:07-7:25 /mi · 163-171 bpm' } : d),
      })),
    }
    expect(validatePlan(tampered).errors.map(e => e.id)).toContain('qa_pace_on_hills')
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

// ── P4.1 (verified audit) — the loop must close without destroying pace,
// the test must never be dated in the past, and the copy must be honest ──
const benchmarkIso = (plan: { weeks: { days: { day: string; workout: string }[]; startIso?: string }[] }) => {
  for (const w of plan.weeks) {
    const d = w.days.find(x => /BENCHMARK/i.test(x.workout))
    if (d) return dayIsoInWeek(d.day, w)
  }
  return null
}

describe('P4.1 — the benchmark is never dated in the past', () => {
  // Week 1 is the Mon–Sun week containing today; v1 placed the TT on week
  // 1's first quality day even when that day had already gone by.
  for (const today of ['2026-09-02', '2026-09-05', '2026-09-06']) { // Wed, Sat, Sun
    it(`running path, onboarding on ${today}: the time trial lands on or after today`, () => {
      const plan = generatePlanFromMethod(roche(), mikeConfig({ raceDate: '2026-11-21' }), today)
      const iso = benchmarkIso(plan)
      expect(iso, 'no benchmark scheduled').not.toBeNull()
      expect(iso! >= today, `benchmark ${iso} is before today ${today}`).toBe(true)
    })
    it(`Hyrox path, onboarding on ${today}: the 1km TT lands on or after today`, () => {
      const plan = generateHyroxPlan(mikeConfig({
        raceType: 'hyrox', raceDate: '2026-11-28', raceDistance: undefined, fitnessAnchor: undefined,
        equipmentAccess: ['gym'],
      }), today)
      const iso = benchmarkIso(plan)
      expect(iso, 'no benchmark scheduled').not.toBeNull()
      expect(iso! >= today, `benchmark ${iso} is before today ${today}`).toBe(true)
    })
  }
})

describe('P4.1 — applying a measured LTHR keeps the pace anchor', () => {
  it('a tested LTHR beside an easy-pace anchor: pace bands survive, the estimate advisory retires, no benchmark', () => {
    const koop = getMethodById('koop')! // primaryAnchor lthr_bpm
    const untested = generatePlanFromMethod(koop, mikeConfig(), TODAY)
    const tested = generatePlanFromMethod(koop, mikeConfig({ testedLthrBpm: 163 }), TODAY)
    const paced = (p: typeof tested) => allDays(p).filter(d => /\/mi/.test(d.zone ?? '')).length
    expect(paced(untested)).toBeGreaterThan(0)
    // The v1 failure: Apply swapped the anchor to {type:'lthr'} and this went to 0.
    expect(paced(tested)).toBeGreaterThanOrEqual(paced(untested))
    expect(tested.advisories?.some(a => a.id === 'zones_estimated')).toBeFalsy()
    expect(allDays(tested).some(d => /BENCHMARK/i.test(d.workout))).toBe(false)
    expect(resolveAnchor(koop, mikeConfig({ testedLthrBpm: 163 })).value).toBe(163)
  })

  it('mergeBenchmarkAnchors writes testedLthrBpm without touching fitnessAnchor; null clears it', () => {
    const prev = mikeConfig() // easy_pace 9:30
    const applied = mergeBenchmarkAnchors(prev, { testedLthrBpm: 163, maxHR: 196 })
    expect(applied.fitnessAnchor).toEqual(prev.fitnessAnchor)
    expect(applied.testedLthrBpm).toBe(163)
    expect(applied.maxHR).toBe(196)
    const undone = mergeBenchmarkAnchors(applied, { testedLthrBpm: null, maxHR: null })
    expect(undone.testedLthrBpm).toBeUndefined()
    expect(undone.maxHR).toBeUndefined()
    expect(undone.fitnessAnchor).toEqual(prev.fitnessAnchor)
    // A race anchor is still never overwritten by a legacy lthr fitnessAnchor write.
    const race = mikeConfig({ fitnessAnchor: { type: 'race_10k', valueSeconds: 2880 } })
    expect(mergeBenchmarkAnchors(race, { fitnessAnchor: { type: 'lthr', bpm: 160 } }).fitnessAnchor).toEqual(race.fitnessAnchor)
  })
})

describe('P4.1 — the copy points at a path that exists', () => {
  it('the running benchmark and its advisory no longer send the athlete to a Settings form that does not exist', () => {
    const plan = generatePlanFromMethod(roche(), mikeConfig(), TODAY)
    const test = allDays(plan).find(d => /BENCHMARK/i.test(d.workout))!
    expect(test.detail).not.toMatch(/in Settings afterward/)
    expect(test.detail).toMatch(/heart rate/i)
    expect(test.detail).toMatch(/Settings → Calibration/)
    const adv = (plan.advisories ?? []).find(a => a.id === 'zones_estimated')!
    expect(adv.detail).not.toMatch(/enter the result in Settings/)
    expect(adv.detail).toMatch(/Calibration/)
  })

  it('the Hyrox benchmark copy names the real closure path', () => {
    const plan = generateHyroxPlan(mikeConfig({ raceType: 'hyrox', raceDate: '2026-11-28', raceDistance: undefined, fitnessAnchor: undefined, equipmentAccess: ['gym'] }), TODAY)
    const test = allDays(plan).find(d => /BENCHMARK/i.test(d.workout))!
    expect(test.detail).not.toMatch(/Enter results in Settings/)
    expect(test.detail).toMatch(/offers to apply/)
  })
})
