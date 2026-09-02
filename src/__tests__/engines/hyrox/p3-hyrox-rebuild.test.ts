/**
 * P3 — Hyrox engine rebuild. The review's findings: no station ever
 * reached race spec, the race simulation was unreachable on clamped
 * runways, no run→station transition training existed, and same-phase
 * weeks were byte-identical. Each is now a guaranteed property.
 */
import { describe, it, expect } from 'vitest'
import { generateHyroxPlan } from '../../../utils/planGenerator'
import { stationSpecs, stationRx, FULL_SPEC_PHRASE } from '../../../engines/hyrox/spec'
import { validatePlan } from '../../../engines/planQA/validatePlan'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'

function config(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'hyrox',
    raceName: 'Hyrox Anaheim',
    raceDate: '2026-12-05',
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5,
    longRunDay: 'Saturday',
    wearable: 'garmin',
    athleteName: 'Mike',
    age: 45,
    maxHR: 200,
    equipmentAccess: ['gym'],
    completedAt: '',
    ...overrides,
  }
}

const allDays = (plan: ReturnType<typeof generateHyroxPlan>) => plan.weeks.flatMap(w => w.days)

describe('P3.1 — race spec as data', () => {
  it('divisions carry the rulebook loads', () => {
    const open = stationSpecs('open', 'male')
    const pro = stationSpecs('pro', 'male')
    expect(open.find(s => s.key === 'sled_push')!.load).toBe('152 kg')
    expect(pro.find(s => s.key === 'sled_push')!.load).toBe('202 kg')
    expect(open.find(s => s.key === 'wall_balls')!.amount).toBe(100)
    expect(stationRx(open.find(s => s.key === 'skierg')!, 1)).toBe('SkiErg 1000m')
  })

  it('a Pro athlete gets Pro loads in the plan text', () => {
    const plan = generateHyroxPlan(config({ hyroxDivision: 'pro' }), '2026-09-01')
    const text = allDays(plan).map(d => d.detail).join('\n')
    expect(text).toContain('202 kg')
    expect(plan.race.distance).toContain('Pro')
  })
})

describe('P3.3 — key sessions scheduled by race proximity', () => {
  it('full 12-week runway: full sim 10-17 days out, half sim, and a full-spec station day all exist', () => {
    const plan = generateHyroxPlan(config(), '2026-09-01')
    const days = allDays(plan)
    expect(days.some(d => /full race simulation/i.test(d.workout))).toBe(true)
    expect(days.some(d => /half simulation/i.test(d.workout))).toBe(true)
    expect(days.filter(d => d.detail.includes(FULL_SPEC_PHRASE)).length).toBeGreaterThanOrEqual(2)
    // And the QA gate's Hyrox rules pass.
    const ids = validatePlan(plan).errors.map(e => e.id)
    expect(ids).not.toContain('qa_hyrox_simulation')
    expect(ids).not.toContain('qa_hyrox_race_spec')
  })

  it('clamped 4-week runway (the post-race splice case) STILL gets the full simulation', () => {
    // v1: peakEnd === buildEnd on short plans made the simulation
    // mathematically unreachable — the athlete met wall balls for the
    // first time on race day.
    const plan = generateHyroxPlan(config(), '2026-11-08')
    const days = allDays(plan)
    expect(days.some(d => /full race simulation/i.test(d.workout))).toBe(true)
    expect(validatePlan(plan).errors.map(e => e.id)).not.toContain('qa_hyrox_simulation')
  })
})

