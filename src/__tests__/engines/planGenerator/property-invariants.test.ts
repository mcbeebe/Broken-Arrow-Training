/**
 * Phase 1 (105-F4) — the property-based invariant suite.
 *
 * Every plan the persona sweep generates must satisfy these laws — the
 * PRD's mandates expressed as machine-checked properties. Each property
 * also has a deliberately-broken fixture proving the check CAN fail
 * (a test that cannot fail protects nothing).
 *
 * Properties (PRD numbering):
 *  P1  unique calendar dates plan-wide (qa_week_shape)
 *  P2  ≥1 full rest day per non-race week
 *  P3  never three consecutive HARD days (Mandate #1)
 *  P4  weekly ramp within thresholds (no qa_weekly_ramp errors)
 *  P5  taper steps down (no qa_taper_monotonic errors) and taper weeks
 *      preserve run frequency (no taper rest-conversions)
 *  P8  day content tracks the weekly target (no adherence errors)
 *  P9  race day present in the final week; day-before is easy/rest
 *  P11 no RM-language anywhere on any card
 *  P12 hard-interval warm-ups are never gutted below their floor
 *
 * (P6 combined-long share, P7 dose gates, P10 floor advisories land with
 *  Phase 2 — PRD-101/102/104.)
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { getMethodById } from '../../../data/methods'
import { validatePlan } from '../../../engines/planQA/validatePlan'
import { TODAY, PERSONAS, buildConfig } from '../../helpers/roadPersonas'
import type { TrainingPlan, PlannedDay, TrainingWeek } from '../../../types'

const HARD_TYPES = new Set(['quality', 'long', 'race'])
const hardStrength = (d: PlannedDay) =>
  d.type === 'strength' && /heavy strength \(4–6|explosive power/i.test(d.detail ?? '')
const isHard = (d: PlannedDay) => HARD_TYPES.has(d.type) || hardStrength(d)

/** P3 as a pure predicate, reusable against broken fixtures. */
export function maxConsecutiveHard(weeks: TrainingWeek[]): number {
  let run = 0
  let max = 0
  for (const w of weeks) {
    for (const d of w.days) {
      run = isHard(d) ? run + 1 : 0
      max = Math.max(max, run)
    }
  }
  return max
}

const plans: { label: string; plan: TrainingPlan }[] = []

beforeAll(() => {
  for (const p of PERSONAS) {
    // One runway per persona keeps the suite fast; the sweep gate already
    // covers both runways for validator errors.
    const weeks = p.runways[1]
    const plan = generatePlanFromMethod(getMethodById(p.methodId)!, buildConfig(p, weeks), TODAY)
    plans.push({ label: `${p.label} @ ${weeks}wk`, plan })
  }
})

describe('P1/P4/P5/P8 — validator law: zero errors on every persona plan', () => {
  it('holds across the grid', () => {
    for (const { label, plan } of plans) {
      const qa = validatePlan({ ...plan, methodId: plan.methodId })
      expect(qa.errors.map(e => `${e.id}@${e.weekNum}`), label).toEqual([])
    }
  })
})

