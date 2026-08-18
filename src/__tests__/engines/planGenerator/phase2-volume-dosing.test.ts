/**
 * Phase 2 — volume honesty & persona dosing (PRD-101 + 102 + 104).
 *
 * The undertrained-arrival contract: floors are enforced for half and
 * marathon, reference-only for ultras, and whenever a cap legitimately
 * stops the build short of race-ready volume the athlete is TOLD
 * (peak_unreachable / volume_inadequate) — never silently sent to the
 * line. Plus: combined long-day limits (P6), the dosing QA contract
 * (P7), the advisory-presence law (P10), and the CI dosing report.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { getMethodById } from '../../../data/methods'
import { validatePlan } from '../../../engines/planQA/validatePlan'
import { REFERENCE_PEAK_FLOOR_MI } from '../../../engines/planGenerator/weekPlan'
import { TODAY, PERSONAS, buildConfig, satAfterWeeks } from '../../helpers/roadPersonas'
import type { OnboardingConfig, RaceDistance } from '../../../hooks/useOnboarding'
import type { TrainingPlan, PlannedDay } from '../../../types'

const plans = new Map<string, TrainingPlan>()
const planFor = (label: string) => {
  if (!plans.has(label)) {
    const p = PERSONAS.find(x => x.label === label)!
    plans.set(label, generatePlanFromMethod(getMethodById(p.methodId)!, buildConfig(p, p.runways[1]), TODAY))
  }
  return plans.get(label)!
}
const MAYA = 'Maya 46F beginner 4d marathon higdon 12mi (low-base marathon)'
const NOAH = 'Noah 62M intermediate 4d trail-50k trainingpeaks 22mi (low-base ultra)'
const OWEN = 'Owen 74M intermediate 4d half higdon recreational-lifter (senior strength)'

const lastBuildOf = (p: TrainingPlan) =>
  Math.max(0, ...p.weeks.filter(w => !/taper|cutback/i.test(w.focus) && !w.days.some(d => d.type === 'race'))
    .map(w => w.targetMi ?? 0))

describe('Phase 2 — race-readiness floors & undertrained-arrival honesty (PRD-101)', () => {
  it('Maya: the marathon floor drives her build up — or she is told (101-Q1)', () => {
    const plan = planFor(MAYA)
    const floor = REFERENCE_PEAK_FLOOR_MI.marathon!
    const arrived = lastBuildOf(plan) >= 0.85 * floor
    const told = plan.advisories?.some(a => a.id === 'peak_unreachable') ?? false
    expect(arrived || told, `lastBuild ${lastBuildOf(plan)} vs floor ${floor}, advisories: ${plan.advisories?.map(a => a.id)}`).toBe(true)
    // And the plan itself still passes the gate.
    expect(validatePlan({ ...plan, methodId: plan.methodId }).errors).toEqual([])
  })

  it('Noah: the ultra reference floor is advisory-only but never silent (101-Q1)', () => {
    const plan = planFor(NOAH)
    const floor = REFERENCE_PEAK_FLOOR_MI['50k']!
    const arrived = lastBuildOf(plan) >= 0.85 * floor
    const told = plan.advisories?.some(a => a.id === 'peak_unreachable') ?? false
    expect(arrived || told).toBe(true)
  })

  it('a masters low-base half (the review trace: ~17 vs 25) is told, with cap attribution (101-F2/F3)', () => {
    const cfg = {
      raceType: 'road', raceName: 'X', raceDate: satAfterWeeks(12),
      raceDistance: 'half_marathon', raceDistanceMiles: 13.1, athleteName: 'T', age: 66,
      sex: 'male', experienceLevel: 'beginner', trainingDaysPerWeek: 4, currentWeeklyMileage: 10,
      longRunDay: 'Saturday', wearable: 'garmin', completedAt: '', selectedMethodId: 'higdon',
    } as unknown as OnboardingConfig
    const plan = generatePlanFromMethod(getMethodById('higdon')!, cfg, TODAY)
    const adv = plan.advisories?.find(a => a.id === 'peak_unreachable')
    expect(adv, `lastBuild ${lastBuildOf(plan)}`).toBeTruthy()
    expect(adv!.detail).toMatch(/masters ramp cap|runway|training days/i)
    expect(adv!.suggestion).toMatch(/weeks later|shorter distance/i)
  })

  it('healthy adequate personas carry no undertrained advisory', () => {
    for (const label of ['Carmen 41F intermediate 5d half pfitzinger 10k-anchor', 'Dmitri 29M advanced 6d marathon hansons hm-anchor 45mi']) {
      const p = PERSONAS.find(x => x.label === label)!
      const plan = generatePlanFromMethod(getMethodById(p.methodId)!, buildConfig(p, p.runways[1]), TODAY)
      expect(plan.advisories?.some(a => a.id === 'peak_unreachable') ?? false, label).toBe(false)
    }
  })
})

describe('Phase 2 — combined long-run limits (PRD-102, P6)', () => {
  it('P6: no persona week puts more than ~70% of its miles into long days', () => {
    for (const p of PERSONAS) {
      const plan = planFor(p.label) ?? generatePlanFromMethod(getMethodById(p.methodId)!, buildConfig(p, p.runways[1]), TODAY)
      const qa = validatePlan({ ...plan, methodId: plan.methodId })
      expect(qa.errors.filter(e => e.id === 'qa_combined_long_share'), p.label).toEqual([])
    }
  })

  it('the QA rule can fail: a 74% long-share fixture errors, 58% is clean', () => {
    const mk = (longMiEach: number): PlannedDay[] => [
      { day: 'Mon', type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '', time: '—' },
      { day: 'Tue', type: 'run', workout: 'E', detail: '', zone: 'Z2', route: '', time: `${Math.round((30 - 2 * longMiEach) * 10)} min` },
      { day: 'Sat', type: 'long', workout: 'Long', detail: '', zone: `${longMiEach} mi · Z2`, route: '', time: '120 min' },
      { day: 'Sun', type: 'long', workout: 'B2B', detail: '', zone: `${longMiEach} mi · Z2`, route: '', time: '120 min' },
    ]
    const at = (mi: number) => validatePlan({
      weeks: [{ num: 1, dates: 'x', miles: 30, focus: 'Build', days: mk(mi) }],
    }).findings.filter(f => f.id === 'qa_combined_long_share')
    expect(at(11.1).map(f => f.severity)).toEqual(['error']) // 22.2/30 = 74%
    expect(at(8.7)).toEqual([])                              // 17.4/30 = 58%
  })

  it('B2B eligibility: sub-30-mile ultra weeks collapse to a single long day (102-F4)', () => {
    const leo = PERSONAS.find(x => x.label.startsWith('Leo'))!
    const plan = generatePlanFromMethod(getMethodById('koop')!, buildConfig(leo, leo.runways[0]), TODAY)
    for (const w of plan.weeks) {
      if ((w.targetMi ?? 0) >= 30 || w.days.some(d => d.type === 'race')) continue
      expect(w.days.filter(d => d.type === 'long').length, `week ${w.num} @ ${w.targetMi} mi`).toBeLessThanOrEqual(1)
    }
  })
})

describe('Phase 2 — the dosing contract (PRD-104, P7)', () => {
  it('P7: every persona plan passes the dose gates with its own experience and age', () => {
    for (const p of PERSONAS) {
      const plan = generatePlanFromMethod(getMethodById(p.methodId)!, buildConfig(p, p.runways[1]), TODAY)
      const eff = p.cfg.experienceLevel === 'first_timer' ? 'beginner' : (p.cfg.experienceLevel as 'beginner')
      const qa = validatePlan({ ...plan, methodId: plan.methodId, effectiveExperience: eff, age: p.cfg.age })
      expect(
        qa.errors.filter(e => ['qa_dose_gates', 'qa_strength_scheme', 'qa_effort_cues'].includes(e.id)).map(e => `${e.id}@${e.weekNum}: ${e.detail}`),
        p.label,
      ).toEqual([])
    }
  })

  it('the gates can fail: an RM card, a senior plyo day, and an outranked session all error', () => {
    const base: PlannedDay = { day: 'Tue', type: 'strength', workout: 'Strength', detail: '', zone: '—', route: '', time: '45 min' }
    const wk = (d: PlannedDay) => [{ num: 1, dates: 'x', miles: 20, focus: 'Build', days: [d] }]
    expect(validatePlan({ weeks: wk({ ...base, detail: 'build toward a 4-5RM' }) })
      .errors.some(e => e.id === 'qa_strength_scheme')).toBe(true)
    expect(validatePlan({ weeks: wk({ ...base, detail: 'Emphasis: explosive power (jumps)' }), age: 74 })
      .errors.some(e => e.id === 'qa_strength_scheme')).toBe(true)
    const outranked: PlannedDay = {
      day: 'Wed', type: 'quality', workout: 'Marathon Simulation', detail: '', zone: 'M', route: '', time: '120 min',
      plannedWorkout: { workoutId: 'daniels_marathon_simulation', methodId: 'daniels', name: 'x', category: 'long', primaryZone: 'easy', segments: [], approxDurationMinutes: { min: 90, max: 150 }, purpose: '', cues: [] },
    } as PlannedDay
    expect(validatePlan({ weeks: wk(outranked), methodId: 'daniels', effectiveExperience: 'beginner' })
      .errors.some(e => e.id === 'qa_dose_gates')).toBe(true)
  })

  it('Owen (74, recreational lifter): zero heavy or plyometric strength anywhere', () => {
    const plan = planFor(OWEN)
    for (const w of plan.weeks) {
      for (const d of w.days) {
        if (d.type !== 'strength') continue
        expect(/heavy strength \(4–6|explosive power|Box Jump|Jump Squat/i.test(d.detail), `week ${w.num} ${d.day}`).toBe(false)
      }
    }
  })

  it('a first-timer holds one quality session per week through week 6 (104-F5)', () => {
    const ava = PERSONAS.find(x => x.label.startsWith('Ava'))!
    const plan = generatePlanFromMethod(getMethodById('daniels')!, buildConfig(ava, 16), TODAY)
    for (const w of plan.weeks) {
      if (w.num > 6) break
      const q = w.days.filter(d => d.type === 'quality' && !/BENCHMARK/i.test(d.workout)).length
      expect(q, `week ${w.num}`).toBeLessThanOrEqual(1)
    }
  })

  it('every run card now carries an RPE cue alongside pace/HR (104-F4)', () => {
    const plan = planFor(MAYA)
    const runDays = plan.weeks.flatMap(w => w.days).filter(d => ['run', 'quality', 'long'].includes(d.type) && !/BENCHMARK/i.test(d.workout))
    const withRpe = runDays.filter(d => /RPE \d/.test(d.zone ?? ''))
    expect(withRpe.length / runDays.length).toBeGreaterThan(0.9)
  })
})

describe('Phase 2 — P10 advisory-presence law + dosing report (104-Q1)', () => {
  it('P10: whenever a floor silently binds, the advisory is present — for every persona', () => {
    for (const p of PERSONAS) {
      const plan = generatePlanFromMethod(getMethodById(p.methodId)!, buildConfig(p, p.runways[1]), TODAY)
      const floor = REFERENCE_PEAK_FLOOR_MI[p.distance as RaceDistance]
      if (floor == null) continue
      const arrived = lastBuildOf(plan) >= 0.85 * floor
      if (!arrived) {
        expect(plan.advisories?.some(a => a.id === 'peak_unreachable'), `${p.label}: ${lastBuildOf(plan)} vs ${floor}`).toBe(true)
      }
    }
  })

  it('dosing report: per-persona volume, quality, and hardest-session snapshot', () => {
    const report = PERSONAS.map(p => {
      const plan = generatePlanFromMethod(getMethodById(p.methodId)!, buildConfig(p, p.runways[1]), TODAY)
      const targets = plan.weeks.map(w => w.targetMi ?? 0).filter(t => t > 0)
      const qualityCounts = plan.weeks.map(w => w.days.filter(d => d.type === 'quality' && !/BENCHMARK/i.test(d.workout)).length)
      const cats = new Set(plan.weeks.flatMap(w => w.days).map(d => d.plannedWorkout?.category).filter(Boolean))
      const hardest = ['speed_repetitions', 'vo2_intervals', 'hills', 'race_pace', 'cruise_intervals', 'tempo', 'progression', 'fartlek'].find(c => cats.has(c as never)) ?? 'easy-only'
      return {
        persona: p.label,
        peakTargetMi: Math.round(Math.max(...targets)),
        medianTargetMi: Math.round([...targets].sort((a, b) => a - b)[Math.floor(targets.length / 2)]),
        maxQualityPerWeek: Math.max(...qualityCounts),
        hardestSession: hardest,
        advisories: (plan.advisories ?? []).map(a => a.id).sort(),
      }
    })
    // Snapshot-diffed: silent dosing drift fails review (update deliberately).
    expect(report).toMatchSnapshot()
  })
})