describe('P3.4 — compromised running is a first-class session', () => {
  it('run→station→run sessions appear in the build, with rotating stations', () => {
    const plan = generateHyroxPlan(config(), '2026-09-01')
    const sessions = allDays(plan).filter(d => d.workout === 'Compromised running')
    expect(sessions.length).toBeGreaterThanOrEqual(2)
    for (const s of sessions) expect(s.detail).toMatch(/no break between run and station/i)
    // Rotation: two different compromised sessions name different stations.
    const stationSets = new Set(sessions.map(s => s.detail.split(':')[1]))
    expect(stationSets.size).toBeGreaterThan(1)
  })

  it('a conversational compromised intro appears in the base phase (2026-08 benchmark: the Formula\'s Base block)', () => {
    const plan = generateHyroxPlan(config(), '2026-09-01')
    const intro = allDays(plan).find(d => d.workout === 'Compromised running (intro)')
    expect(intro, 'no base-phase compromised intro found').toBeDefined()
    expect(intro!.detail).toMatch(/conversational effort/)
  })

  it('race-pace km-repeat rest sits at or above the benchmarked 90s floor', () => {
    const plan = generateHyroxPlan(config(), '2026-09-01')
    const repeats = allDays(plan).filter(d => d.workout === '1km repeats')
    expect(repeats.length).toBeGreaterThan(0)
    for (const d of repeats) {
      const rec = d.plannedWorkout?.segments[1]?.recovery?.duration?.value
      if (rec != null) expect(rec, `${d.day} rest`).toBeGreaterThanOrEqual(90)
    }
  })
})