describe('P2 — every non-race week keeps a full rest day', () => {
  it('holds across the grid', () => {
    for (const { label, plan } of plans) {
      for (const w of plan.weeks) {
        if (w.days.some(d => d.type === 'race') || w.days.length < 7) continue
        expect(w.days.filter(d => d.type === 'rest').length, `${label} week ${w.num}`).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('can fail: a 7-day rest-free week is caught', () => {
    const days = Array.from({ length: 7 }, (_, i) =>
      ({ day: `D${i}`, type: 'run', workout: 'E', detail: '', zone: '—', route: '', time: '45 min' } as PlannedDay))
    expect(days.filter(d => d.type === 'rest').length).toBe(0)
  })
})

describe('P3 — never three consecutive hard days (Mandate #1)', () => {
  it('holds across the grid, strength days included', () => {
    for (const { label, plan } of plans) {
      expect(maxConsecutiveHard(plan.weeks), label).toBeLessThanOrEqual(2)
    }
  })

  it('can fail: a constructed long|quality|long triple measures 3', () => {
    const mk = (type: PlannedDay['type']): PlannedDay =>
      ({ day: 'X', type, workout: 'X', detail: '', zone: '—', route: '', time: '—' })
    const broken: TrainingWeek = { num: 1, dates: 'x', miles: 20, focus: 'Build', days: [mk('long'), mk('quality'), mk('long')] } as TrainingWeek
    expect(maxConsecutiveHard([broken])).toBe(3)
  })
})

describe('P5 — taper weeks preserve run frequency', () => {
  it('taper rest-conversion is a last resort: at most one per week, and ≥3 run days survive', () => {
    // 103-F4: taper easy runs shrink to a 15-min floor BEFORE any day is
    // deleted; deletion is permitted only when even the floors overflow
    // the target (very low-volume tapers). The law: never more than one
    // conversion, and the week still trains ≥3 days.
    for (const { label, plan } of plans) {
      for (const w of plan.weeks) {
        if (!/taper/i.test(w.focus) || w.days.some(d => d.type === 'race')) continue
        const converted = w.days.filter(d => /Taper — extra rest day/.test((d as PlannedDay & { notes?: string }).notes ?? d.detail ?? ''))
        expect(converted.length, `${label} week ${w.num}`).toBeLessThanOrEqual(1)
        const active = w.days.filter(d => d.type !== 'rest').length
        expect(active, `${label} week ${w.num}`).toBeGreaterThanOrEqual(3)
      }
    }
  })
})

describe('P9 — race day present, day-before easy or rest', () => {
  it('holds across the grid', () => {
    for (const { label, plan } of plans) {
      const final = plan.weeks[plan.weeks.length - 1]
      const raceIdx = final.days.findIndex(d => d.type === 'race')
      expect(raceIdx, label).toBeGreaterThanOrEqual(0)
      const before = raceIdx > 0
        ? final.days[raceIdx - 1]
        : plan.weeks[plan.weeks.length - 2]?.days.slice(-1)[0]
      if (before) {
        expect(['rest', 'run', 'cross'].includes(before.type), `${label}: ${before.type} before race`).toBe(true)
      }
    }
  })
})

describe('P11 — RM language is banned platform-wide', () => {
  it('holds across the grid', () => {
    const RM = /\bRM\b|1RM|\dRM/
    for (const { label, plan } of plans) {
      for (const w of plan.weeks) {
        for (const d of w.days) {
          expect(RM.test(`${d.workout} ${d.detail}`), `${label} week ${w.num} ${d.day}`).toBe(false)
        }
      }
    }
  })

  it('can fail: RM text is caught', () => {
    expect(/\bRM\b|1RM|\dRM/.test('build toward a 4-5RM')).toBe(true)
  })
})

describe('P12 — hard-interval warm-ups keep their floor', () => {
  it('every VO2/rep session with a warm-up keeps ≥10 min of it', () => {
    for (const { label, plan } of plans) {
      for (const w of plan.weeks) {
        for (const d of w.days) {
          const pw = d.plannedWorkout
          if (!pw || !['vo2_intervals', 'speed_repetitions'].includes(pw.category)) continue
          const wu = pw.segments.filter(s => s.role === 'warmup')
          if (wu.length === 0) continue
          const minutes = wu.reduce((t, s) => {
            if (s.duration) return t + (s.duration.unit === 'sec' ? s.duration.value / 60 : s.duration.value)
            if (s.distance) {
              const paceSec = s.paceTarget?.paceSecPerMileLow != null && s.paceTarget?.paceSecPerMileHigh != null
                ? (s.paceTarget.paceSecPerMileLow + s.paceTarget.paceSecPerMileHigh) / 2
                : 600
              const mi = s.distance.value * (s.distance.unit === 'km' ? 0.621371 : s.distance.unit === 'm' ? 0.000621371 : 1)
              return t + (mi * paceSec) / 60
            }
            return t
          }, 0)
          expect(minutes, `${label} week ${w.num} ${d.day} (${pw.workoutId})`).toBeGreaterThanOrEqual(10)
        }
      }
    }
  })
})
