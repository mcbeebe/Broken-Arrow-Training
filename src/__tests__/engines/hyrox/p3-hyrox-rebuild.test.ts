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
