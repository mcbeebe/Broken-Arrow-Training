/**
 * P0 correctness hotfixes — regression tests for the defects found in the
 * 2026-08-16 generated plan review (docs: product plan, P0.3 / P0.5).
 * The Mike scenario: Roche SWAP, half marathon, easy-pace anchor 9:30/mi.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import type { TrainingMethod } from '../../../types/training-method'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import rocheMethod from '../../../data/methods/roche_swap.json'

const roche = rocheMethod as unknown as TrainingMethod
const TODAY = '2026-08-16'

function mikeConfig(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'trail',
    raceName: 'Oakland Hills Trail Run',
    raceDate: '2026-10-24', // 10 weeks out — reproduces the v1 runway
    raceDistance: 'half_marathon',
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

const parseTime = (t: string): [number, number] => {
  const range = t.match(/(\d+)-(\d+)\s*min/)
  if (range) return [parseInt(range[1]), parseInt(range[2])]
  const single = t.match(/(\d+)\s*min/)
  return single ? [parseInt(single[1]), parseInt(single[1])] : [0, 0]
}

/** Total minutes implied by a workout's steps (reps and timed recoveries included). */
function stepTotalMinutes(pw: NonNullable<import('../../../types').PlannedDay['plannedWorkout']>): number | null {
  let total = 0
  let hasDuration = false
  for (const s of pw.segments) {
    if (!s.duration) continue
    hasDuration = true
    const per = s.duration.unit === 'sec' ? s.duration.value / 60 : s.duration.value
    const reps = s.reps ?? 1
    total += per * reps
    if (s.reps && s.recovery?.duration) {
      const rec = s.recovery.duration
      total += (rec.unit === 'sec' ? rec.value / 60 : rec.value) * s.reps
    }
  }
  return hasDuration ? total : null
}

describe('P0.1 — one duration per session', () => {
  it('step durations agree with the header time on every running day (v1 bug: header 42-50 min over a 150 min step)', () => {
    const plan = generatePlanFromMethod(roche, mikeConfig(), TODAY)
    for (const week of plan.weeks) {
      for (const d of week.days) {
        if (!d.plannedWorkout || !d.time) continue
        const [lo, hi] = parseTime(d.time)
        if (lo === 0) continue
        const total = stepTotalMinutes(d.plannedWorkout)
        if (total == null) continue
        const label = `${week.focus} ${d.day} "${d.workout}": header ${d.time}, steps ${Math.round(total)} min`
        expect(total, label).toBeGreaterThanOrEqual(lo * 0.9 - 1)
        expect(total, label).toBeLessThanOrEqual(hi * 1.1 + 1)
      }
    }
  })
})

describe('P0.3 — no method-wide placeholder duration ranges', () => {
  it('never emits a duration range wider than 1.5x on any running day', () => {
    const plan = generatePlanFromMethod(roche, mikeConfig(), TODAY)
    for (const week of plan.weeks) {
      for (const day of week.days) {
        if (!day.time || !day.plannedWorkout) continue
        const [lo, hi] = parseTime(day.time)
        if (lo === 0) continue
        expect(hi / lo, `${week.focus} ${day.day} "${day.workout}" shows ${day.time}`).toBeLessThanOrEqual(1.5)
      }
    }
  })

  it('the v1 "30-90 min" Wednesday bug does not reproduce', () => {
    const plan = generatePlanFromMethod(roche, mikeConfig(), TODAY)
    const offenders = plan.weeks.flatMap(w =>
      w.days.filter(d => d.time === '30-90 min').map(d => `${w.focus} ${d.day}`))
    expect(offenders).toEqual([])
  })
})

describe('P0.2 — weekly totals include quality sessions', () => {
  it('displayed miles are the summed prescription, not the easy+long-only target', () => {
    const plan = generatePlanFromMethod(roche, mikeConfig(), TODAY)
    for (const w of plan.weeks) expect(Number(w.miles)).toBeGreaterThan(0)
    // Build weeks carry AnT / 30-30 / hill sessions that the v1 display
    // silently excluded — the truthful sum must exceed the target budget
    // (which only easy + long runs consume) in at least one build week.
    const buildWeeks = plan.weeks.filter(w => !/taper|cutback/i.test(w.focus))
    const hidden = buildWeeks.filter(w => Number(w.miles) > (w.targetMi ?? Infinity) + 2)
    expect(hidden.length).toBeGreaterThan(0)
  })
})

describe('P0.5 — taper volume sanity', () => {
  it('taper weeks never exceed the final build week and step down monotonically', () => {
    const plan = generatePlanFromMethod(roche, mikeConfig(), TODAY)
    const weeks = plan.weeks
    const taperStart = weeks.findIndex(w => /taper/i.test(w.focus))
    expect(taperStart).toBeGreaterThan(0)
    let prev = Number(weeks[taperStart - 1].miles)
    for (let i = taperStart; i < weeks.length; i++) {
      const mi = Number(weeks[i].miles)
      expect(mi, `week ${i + 1} (${weeks[i].focus})`).toBeLessThanOrEqual(prev + 0.01)
      prev = mi
    }
  })
})
