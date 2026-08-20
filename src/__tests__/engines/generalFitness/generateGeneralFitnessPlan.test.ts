import { describe, it, expect } from 'vitest'
import { generateGeneralFitnessPlan } from '../../../engines/generalFitness'
import { weeklyRoles } from '../../../engines/generalFitness/presets'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import type { GeneralGoal } from '../../../hooks/useOnboarding'

const TODAY = '2026-06-08'
const GOALS: GeneralGoal[] = ['stay_healthy', 'lose_fat', 'build_muscle', 'build_endurance']

function makeConfig(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'general',
    raceName: 'My Fitness Plan',
    raceDate: '',
    generalGoal: 'stay_healthy',
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 4,
    longRunDay: 'Saturday',
    wearable: 'none',
    athleteName: 'Test',
    age: 38,
    maxHR: 184,
    completedAt: '',
    ...overrides,
  }
}

const activeDays = (days: { type: string }[]) => days.filter(d => d.type !== 'rest')
// Routine strength days only — the benchmark session (week 1, then each
// re-test week) measures instead of prescribing, so it carries no routine.
const strengthDays = (days: { type: string; workout?: string }[]) =>
  days.filter(d => d.type === 'strength' && !/STRENGTH BENCHMARK/i.test(d.workout ?? ''))

