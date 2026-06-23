/**
 * R1 (PR-2) — the generated plan actually prescribes climbing + descending for a
 * climby race, scaled and recurring correctly, and prescribes NONE of it for a
 * flat race. These are the "apply" + "guard" + "engine-wiring" proofs.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../engines/planGenerator/generatePlan'
import {
  longRunVertTargetFt, isDownhillWeek, applyVertPrescription, DOWNHILL_GRADE,
} from '../../engines/planGenerator/vertPrescription'
import { eccentricScore } from '../../engines/descent/eccentric'
import {
  allDays, daysMatching, dayVertFt, weeklyVertFt, weeksWith,
} from '../helpers/planAssert'
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import type { TrainingMethod } from '../../types/training-method'
import type { PlannedDay } from '../../types'
import koopMethod from '../../data/methods/koop.json'
import danielsMethod from '../../data/methods/daniels.json'

const koop = koopMethod as unknown as TrainingMethod
const daniels = danielsMethod as unknown as TrainingMethod
const TODAY = '2026-06-14'

function cfg(o: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'trail', raceName: 'X', raceDate: '2026-12-26',
    raceDistance: '100_mile', experienceLevel: 'advanced',
    trainingDaysPerWeek: 6, currentWeeklyMileage: 45, wearable: 'none',
    athleteName: 'T', age: 34, completedAt: '', ...o,
  }
}
// Climby 100-miler: 20,000 ft / 100 mi = 200 ft/mi (Colossal).
const climby = cfg({ elevationGainFt: 20000 })
// Flat road marathon — the guard.
const flat: OnboardingConfig = {
  raceType: 'road', raceName: 'Flat', raceDate: '2026-10-18', raceDistance: 'marathon',
  raceDescription: 'pancake-flat road marathon', experienceLevel: 'intermediate',
  trainingDaysPerWeek: 5, currentWeeklyMileage: 30, wearable: 'none',
  athleteName: 'T', age: 35, completedAt: '',
}

describe('R1 — climbing prescription (apply)', () => {
  const plan = generatePlanFromMethod(koop, climby, TODAY)

  it('emits vert targets on long-run days', () => {
    const vertLongs = allDays(plan).filter(d => d.type === 'long' && dayVertFt(d) > 0)
    expect(vertLongs.length).toBeGreaterThan(0)
  })
  it('ramps vert toward the peak (max > the first non-zero week)', () => {
    const series = weeklyVertFt(plan)
    const firstNonZero = series.find(v => v > 0) ?? 0
    expect(Math.max(...series)).toBeGreaterThan(firstNonZero)
  })
  it('eases vert in the taper (taper < peak)', () => {
    const taperWeeks = plan.weeks.filter(w => w.focus === 'Taper')
    const taperVert = Math.max(0, ...taperWeeks.flatMap(w => w.days.map(dayVertFt)))
    expect(taperVert).toBeLessThan(Math.max(...weeklyVertFt(plan)))
  })
})

describe('R1 — descending prescription (apply + engine-wiring)', () => {
  const plan = generatePlanFromMethod(koop, climby, TODAY)
  const dhWeeks = weeksWith(plan, /downhill/i)

  it('schedules downhill / quad-seasoning sessions', () => {
    expect(dhWeeks.length).toBeGreaterThan(0)
  })
  it('recurs at least every 2 weeks (≤14-day repeated-bout window)', () => {
    let maxGap = 0
    for (let i = 1; i < dhWeeks.length; i++) maxGap = Math.max(maxGap, dhWeeks[i] - dhWeeks[i - 1])
    expect(maxGap).toBeLessThanOrEqual(2)
  })
  it('never schedules downhill work in the taper', () => {
    const taperNums = plan.weeks.filter(w => w.focus === 'Taper').map(w => w.num)
    expect(dhWeeks.some(n => taperNums.includes(n))).toBe(false)
  })
  it('draws the eccentric load from the descent engine, not a literal', () => {
    const dh = daysMatching(plan, /downhill/i)[0]
    expect(dh.detail).toContain(`eccentric load ${eccentricScore(DOWNHILL_GRADE).toFixed(1)}/5`)
  })
})

describe('R1 — flat race GUARD (not applied)', () => {
  const plan = generatePlanFromMethod(daniels, flat, TODAY)

  it('prescribes zero vert', () => {
    expect(weeklyVertFt(plan).every(v => v === 0)).toBe(true)
  })
  it('prescribes zero downhill sessions', () => {
    expect(weeksWith(plan, /downhill/i)).toEqual([])
  })
})

describe('R1 — unit', () => {
  const base = { vertFtPerMile: 200, isClimby: true, longRunMi: 20, isTaper: false, peakWeekIndex: 20 }
  it('longRunVertTargetFt scales + rounds to 50 ft, and is 0 when flat', () => {
    expect(longRunVertTargetFt({ ...base, weekIndex: 20 })).toBe(Math.round((200 * 20 * 1) / 50) * 50)
    expect(longRunVertTargetFt({ ...base, isClimby: false, weekIndex: 20 })).toBe(0)
  })
  it('peak-week vert ≥ an early-week vert (ramp)', () => {
    expect(longRunVertTargetFt({ ...base, weekIndex: 20 }))
      .toBeGreaterThanOrEqual(longRunVertTargetFt({ ...base, weekIndex: 4 }))
  })
  it('isDownhillWeek: in build/peak only, every 2nd week, none in taper', () => {
    expect(isDownhillWeek({ ...base, weekIndex: 20 })).toBe(true)   // peak
    expect(isDownhillWeek({ ...base, weekIndex: 18 })).toBe(true)   // 2 back
    expect(isDownhillWeek({ ...base, weekIndex: 19 })).toBe(false)  // odd offset
    expect(isDownhillWeek({ ...base, weekIndex: 20, isTaper: true })).toBe(false)
    expect(isDownhillWeek({ ...base, weekIndex: 1 })).toBe(false)   // early base
  })
  it('applyVertPrescription leaves a flat week untouched', () => {
    const days: PlannedDay[] = [{ day: 'Sun 1/4', type: 'long', workout: 'Long run', detail: 'Long run ~20 mi · Z2', zone: 'Z2', route: '', time: '' }]
    const out = applyVertPrescription(days, { ...base, isClimby: false, weekIndex: 10 })
    expect(out[0].detail).toBe(days[0].detail)
  })
})