describe('P3.6 — no cloned weeks', () => {
  it('a standalone 12-week Hyrox plan has zero duplicate-week findings', () => {
    const plan = generateHyroxPlan(config(), '2026-09-01')
    const dupes = validatePlan(plan).findings.filter(f => f.id === 'qa_duplicate_weeks')
    expect(dupes).toEqual([])
  })

  it('station volumes ramp week over week toward race spec', () => {
    const plan = generateHyroxPlan(config(), '2026-09-01')
    // Pull the SkiErg metres from each station-circuit day, in order.
    const metres = allDays(plan)
      .map(d => d.detail.match(/SkiErg (\d+)m/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map(m => parseInt(m[1], 10))
    expect(metres.length).toBeGreaterThan(2)
    expect(Math.max(...metres)).toBe(1000) // reaches full race spec
    expect(Math.min(...metres)).toBeLessThan(1000) // and genuinely ramps
  })
})

describe('P3 — the whole plan passes the QA gate', () => {
  it('12-week intermediate plan generates with zero validator errors', () => {
    const plan = generateHyroxPlan(config(), '2026-09-01')
    expect(validatePlan(plan).errors.map(e => `${e.id}: ${e.detail}`)).toEqual([])
  })
})

describe('P3.1 — division and sex reach every station line (regression-safe)', () => {
  // The audit's mutation: the female branch of stationSpecs() could be
  // deleted and the suite stayed green, because the only division assertion
  // was satisfied by the sim overlays. These pin the PROGRESSIVE days.
  const rampDays = (plan: ReturnType<typeof generateHyroxPlan>) =>
    allDays(plan).filter(d => /^Station circuit/.test(d.workout))

  it("a female Open athlete's ramp days carry the women's loads, never the men's", () => {
    const plan = generateHyroxPlan(config({ sex: 'female' }), '2026-09-01')
    const days = rampDays(plan)
    expect(days.length).toBeGreaterThan(0)
    const text = days.map(d => d.detail).join('\n')
    expect(text).toContain('102 kg')          // women's Open sled push
    expect(text).not.toContain('152 kg')      // men's Open sled push
    expect(text).toContain('4 kg to 2.7 m')   // women's wall ball
  })

  it("a Pro (male) athlete's ramp days carry Pro loads, never Open", () => {
    const plan = generateHyroxPlan(config({ hyroxDivision: 'pro' }), '2026-09-01')
    const text = rampDays(plan).map(d => d.detail).join('\n')
    expect(text).toContain('202 kg')
    expect(text).not.toContain('152 kg')
  })

  it("race-week 'Light station practice' renders from the athlete's spec, not the default", () => {
    // v1 called getHyroxWorkoutByRole without `specs` in race week, so every
    // woman was told to use a 6 kg ball to 3.0 m the week of her race.
    const plan = generateHyroxPlan(config({ sex: 'female' }), '2026-09-01')
    const raceWeek = plan.weeks[plan.weeks.length - 1]
    const practice = raceWeek.days.find(d => d.workout === 'Light station practice')
    expect(practice, 'race week should carry a light station practice').toBeDefined()
    expect(practice!.detail).toContain('4 kg to 2.7 m')
    expect(practice!.detail).not.toContain('6 kg to 3.0 m')
  })

  it('an unset sex is never silent — the plan says which load table it assumed', () => {
    const unset = generateHyroxPlan(config(), '2026-09-01')
    expect(unset.advisories?.some(a => a.id === 'hyrox_loads_assumed')).toBe(true)
    const female = generateHyroxPlan(config({ sex: 'female' }), '2026-09-01')
    expect(female.advisories?.some(a => a.id === 'hyrox_loads_assumed')).toBe(false)
    const male = generateHyroxPlan(config({ sex: 'male' }), '2026-09-01')
    expect(male.advisories?.some(a => a.id === 'hyrox_loads_assumed')).toBe(false)
  })
})

// ── P3.3 / P3.4 — key-session placement vs recovery weeks, and the
// compromised-running holes the verified audit reproduced ────────────
const MONDAY = '2026-09-07'
function saturdayWeeksOut(weeks: number): string {
  const d = new Date(`${MONDAY}T12:00:00`)
  d.setDate(d.getDate() + weeks * 7 - 2) // the Saturday that ends week N
  return d.toISOString().slice(0, 10)
}
const raceEffort = (plan: ReturnType<typeof generateHyroxPlan>) =>
  allDays(plan).filter(d => /^Compromised running(?! \(intro\))/.test(d.workout))
const KEY = /full race simulation|half simulation|^Full-distance stations/i

describe('P3.3 — a deload never wraps a key session (every level, runway 5-18, masters too)', () => {
  const personas: Partial<OnboardingConfig>[] = [
    { experienceLevel: 'intermediate', trainingDaysPerWeek: 5, age: 45 },
    { experienceLevel: 'first_timer', trainingDaysPerWeek: 3, age: 30 },
    { experienceLevel: 'elite', trainingDaysPerWeek: 7, age: 33 },
    { experienceLevel: 'beginner', trainingDaysPerWeek: 3, age: 61 }, // masters cadence 3
    { experienceLevel: 'advanced', trainingDaysPerWeek: 6, age: 58 },
  ]
  for (const persona of personas) {
    it(`${persona.experienceLevel} ${persona.trainingDaysPerWeek}d age ${persona.age}: no sim or spec day inside a RECOVERY WEEK, at any runway`, () => {
      for (let weeks = 5; weeks <= 18; weeks++) {
        const plan = generateHyroxPlan(config({ ...persona, raceDate: saturdayWeeksOut(weeks) }), MONDAY)
        for (const w of plan.weeks) {
          if (!/RECOVERY WEEK/.test(w.focus)) continue
          const collision = w.days.find(d => KEY.test(d.workout))
          expect(collision, `${weeks}wk week ${w.num} carries ${collision?.workout}`).toBeUndefined()
        }
        const ids = validatePlan(plan).errors.map(e => e.id)
        expect(ids, `${weeks}wk`).not.toContain('qa_hyrox_key_in_recovery')
        expect(ids, `${weeks}wk`).not.toContain('qa_hyrox_compromised_missing')
        // The full simulation still exists — moving a deload never costs the sim.
        expect(allDays(plan).some(d => /full race simulation/i.test(d.workout)), `${weeks}wk sim`).toBe(true)
      }
    })
  }

  it('recovery weeks that do not collide stay exactly where the template puts them', () => {
    // 12-week intermediate, race Saturday: sims in weeks 9-10, spec day
    // before them — the template [4, 8] must survive untouched.
    const plan = generateHyroxPlan(config({ raceDate: saturdayWeeksOut(12) }), MONDAY)
    expect(plan.weeks.filter(w => /RECOVERY WEEK/.test(w.focus)).map(w => w.num)).toEqual([4, 8])
  })
})

describe('P3.4 — compromised running reaches every layout and runway', () => {
  it('3-day athletes get the run→station session AND the full-spec station day', () => {
    const plan = generateHyroxPlan(config({ experienceLevel: 'first_timer', trainingDaysPerWeek: 3, raceDate: saturdayWeeksOut(12) }), MONDAY)
    expect(raceEffort(plan).length).toBeGreaterThanOrEqual(1)
    expect(allDays(plan).some(d => /^Full-distance stations/.test(d.workout))).toBe(true)
    // The 3-day variant still carries the strength block the day replaced.
    expect(raceEffort(plan)[0].detail).toMatch(/Then 20 min of the strength block/)
  })

  it('5- and 7-week runways carry at least one race-effort session at every level (v1: zero)', () => {
    for (const level of ['first_timer', 'beginner', 'intermediate', 'advanced', 'elite'] as const) {
      for (const weeks of [5, 7]) {
        for (const days of [3, 4, 5]) {
          const plan = generateHyroxPlan(config({ experienceLevel: level, trainingDaysPerWeek: days, raceDate: saturdayWeeksOut(weeks) }), MONDAY)
          expect(raceEffort(plan).length, `${level} ${days}d ${weeks}wk`).toBeGreaterThanOrEqual(1)
        }
      }
    }
  })

  it('a long runway adds race-effort sessions, not only conversational intros', () => {
    const plan = generateHyroxPlan(config({ experienceLevel: 'advanced', trainingDaysPerWeek: 5, age: 35, raceDate: saturdayWeeksOut(18) }), MONDAY)
    expect(raceEffort(plan).length).toBeGreaterThanOrEqual(2)
    expect(allDays(plan).some(d => d.workout === 'Compromised running (intro)')).toBe(true)
  })

  it('the race-effort session never lands in a recovery week (the old odd-index cadence collided)', () => {
    const plan = generateHyroxPlan(config({ raceDate: saturdayWeeksOut(12) }), MONDAY)
    for (const w of plan.weeks) {
      if (!/RECOVERY WEEK/.test(w.focus)) continue
      expect(w.days.some(d => /^Compromised running/.test(d.workout)), `week ${w.num}`).toBe(false)
    }
  })

  it('clamped 4-week runway still meets every station at spec before the sims', () => {
    const plan = generateHyroxPlan(config(), '2026-11-08')
    const spec = allDays(plan).find(d => /^Full-distance stations/.test(d.workout))
    expect(spec, 'no full-spec station day on the 4-week plan').toBeDefined()
    expect(plan.advisories?.some(a => a.id === 'hyrox_no_spec_day')).toBe(false)
  })
})

describe('P3.3 / P3.4 — the QA gate errors on the defects (regression-safe)', () => {
  it('qa_hyrox_key_in_recovery fires when a simulation is moved into a recovery week', () => {
    const plan = generateHyroxPlan(config({ raceDate: saturdayWeeksOut(12) }), MONDAY)
    const recovery = plan.weeks.find(w => /RECOVERY WEEK/.test(w.focus))!
    const simWeek = plan.weeks.find(w => w.days.some(d => /full race simulation/i.test(d.workout)))!
    const sim = simWeek.days.find(d => /full race simulation/i.test(d.workout))!
    const long = recovery.days.find(d => d.type === 'run' && /long/i.test(d.workout)) ?? recovery.days[recovery.days.length - 2]
    const tampered = {
      ...plan,
      weeks: plan.weeks.map(w => w.num === recovery.num
        ? { ...w, days: w.days.map(d => d === long ? { ...d, workout: sim.workout, detail: sim.detail } : d) }
        : w),
    }
    expect(validatePlan(tampered).errors.map(e => e.id)).toContain('qa_hyrox_key_in_recovery')
    expect(validatePlan(plan).errors.map(e => e.id)).not.toContain('qa_hyrox_key_in_recovery')
  })

  it('qa_hyrox_compromised_missing fires when every race-effort session is stripped', () => {
    const plan = generateHyroxPlan(config({ raceDate: saturdayWeeksOut(12) }), MONDAY)
    const tampered = {
      ...plan,
      weeks: plan.weeks.map(w => ({
        ...w,
        days: w.days.map(d => /^Compromised running(?! \(intro\))/.test(d.workout)
          ? { ...d, workout: 'Station circuit (4 stations)' }
          : d),
      })),
    }
    expect(validatePlan(tampered).errors.map(e => e.id)).toContain('qa_hyrox_compromised_missing')
    expect(validatePlan(plan).errors.map(e => e.id)).not.toContain('qa_hyrox_compromised_missing')
  })
})