describe('generateGeneralFitnessPlan — structure', () => {
  it('defaults to an open-ended rolling block of 12 weeks when no target date is set', () => {
    const plan = generateGeneralFitnessPlan(makeConfig(), TODAY)
    expect(plan.weeks).toHaveLength(12)
  })

  it('sizes the block to a target date and clamps to 16 weeks max', () => {
    const near = generateGeneralFitnessPlan(makeConfig({ raceDate: '2026-07-20' }), TODAY)
    expect(near.weeks.length).toBeGreaterThanOrEqual(4)
    expect(near.weeks.length).toBeLessThan(12)
    const far = generateGeneralFitnessPlan(makeConfig({ raceDate: '2027-06-01' }), TODAY)
    expect(far.weeks).toHaveLength(16)
  })

  it('every week has exactly 7 days', () => {
    for (const goal of GOALS) {
      const plan = generateGeneralFitnessPlan(makeConfig({ generalGoal: goal }), TODAY)
      for (const w of plan.weeks) expect(w.days).toHaveLength(7)
    }
  })

  it('active (non-rest) day count equals trainingDaysPerWeek for 3–6 days', () => {
    for (const days of [3, 4, 5, 6]) {
      const plan = generateGeneralFitnessPlan(makeConfig({ trainingDaysPerWeek: days }), TODAY)
      for (const w of plan.weeks) expect(activeDays(w.days)).toHaveLength(days)
    }
  })

  it('produces a valid plan for all four goals', () => {
    for (const goal of GOALS) {
      const plan = generateGeneralFitnessPlan(makeConfig({ generalGoal: goal }), TODAY)
      expect(plan.weeks).toHaveLength(12)
      expect(plan.zones.length).toBeGreaterThan(0)
      expect(plan.athlete.name).toBe('Test')
      // Each day carries the required flat fields.
      for (const d of plan.weeks[0].days) {
        expect(typeof d.workout).toBe('string')
        expect(typeof d.zone).toBe('string')
      }
    }
  })

  it('is deterministic for the same (config, today)', () => {
    const a = generateGeneralFitnessPlan(makeConfig({ generalGoal: 'lose_fat' }), TODAY)
    const b = generateGeneralFitnessPlan(makeConfig({ generalGoal: 'lose_fat' }), TODAY)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('falls back to stay_healthy when generalGoal is unset', () => {
    const cfg = makeConfig()
    delete (cfg as Partial<OnboardingConfig>).generalGoal
    const plan = generateGeneralFitnessPlan(cfg, TODAY)
    expect(plan.weeks).toHaveLength(12)
    expect(plan.athlete.currentBase).toContain('Stay Healthy')
  })
})

describe('generateGeneralFitnessPlan — VO₂max on-ramp', () => {
  const vo2Detail = (plan: ReturnType<typeof generateGeneralFitnessPlan>, weekNum: number) =>
    plan.weeks[weekNum - 1].days.find(d => d.workout === 'VO₂max intervals')?.detail ?? ''

  it('builds into VO₂max work instead of opening at a full 4×4', () => {
    // lose_fat trains VO₂max from week 1 (template: strength · vo2max · …).
    const plan = generateGeneralFitnessPlan(makeConfig({ generalGoal: 'lose_fat' }), TODAY)
    // Opening hard weeks start at 3×3, never the brutal 4×4.
    expect(vo2Detail(plan, 1)).toContain('3 × 3 min hard')
    expect(vo2Detail(plan, 1)).toContain('building toward 4 × 4')
    // Reps grow before duration; 4×4 only arrives later in the block.
    expect(vo2Detail(plan, 3)).toContain('4 × 3 min hard')
    expect(vo2Detail(plan, 5)).toContain('4 × 4 min hard')
  })
})

describe('generateGeneralFitnessPlan — injury lead-in', () => {
  const isHardInterval = (detail: string) => /min hard @/.test(detail)

  it('holds hard intervals easy through the returning-from-injury lead-in (2 wk)', () => {
    const plan = generateGeneralFitnessPlan(
      makeConfig({ generalGoal: 'lose_fat', injuryStatus: 'returning' }),
      TODAY,
    )
    // Weeks 1–2: any VO₂max slot is swapped to easy aerobic — no hard intervals.
    for (const weekNum of [1, 2]) {
      for (const d of plan.weeks[weekNum - 1].days) {
        expect(isHardInterval(d.detail)).toBe(false)
      }
      const swapped = plan.weeks[weekNum - 1].days.find(d => d.workout.includes('intervals on hold'))
      expect(swapped).toBeTruthy()
    }
    // Week 3: intensity is back, and it re-enters gently (3×3, not 4×4).
    const w3 = plan.weeks[2].days.find(d => d.workout === 'VO₂max intervals')?.detail ?? ''
    expect(w3).toContain('3 × 3 min hard')
  })

  it('keeps full intensity from week 1 for healthy athletes', () => {
    const plan = generateGeneralFitnessPlan(
      makeConfig({ generalGoal: 'lose_fat', injuryStatus: 'none' }),
      TODAY,
    )
    expect(plan.weeks[0].days.some(d => d.workout === 'VO₂max intervals')).toBe(true)
  })
})

describe('generateGeneralFitnessPlan — fat-loss core work', () => {
  // The finisher is the PAIR (Dead bug + Russian twists). "Dead bug" alone
  // is also an ordinary core slot in the B template, so asserting on it
  // singly only held while week 1 happened to open with the A session.
  const hasAbFinisher = (detail: string) =>
    detail.includes('Dead bug') && detail.includes('Russian twists')
  const routineStrength = (plan: { weeks: { days: { type: string; workout: string; detail: string }[] }[] }) =>
    plan.weeks.flatMap(w => w.days).filter(d => d.type === 'strength' && !/STRENGTH BENCHMARK/i.test(d.workout))

  it('adds direct ab work to fat-loss strength days', () => {
    const plan = generateGeneralFitnessPlan(makeConfig({ generalGoal: 'lose_fat' }), TODAY)
    const days = routineStrength(plan)
    expect(days.length).toBeGreaterThan(0)
    expect(days.every(d => hasAbFinisher(d.detail))).toBe(true)
  })

  it('does not add the ab finisher to other goals', () => {
    const plan = generateGeneralFitnessPlan(makeConfig({ generalGoal: 'stay_healthy' }), TODAY)
    expect(routineStrength(plan).some(d => hasAbFinisher(d.detail))).toBe(false)
  })
})

describe('generateGeneralFitnessPlan — goal personalization', () => {
  it('reads the free-text goal and targets the named muscle every strength day', () => {
    const plan = generateGeneralFitnessPlan(
      makeConfig({ generalGoal: 'build_muscle', athleteGoal: 'I want big biceps', trainingDaysPerWeek: 5 }),
      TODAY,
    )
    const strength = plan.weeks[0].days.filter(d => d.type === 'strength' && !/STRENGTH BENCHMARK/i.test(d.workout))
    expect(strength.length).toBeGreaterThan(0)
    // Direct arm work appears on EVERY strength day, not just the first.
    for (const d of strength) {
      expect(d.detail, d.detail).toMatch(/bicep curl|hammer curl|tricep/i)
    }
    // The plan surfaces the personalization so the athlete sees it.
    expect(plan.weeks[0].focus.toLowerCase()).toContain('arms')
    expect(plan.athlete.currentBase.toLowerCase()).toContain('arms focus')
  })

  it('varies the session day to day instead of repeating one template', () => {
    const plan = generateGeneralFitnessPlan(
      makeConfig({ generalGoal: 'build_muscle', trainingDaysPerWeek: 5 }),
      TODAY,
    )
    const strength = plan.weeks[0].days.filter(d => d.type === 'strength' && !/STRENGTH BENCHMARK/i.test(d.workout))
    expect(strength.length).toBeGreaterThanOrEqual(2)
    // Consecutive strength days are NOT identical (the original-bug regression).
    expect(strength[0].detail).not.toBe(strength[1].detail)
  })

  it('leaves the focus generic when no muscle is named', () => {
    const plan = generateGeneralFitnessPlan(
      makeConfig({ generalGoal: 'build_muscle', athleteGoal: 'just get stronger' }),
      TODAY,
    )
    expect(plan.weeks[0].focus.toLowerCase()).not.toMatch(/target your goal/)
    expect(plan.athlete.currentBase.toLowerCase()).not.toContain('focus)')
  })
})

describe('generateGeneralFitnessPlan — pillars by goal', () => {
  it('honors the ≥2 strength-days health floor for non-endurance goals', () => {
    // Counts every strength SESSION, benchmark days included — a benchmark
    // is loaded training, not a rest day, so it satisfies the frequency
    // floor even though it carries no routine to parse.
    const allStrength = (days: { type: string }[]) => days.filter(d => d.type === 'strength')
    for (const goal of ['stay_healthy', 'lose_fat', 'build_muscle'] as GeneralGoal[]) {
      const plan = generateGeneralFitnessPlan(makeConfig({ generalGoal: goal, trainingDaysPerWeek: 4 }), TODAY)
      for (const w of plan.weeks) expect(allStrength(w.days).length, `week ${w.num}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('keeps Build Endurance strength near the floor (≥1), below Build Muscle', () => {
    const endurance = generateGeneralFitnessPlan(makeConfig({ generalGoal: 'build_endurance', trainingDaysPerWeek: 5 }), TODAY)
    const muscle = generateGeneralFitnessPlan(makeConfig({ generalGoal: 'build_muscle', trainingDaysPerWeek: 5 }), TODAY)
    const endStr = strengthDays(endurance.weeks[0].days).length
    const musStr = strengthDays(muscle.weeks[0].days).length
    expect(endStr).toBeGreaterThanOrEqual(1)
    expect(musStr).toBeGreaterThan(endStr)
  })

  it('Build Endurance carries more cardio than Build Muscle at the same days/week', () => {
    const endurance = generateGeneralFitnessPlan(makeConfig({ generalGoal: 'build_endurance', trainingDaysPerWeek: 5 }), TODAY)
    const muscle = generateGeneralFitnessPlan(makeConfig({ generalGoal: 'build_muscle', trainingDaysPerWeek: 5 }), TODAY)
    const cardio = (days: { type: string }[]) => days.filter(d => ['run', 'long', 'cross', 'quality'].includes(d.type)).length
    expect(cardio(endurance.weeks[0].days)).toBeGreaterThan(cardio(muscle.weeks[0].days))
  })

  it('strength days carry a parseable, prescriptive detail', () => {
    const plan = generateGeneralFitnessPlan(makeConfig({ generalGoal: 'build_muscle' }), TODAY)
    const s = plan.weeks[0].days.find(d => d.type === 'strength' && !/STRENGTH BENCHMARK/i.test(d.workout))!
    expect(s.detail).toContain(' · ')
    expect(s.workout.toLowerCase()).toContain('strength')
  })

  it('weeklyRoles length always equals the (clamped) days/week', () => {
    for (const goal of GOALS) {
      for (const days of [3, 4, 5, 6]) {
        expect(weeklyRoles(goal, days)).toHaveLength(days)
      }
    }
  })
})

describe('generateGeneralFitnessPlan — progression, zones, athlete, race', () => {
  it('inserts a deload every 4th week', () => {
    const plan = generateGeneralFitnessPlan(makeConfig(), TODAY)
    for (const w of plan.weeks) {
      if (w.num % 4 === 0) expect(w.focus.toLowerCase()).toContain('deload')
      else expect(w.focus.toLowerCase()).not.toContain('deload')
    }
  })

  it('zone percent labels match the displayed bpm range', () => {
    const plan = generateGeneralFitnessPlan(makeConfig({ maxHR: 200 }), TODAY)
    const z2 = plan.zones.find(z => z.zone.includes('Z2'))!
    const [loHr, hiHr] = z2.hr.split(/[–-]/).map(s => parseInt(s, 10))
    const [loPct, hiPct] = z2.pct.split(/[–-]/).map(s => parseInt(s, 10))
    expect(Math.round((loHr / 200) * 100)).toBe(loPct)
    expect(Math.round((hiHr / 200) * 100)).toBe(hiPct)
  })

  it('derives maxHR from age when not provided', () => {
    const cfg = makeConfig({ age: 40 })
    delete (cfg as Partial<OnboardingConfig>).maxHR
    const plan = generateGeneralFitnessPlan(cfg, TODAY)
    expect(plan.athlete.maxHR).toBe(180) // 220 - 40
  })

  it('athlete profile reflects onboarding inputs', () => {
    const plan = generateGeneralFitnessPlan(makeConfig({ athleteName: 'Jenn', maxHR: 180, trainingDaysPerWeek: 5 }), TODAY)
    expect(plan.athlete.name).toBe('Jenn')
    expect(plan.athlete.maxHR).toBe(180)
    expect(plan.athlete.weeklyStructure).toMatch(/days\/week/)
  })

  it('synthesizes a well-formed, event-less RaceInfo', () => {
    const plan = generateGeneralFitnessPlan(makeConfig({ generalGoal: 'lose_fat', raceName: 'Summer Cut' }), TODAY)
    expect(plan.race.name).toBe('Summer Cut')
    expect(plan.race.distanceMiles).toBe(0)
    expect(Array.isArray(plan.race.landmarks)).toBe(true)
    expect(Array.isArray(plan.race.gear)).toBe(true)
  })

  it('anchors the long session to the preferred long day when it is a training day', () => {
    // 5 days → training weekdays Mon,Tue,Wed,Fri,Sat. Saturday is a slot.
    const plan = generateGeneralFitnessPlan(makeConfig({ generalGoal: 'build_endurance', trainingDaysPerWeek: 5, longRunDay: 'Saturday' }), TODAY)
    const longDay = plan.weeks[0].days.find(d => d.type === 'long')
    expect(longDay).toBeTruthy()
    expect(longDay!.day).toContain('Sat')
  })
})
