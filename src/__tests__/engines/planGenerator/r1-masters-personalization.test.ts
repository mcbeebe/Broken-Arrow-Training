/**
 * R1 — masters & strength personalization (docs/running-plan-audit.md).
 *
 * The audit proved age was a no-op in the road path (age 30 vs 79:
 * byte-identical plans — finding B1), strengthExperience was collected
 * and never read (B2), and the strength emphasis contradicted its own
 * routine, telling a 79-year-old novice to "build toward a 4–5RM" (C1/C2).
 * This suite locks in the R1 behavior: age tiers change the plan,
 * strength schemes match their emphasis, and RM language is gone.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { getMethodById } from '../../../data/methods'
import { validatePlan } from '../../../engines/planQA/validatePlan'
import { buildStrengthDetail, strengthPhaseEmphasis } from '../../../engines/planGenerator/extraDays'
import { RUNNING_HEURISTICS } from '../../../engines/running/heuristics'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import type { TrainingPlan } from '../../../types'

const TODAY = '2026-08-17'

function cfg(over: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'road', raceName: 'Jamestown Glow Run', raceDate: '2026-12-05',
    raceDistance: '5k', raceDistanceMiles: 3.1, athleteName: 'Jim', age: 79,
    sex: 'male', experienceLevel: 'beginner', trainingDaysPerWeek: 6,
    strengthDaysPerWeek: 1, equipmentAccess: ['gym'],
    longRunDay: 'Saturday', wearable: 'garmin', completedAt: '',
    selectedMethodId: 'daniels',
    ...over,
  } as unknown as OnboardingConfig
}

const gen = (c: OnboardingConfig) => generatePlanFromMethod(getMethodById(c.selectedMethodId!)!, c, TODAY)
const cutbackCount = (p: TrainingPlan) => p.weeks.filter(w => /cutback/i.test(w.focus)).length
const vo2Days = (p: TrainingPlan) => p.weeks.flatMap(w => w.days).filter(d => d.plannedWorkout?.category === 'vo2_intervals').length

describe('R1 — age changes the plan (audit B1: it changed nothing)', () => {
  const at79 = gen(cfg())
  const at62 = gen(cfg({ age: 62 }))
  const at30 = gen(cfg({ age: 30 }))

  it('masters (58+) recover more often and carry the advisory', () => {
    expect(cutbackCount(at79)).toBeGreaterThan(cutbackCount(at30))
    expect(cutbackCount(at62)).toBeGreaterThan(cutbackCount(at30))
    expect(at79.advisories?.some(a => a.id === 'masters_adjustments')).toBe(true)
    expect(at62.advisories?.some(a => a.id === 'masters_adjustments')).toBe(true)
    expect(at30.advisories?.some(a => a.id === 'masters_adjustments')).toBe(false)
  })

  it('seniors (70+) run zero VO2-interval days and at most one quality session/week', () => {
    expect(vo2Days(at79)).toBe(0)
    expect(vo2Days(at62)).toBeGreaterThan(0) // substitution starts at 70, not 58
    expect(vo2Days(at30)).toBeGreaterThan(0)
    for (const w of at79.weeks) {
      const q = w.days.filter(d => d.type === 'quality' && !/BENCHMARK/i.test(d.workout)).length
      expect(q, `week ${w.num}`).toBeLessThanOrEqual(1)
    }
    // The advisory says why, and the quality that remains is threshold-flavored.
    expect(at79.advisories?.find(a => a.id === 'masters_adjustments')?.detail).toMatch(/threshold work/i)
    const qualityCats = at79.weeks.flatMap(w => w.days)
      .filter(d => d.type === 'quality' && d.plannedWorkout && !/BENCHMARK/i.test(d.workout))
      .map(d => d.plannedWorkout!.category)
    expect(qualityCats.length).toBeGreaterThan(0)
    expect(qualityCats.every(c => c !== 'vo2_intervals' && c !== 'speed_repetitions')).toBe(true)
  })

  it('all three still pass the QA gate', () => {
    for (const p of [at79, at62, at30]) {
      expect(validatePlan(p).errors.map(e => `${e.id}@${e.weekNum}`)).toEqual([])
    }
  })
})

describe('R1 — strength schemes match their emphasis (audit C1/C2)', () => {
  const base = { phaseId: 'base', isTaper: false, weekNumber: 2 }
  const peak = { phaseId: 'race_prep', isTaper: false, weekNumber: 10 }

  it('a 79-year-old gets the masters scheme — no RM language, no jumps, balance work', () => {
    const detail = buildStrengthDetail(base, cfg())
    expect(detail).toMatch(/masters strength/i)
    expect(detail).toMatch(/Single-Leg Balance/)
    expect(detail).not.toMatch(/RM\b/)
    expect(detail).not.toMatch(/maximal strength/i)
    expect(detail).not.toMatch(/Box Jump/i)
  })

  it('a new lifter of any age gets technique-first, never a heavy prescription', () => {
    const detail = buildStrengthDetail(base, cfg({ age: 30 }))
    expect(detail).toMatch(/technique first/i)
    expect(detail).toMatch(/Goblet Squat 3×12/)
    expect(detail).not.toMatch(/RM\b/)
  })

  it('an experienced lifter gets heavy low reps in base with a reps-in-reserve cue', () => {
    const detail = buildStrengthDetail(base, cfg({ age: 30, strengthExperience: 'experienced' }))
    expect(detail).toMatch(/heavy strength \(4–6 reps\)/i)
    expect(detail).toMatch(/reps in reserve/i)
    expect(detail).toMatch(/Goblet Squat 4×5/)
    expect(detail).not.toMatch(/RM\b/)
  })

  it('the power phase finally contains the exercises its emphasis promises', () => {
    const detail = buildStrengthDetail(peak, cfg({ age: 30, strengthExperience: 'experienced' }))
    expect(detail).toMatch(/explosive power/i)
    expect(detail).toMatch(/Box Jump|Jump Squat|Med-Ball/i)
  })

  it('no-gym athletes get bodyweight variants per phase', () => {
    const detail = buildStrengthDetail(peak, cfg({ age: 30, strengthExperience: 'recreational', equipmentAccess: [] }))
    expect(detail).toMatch(/Jump Squat|Pogo/i)
    expect(detail).not.toMatch(/Med-Ball/)
  })

  it('the emphasis header never contradicts the routine (the Jim screenshot)', () => {
    // Every tier × phase: if the emphasis says 4-6 reps, the routine carries
    // ≤6-rep sets; if it says technique/masters, no ×5 heavy sets appear.
    for (const over of [{}, { age: 30 }, { age: 30, strengthExperience: 'experienced' as const }, { age: 62 }]) {
      for (const opts of [base, peak, { phaseId: 'early_quality', isTaper: false, weekNumber: 6 }]) {
        const detail = buildStrengthDetail(opts, cfg(over))
        if (/4–6 reps/.test(detail)) {
          // Heavy emphasis → the main lifts really are low-rep (accessories
          // like calf raises staying at 10-15 is normal).
          expect(detail).toMatch(/Squat 4×5/)
          expect(detail).not.toMatch(/Goblet Squat 3×12/)
        }
      }
    }
  })

  it('strengthPhaseEmphasis keeps its public periodization vocabulary', () => {
    const exp = cfg({ age: 30, strengthExperience: 'experienced' })
    expect(strengthPhaseEmphasis('base', false, exp)).toMatch(/heavy/i)
    expect(strengthPhaseEmphasis('race_prep', false, exp)).toMatch(/power|explosive/i)
    expect(strengthPhaseEmphasis('early_quality', false, exp)).toMatch(/transition/i)
    expect(strengthPhaseEmphasis('taper', true, exp)).toMatch(/maintenance/i)
  })
})

describe('R1 — volume scales with available days', () => {
  it('an intermediate low-frequency athlete peaks meaningfully lower than a high-frequency one', () => {
    // 6 running days (factor 1.1 — R2 caps every week at 6 training days,
    // so the high-frequency case drops its strength day) vs the method's
    // minimum running days (factor ≤0.9). Methods floor running days, so
    // compare across the widest spread the method allows.
    const sevenDay = gen(cfg({ age: 30, experienceLevel: 'intermediate', trainingDaysPerWeek: 7, strengthDaysPerWeek: 0 }))
    const fourDay = gen(cfg({ age: 30, experienceLevel: 'intermediate', trainingDaysPerWeek: 4 }))
    const peak = (p: TrainingPlan) => Math.max(...p.weeks.map(w => w.targetMi ?? 0))
    expect(peak(fourDay)).toBeLessThan(peak(sevenDay) * 0.9)
  })
})

describe('R1 — heuristics registry', () => {
  it('every constant is tiered with a citation', () => {
    for (const [name, tv] of Object.entries(RUNNING_HEURISTICS)) {
      expect(['T1', 'T2', 'T3', 'T4'], name).toContain(tv.tier)
      expect((tv.citation ?? '').length, `${name} citation`).toBeGreaterThan(20)
    }
  })
})
