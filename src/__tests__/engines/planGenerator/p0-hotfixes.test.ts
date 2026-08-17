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

describe('P0.4 — race-week scheduling', () => {
  // Race days across all 7 weekdays: Mon 2026-10-19 .. Sun 2026-10-25.
  const raceDates = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']

  it.each(raceDates)('D-1 is rest or a ≤25 min shakeout, and D-2 carries no quality (race %s)', raceDate => {
    const plan = generatePlanFromMethod(roche, mikeConfig({ raceDate }), TODAY)
    const lastWeek = plan.weeks[plan.weeks.length - 1]
    const raceIdx = lastWeek.days.findIndex(d => d.type === 'race')
    expect(raceIdx, `race day present for ${raceDate}`).toBeGreaterThanOrEqual(0)

    const dayBefore = raceIdx > 0 ? lastWeek.days[raceIdx - 1] : undefined
    if (dayBefore && dayBefore.type !== 'rest') {
      expect(dayBefore.type, 'D-1 must be rest or an easy shakeout').toBe('run')
      const [, hi] = parseTime(dayBefore.time)
      expect(hi, `D-1 "${dayBefore.workout}" shows ${dayBefore.time}`).toBeLessThanOrEqual(25)
    }
    const twoBefore = raceIdx > 1 ? lastWeek.days[raceIdx - 2] : undefined
    if (twoBefore) {
      expect(twoBefore.type, `D-2 "${twoBefore.workout}" must not be quality`).not.toBe('quality')
      expect(twoBefore.type, 'D-2 must not be a long run').not.toBe('long')
    }
  })
})

describe('P0.6 — one zone system, no dead bands', () => {
  it('plan zones tile the HR spectrum with no gaps (v1: 155-162 bpm belonged to no zone)', () => {
    const plan = generatePlanFromMethod(roche, mikeConfig(), TODAY)
    const parse = (hr: string) => {
      const m = hr.match(/(\d+)\s*[–-]\s*(\d+)/)
      return m ? { low: parseInt(m[1]), high: parseInt(m[2]) } : null
    }
    const bands = plan.zones.map(z => parse(z.hr)).filter((b): b is { low: number; high: number } => !!b)
    expect(bands.length).toBe(plan.zones.length)
    for (let i = 0; i < bands.length - 1; i++) {
      expect(bands[i + 1].low, `${plan.zones[i].zone} tops at ${bands[i].high}, ${plan.zones[i + 1].zone} starts at ${bands[i + 1].low}`)
        .toBe(bands[i].high + 1)
    }
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
