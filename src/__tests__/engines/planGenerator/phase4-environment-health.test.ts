/**
 * Phase 4 — environment & health (PRD-108 + PRD-109).
 *
 * Heat: aerobic pace bands slow by the registry factor for the athlete's
 * typical training heat (quality goes effort-first, never pace-chased);
 * hot races get a quantified pacing advisory. Health: three optional
 * screen questions route any yes to conservative defaults + a
 * professional-care advisory — inform and route, never diagnose.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { getMethodById } from '../../../data/methods'
import { heatFactorFor } from '../../../engines/running/heuristics'
import { SCREENING_COPY } from '../../../engines/running/screeningCopy'
import { TODAY, satAfterWeeks } from '../../helpers/roadPersonas'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import type { TrainingPlan } from '../../../types'

function cfg(over: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'road', raceName: 'X', raceDate: satAfterWeeks(14),
    raceDistance: 'half_marathon', raceDistanceMiles: 13.1, athleteName: 'T', age: 34,
    sex: 'female', experienceLevel: 'intermediate', trainingDaysPerWeek: 5,
    currentWeeklyMileage: 24, strengthDaysPerWeek: 1, equipmentAccess: ['gym'],
    strengthExperience: 'experienced',
    fitnessAnchor: { type: 'race_10k', valueSeconds: 50 * 60, dateIso: '2026-07-20' },
    longRunDay: 'Saturday', wearable: 'garmin', completedAt: '',
    selectedMethodId: 'pfitzinger',
    ...over,
  } as unknown as OnboardingConfig
}
const gen = (c: OnboardingConfig) => generatePlanFromMethod(getMethodById(c.selectedMethodId!)!, c, TODAY)

const firstEasyZone = (p: TrainingPlan) =>
  p.weeks.flatMap(w => w.days).find(d => d.type === 'run' && /E pace|Easy|GA|Z2/i.test(d.zone ?? ''))?.zone ?? ''

describe('Phase 4 — heat pace adjustment (PRD-108)', () => {
  it('the registry bands behave: cool 1.0, warm small, hot effort-first, extreme advises', () => {
    expect(heatFactorFor(undefined).factor).toBe(1)
    expect(heatFactorFor(55).factor).toBe(1)
    expect(heatFactorFor(65).factor).toBeGreaterThan(1)
    expect(heatFactorFor(65).factor).toBeLessThan(1.03)
    expect(heatFactorFor(85).effortFirst).toBe(true)
    expect(heatFactorFor(95).advise).toMatch(/indoors|morning/i)
  })

  it('85°F training slows the easy bands; quality pace targets are untouched', () => {
    const cool = gen(cfg())
    const hot = gen(cfg({ typicalTrainingTempF: 85 }))
    const paceSecOf = (zone: string) => {
      const m = zone.match(/(\d+):(\d+)-(\d+):(\d+) \/mi/)
      return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null
    }
    const coolEasy = paceSecOf(firstEasyZone(cool))
    const hotEasy = paceSecOf(firstEasyZone(hot))
    expect(coolEasy).not.toBeNull()
    expect(hotEasy).not.toBeNull()
    expect(hotEasy!).toBeGreaterThan(coolEasy!)
    // Quality zone (threshold) unchanged.
    const qZone = (p: TrainingPlan) =>
      p.weeks.flatMap(w => w.days).find(d => d.type === 'quality' && !/BENCHMARK/i.test(d.workout))?.zone ?? ''
    expect(paceSecOf(qZone(hot))).toEqual(paceSecOf(qZone(cool)))
    // The info advisory says what changed.
    expect(hot.advisories?.some(a => a.id === 'training_heat_adjusted')).toBe(true)
    expect(cool.advisories?.some(a => a.id === 'training_heat_adjusted') ?? false).toBe(false)
  })

  it('at effort-first heat, quality cards carry the RPE-first note', () => {
    const hot = gen(cfg({ typicalTrainingTempF: 85 }))
    const quality = hot.weeks.flatMap(w => w.days).filter(d => d.type === 'quality' && !/BENCHMARK/i.test(d.workout))
    expect(quality.length).toBeGreaterThan(0)
    expect(quality.every(d => /run this by effort/i.test(d.detail))).toBe(true)
  })

  it('a hot race gets the quantified pacing advisory; a cool race stays silent', () => {
    const hot = gen(cfg({ raceDescription: 'Flat, fast, and notoriously hot and humid in late summer.' }))
    const adv = hot.advisories?.find(a => a.id === 'race_heat_pacing')
    expect(adv).toBeTruthy()
    expect(adv!.detail).toMatch(/\d–\d%/)
    expect(gen(cfg()).advisories?.some(a => a.id === 'race_heat_pacing') ?? false).toBe(false)
  })
})

describe('Phase 4 — health & energy-availability screen (PRD-109)', () => {
  const flagged = (screen: NonNullable<OnboardingConfig['healthScreen']>) => gen(cfg({ healthScreen: screen }))

  it('any yes: caution advisory, ramp capped at 5%, plyometrics suppressed', () => {
    const plan = flagged({ persistentFatigue: true })
    expect(plan.advisories?.some(a => a.id === 'health_flag')).toBe(true)
    // Ramp ≤5%: week-over-week target growth never exceeds ~5%.
    const targets = plan.weeks.filter(w => !/taper|cutback/i.test(w.focus)).map(w => w.targetMi ?? 0).filter(t => t > 0)
    for (let i = 1; i < targets.length; i++) {
      expect(targets[i] / targets[i - 1], `week ${i + 1}`).toBeLessThanOrEqual(1.056)
    }
    // No jump work anywhere (experienced lifter would normally draw plyo in race prep).
    for (const w of plan.weeks) {
      for (const d of w.days) {
        if (d.type !== 'strength') continue
        expect(/Box Jump|Jump Squat|Pogo|explosive power/i.test(d.detail), `week ${w.num}`).toBe(false)
      }
    }
  })

  it('bone-stress history: hills stay out of the first six weeks', () => {
    const plan = gen(cfg({ selectedMethodId: 'koop', raceType: 'trail', raceDistance: '50k', raceDistanceMiles: 31.1, elevationGainFt: 5000, currentWeeklyMileage: 40, trainingDaysPerWeek: 6, raceDate: satAfterWeeks(20), healthScreen: { boneStressHistory: true } }))
    for (const w of plan.weeks.slice(0, 6)) {
      const hills = w.days.filter(d => d.plannedWorkout?.category === 'hills')
      expect(hills.length, `week ${w.num}`).toBe(0)
    }
  })

  it('recent bone stress + marathon escalates to critical', () => {
    const plan = gen(cfg({ raceDistance: 'marathon', raceDistanceMiles: 26.2, currentWeeklyMileage: 36, raceDate: satAfterWeeks(16), healthScreen: { boneStressRecent: true } }))
    const adv = plan.advisories?.find(a => a.id === 'bone_stress_distance_risk')
    expect(adv?.severity).toBe('critical')
  })

  it('the copy registry never diagnoses (language contract, 109-F3)', () => {
    const all = Object.values(SCREENING_COPY).join(' ')
    expect(all).not.toMatch(/\byou have\b|\bdiagnos/i)
    expect(all).toMatch(/clinician/)
    // Frozen strings: reviewed copy changes deliberately or not at all.
    expect(SCREENING_COPY).toMatchSnapshot()
  })

  it('unflagged athletes are byte-identical to a config with no screen at all', () => {
    const without = gen(cfg())
    const withEmpty = gen(cfg({ healthScreen: {} }))
    expect(JSON.stringify(withEmpty.weeks)).toEqual(JSON.stringify(without.weeks))
    expect(withEmpty.advisories?.some(a => a.id === 'health_flag') ?? false).toBe(false)
  })
})
