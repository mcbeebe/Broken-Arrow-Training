import { describe, it, expect } from 'vitest'
import { generateHyroxPlan, generateTrailPlan, generateGeneralPlan } from '../utils/planGenerator'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import type { WorkoutType } from '../types'

const VALID_TYPES: WorkoutType[] = [
  'strength', 'run', 'quality', 'long', 'cross', 'rest', 'limited', 'travel', 'race',
]

function makeConfig(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'trail',
    raceName: 'Half Marathon',
    raceDate: '2026-09-15',
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 4,
    longRunDay: 'Saturday',
    wearable: 'none',
    athleteName: 'Test Athlete',
    age: 35,
    completedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('generateTrailPlan', () => {
  it('creates a valid plan with weeks of 7 days', () => {
    const plan = generateTrailPlan(makeConfig())
    expect(plan.weeks.length).toBeGreaterThan(0)
    plan.weeks.forEach(w => {
      expect(w.days).toHaveLength(7)
      w.days.forEach(d => {
        expect(VALID_TYPES).toContain(d.type)
        expect(d.day).toBeTruthy()
      })
    })
  })

  it('parses 5K into a short race spec', () => {
    const plan = generateTrailPlan(makeConfig({ raceName: '5K Fun Run', raceType: 'trail' }))
    expect(plan.race.distanceMiles).toBeCloseTo(3.1, 1)
    expect(plan.race.distance).toContain('5K')
  })

  it('parses Marathon into a long race spec', () => {
    const plan = generateTrailPlan(makeConfig({ raceName: 'Boston Marathon' }))
    expect(plan.race.distanceMiles).toBeCloseTo(26.2, 1)
    expect(plan.race.distance).toContain('Marathon')
  })

  it('parses Half Marathon correctly (not full marathon)', () => {
    const plan = generateTrailPlan(makeConfig({ raceName: 'Half Marathon Challenge' }))
    expect(plan.race.distanceMiles).toBeCloseTo(13.1, 1)
  })

  it('parses ultra distances', () => {
    const plan = generateTrailPlan(makeConfig({ raceName: 'Western States 100 Mile' }))
    expect(plan.race.distanceMiles).toBe(100)
  })

  it('has a race day on the configured long run day in the final week', () => {
    const plan = generateTrailPlan(makeConfig({ longRunDay: 'Saturday' }))
    const lastWeek = plan.weeks[plan.weeks.length - 1]
    const raceDay = lastWeek.days.find(d => d.type === 'race')
    expect(raceDay).toBeTruthy()
    expect(raceDay!.day).toMatch(/Sat/)
  })

  it('respects training days per week (4 days)', () => {
    const plan = generateTrailPlan(makeConfig({ trainingDaysPerWeek: 4 }))
    const week = plan.weeks[2] // not race week
    const trainingCount = week.days.filter(d => d.type !== 'rest').length
    expect(trainingCount).toBe(4)
  })

  it('respects training days per week (6 days)', () => {
    const plan = generateTrailPlan(makeConfig({ trainingDaysPerWeek: 6 }))
    const week = plan.weeks[2]
    const trainingCount = week.days.filter(d => d.type !== 'rest').length
    expect(trainingCount).toBe(6)
  })

  it('long run mileage progresses across weeks', () => {
    const plan = generateTrailPlan(makeConfig({ raceName: 'Marathon', experienceLevel: 'intermediate' }))
    const longDays = plan.weeks.map(w => {
      const long = w.days.find(d => d.type === 'long' || d.type === 'race')
      const mi = long?.zone.match(/(\d+(\.\d+)?)\s*mi/)
      return mi ? parseFloat(mi[1]) : 0
    })
    // Peak should be in the last third of the plan
    const peak = Math.max(...longDays)
    const peakIdx = longDays.indexOf(peak)
    expect(peakIdx).toBeGreaterThan(longDays.length / 2)
    expect(peak).toBeGreaterThan(longDays[0])
  })

  it('generates a longer plan for first-timers vs elites', () => {
    const firstTimer = generateTrailPlan(makeConfig({ experienceLevel: 'first_timer' }))
    const elite = generateTrailPlan(makeConfig({ experienceLevel: 'elite' }))
    expect(firstTimer.weeks.length).toBeGreaterThan(elite.weeks.length)
  })

  it('uses trail gear for skyrace, road gear for road race', () => {
    const trail = generateTrailPlan(makeConfig({ raceName: 'Broken Arrow Skyrace 23K' }))
    const road = generateTrailPlan(makeConfig({ raceName: 'Half Marathon City Race', raceType: 'trail' }))
    const trailHasPoles = trail.race.gear.some(g => /poles/i.test(g.item))
    const roadHasPoles = road.race.gear.some(g => /poles/i.test(g.item))
    expect(trailHasPoles).toBe(true)
    expect(roadHasPoles).toBe(false)
  })

  it('parses generic NK distances like 11K', () => {
    const plan = generateTrailPlan(makeConfig({ raceName: 'Broken Arrow 11K' }))
    expect(plan.race.distanceMiles).toBeCloseTo(6.8, 0)
  })
})

describe('generateGeneralPlan', () => {
  it('creates 12 weeks with 7 days each', () => {
    const plan = generateGeneralPlan(makeConfig({ raceType: 'general', raceName: 'Summer Block' }))
    expect(plan.weeks).toHaveLength(12)
    plan.weeks.forEach(w => {
      expect(w.days).toHaveLength(7)
    })
  })

  it('marks every 4th week as recovery', () => {
    const plan = generateGeneralPlan(makeConfig({ raceType: 'general', raceName: 'Summer Block' }))
    expect(plan.weeks[3].focus).toMatch(/RECOVERY/i)
    expect(plan.weeks[7].focus).toMatch(/RECOVERY/i)
    expect(plan.weeks[11].focus).toMatch(/RECOVERY/i)
  })

  it('respects training days per week', () => {
    const plan = generateGeneralPlan(makeConfig({ raceType: 'general', raceName: 'Block', trainingDaysPerWeek: 5 }))
    const week = plan.weeks[0]
    const trainingCount = week.days.filter(d => d.type !== 'rest').length
    expect(trainingCount).toBe(5)
  })

  it('uses athlete name and HR zones from config', () => {
    const plan = generateGeneralPlan(makeConfig({ raceType: 'general', raceName: 'Block', athleteName: 'Pat', maxHR: 180 }))
    expect(plan.athlete.name).toBe('Pat')
    expect(plan.athlete.maxHR).toBe(180)
  })
})

describe('generateHyroxPlan (regression)', () => {
  it('still produces valid weeks', () => {
    const plan = generateHyroxPlan(makeConfig({ raceType: 'hyrox', raceName: 'Hyrox SF', weakStation: 'Wall Balls' }))
    expect(plan.weeks.length).toBeGreaterThan(0)
    plan.weeks.forEach(w => expect(w.days).toHaveLength(7))
  })
})
