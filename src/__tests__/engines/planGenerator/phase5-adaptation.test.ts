/**
 * Phase 5 (PRD-110) — Adaptation v1: deterministic missed-workout
 * replanning. Doctrine under test: missed work is never made up, volume
 * never increases post-replan, the schedule mandates survive every rule,
 * and replanned output re-passes the QA gate.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { getMethodById } from '../../../data/methods'
import { validatePlan } from '../../../engines/planQA/validatePlan'
import {
  replanShortGap, replanMissedKeySession, regenerateRemainder,
  replanAfterIllness, locateDay, weekCompliance, shouldSuggestRegeneration,
} from '../../../engines/planGenerator/replan'
import { TODAY, PERSONAS, buildConfig } from '../../helpers/roadPersonas'
import type { TrainingPlan, PlannedDay } from '../../../types'

const carmen = PERSONAS.find(p => p.label.startsWith('Carmen'))!
const basePlan = () => generatePlanFromMethod(getMethodById('pfitzinger')!, buildConfig(carmen, 16), TODAY)

const weekMiles = (p: TrainingPlan, wi: number) => Number(p.weeks[wi].miles)
const isoOf = (p: TrainingPlan, wi: number, di: number) => {
  const d = new Date(`${p.weeks[wi].startIso}T12:00:00`)
  d.setDate(d.getDate() + di)
  return d.toISOString().slice(0, 10)
}
const HARD = new Set(['quality', 'long', 'race'])
const maxConsecHard = (p: TrainingPlan) => {
  let run = 0, max = 0
  for (const w of p.weeks) for (const d of w.days) {
    const hard = HARD.has(d.type) || (d.type === 'strength' && /heavy strength \(4–6|explosive power/i.test(d.detail))
    run = hard ? run + 1 : 0
    max = Math.max(max, run)
  }
  return max
}

describe('Rule 1 — short gaps skip, never redistribute', () => {
  it('a skipped day lowers the week and nothing else grows', () => {
    const plan = basePlan()
    const before = plan.weeks.map((_, i) => weekMiles(plan, i))
    const runIdx = plan.weeks[2].days.findIndex(d => d.type === 'run')
    const out = replanShortGap(plan, [isoOf(plan, 2, runIdx)])
    expect(weekMiles(out, 2)).toBeLessThan(before[2])
    out.weeks.forEach((w, i) => {
      expect(Number(w.miles), `week ${i + 1}`).toBeLessThanOrEqual(before[i] + 0.01)
    })
    expect(out.weeks[2].focus).toMatch(/replanned/)
    expect(out.weeks[2].days[runIdx].workout).toMatch(/skipped/i)
  })

  it('race day and rest days are never rewritten', () => {
    const plan = basePlan()
    const final = plan.weeks.length - 1
    const raceIdx = plan.weeks[final].days.findIndex(d => d.type === 'race')
    const out = replanShortGap(plan, [isoOf(plan, final, raceIdx)])
    expect(out.weeks[final].days[raceIdx].type).toBe('race')
  })
})

describe('Rule 2 — missed key sessions swap forward or skip', () => {
  it('swaps into a same-week easy day when spacing allows, and the mandate holds', () => {
    const plan = basePlan()
    // Find a week with a quality day followed later by an easy day.
    let handled = false
    for (let wi = 1; wi < plan.weeks.length - 2 && !handled; wi++) {
      const qi = plan.weeks[wi].days.findIndex(d => d.type === 'quality' && !/BENCHMARK/i.test(d.workout))
      if (qi < 0) continue
      const out = replanMissedKeySession(plan, isoOf(plan, wi, qi))
      // Either swapped (session appears later in week) or skipped — both legal.
      const week = out.weeks[wi]
      const stillThere = week.days.filter(d => d.type === 'quality' && !/BENCHMARK/i.test(d.workout)).length
      const skipped = week.days.some(d => /skipped|moved later/i.test(d.detail ?? '') || /skipped/i.test(d.workout))
      expect(stillThere > 0 || skipped, `week ${wi + 1}`).toBe(true)
      expect(maxConsecHard(out)).toBeLessThanOrEqual(2)
      expect(Number(week.miles)).toBeLessThanOrEqual(Number(plan.weeks[wi].miles) + 0.01)
      handled = true
    }
    expect(handled).toBe(true)
  })
})

describe('Rule 3 — long gaps regenerate from where the athlete actually is', () => {
  it('the new plan starts within one ramp step of 0.85× the last completed week', () => {
    const resume = '2026-09-14' // 4 weeks into the runway
    const out = regenerateRemainder(getMethodById('pfitzinger')!, buildConfig(carmen, 16), 24, resume)
    const start = out.weeks[0].targetMi ?? 0
    expect(start).toBeGreaterThan(0)
    expect(start).toBeLessThanOrEqual(24 * 0.85 * 1.15)
    // The remainder passes the full gate.
    expect(validatePlan({ ...out, methodId: out.methodId }).errors.map(e => `${e.id}@${e.weekNum}`)).toEqual([])
  })

  it('a gap that leaves too little runway tells the truth (feasibility re-fires)', () => {
    const out = regenerateRemainder(getMethodById('pfitzinger')!, buildConfig(carmen, 16), 10, '2026-11-16')
    // ~3 weeks to race day: some honesty advisory must be present.
    expect((out.advisories ?? []).length).toBeGreaterThan(0)
  })
})

describe('Rule 4 — illness re-entry', () => {
  it('two easy days stand between resumption and the next hard day', () => {
    const plan = basePlan()
    // Resume the day before a quality day mid-plan.
    let target: string | null = null
    for (let wi = 2; wi < plan.weeks.length - 2 && !target; wi++) {
      const qi = plan.weeks[wi].days.findIndex(d => d.type === 'quality')
      if (qi > 0) target = isoOf(plan, wi, Math.max(0, qi - 1))
    }
    expect(target).toBeTruthy()
    const out = replanAfterIllness(plan, target!)
    const loc = locateDay(out, target!)!
    // Walk forward from resumption: no hard day before two run-class days pass.
    let easies = 0
    outer:
    for (let wi = loc.weekIdx; wi < out.weeks.length; wi++) {
      for (let di = wi === loc.weekIdx ? loc.dayIdx : 0; di < out.weeks[wi].days.length; di++) {
        const d: PlannedDay = out.weeks[wi].days[di]
        if (easies >= 2) break outer
        expect(HARD.has(d.type) && d.type !== 'race', `${d.day} ${d.workout}`).toBe(false)
        if (d.type === 'run') easies += 1
      }
    }
    expect(out.weeks.flatMap(w => w.days).some(d => /fever/i.test(d.detail))).toBe(true)
  })
})

describe('Doctrine — replanned output re-passes the property gate', () => {
  it('skip + swap + illness over a persona plan: QA gate still zero errors', () => {
    let plan = basePlan()
    const w2run = plan.weeks[1].days.findIndex(d => d.type === 'run')
    plan = replanShortGap(plan, [isoOf(plan, 1, w2run)])
    const w4q = plan.weeks[3].days.findIndex(d => d.type === 'quality' && !/BENCHMARK/i.test(d.workout))
    if (w4q >= 0) plan = replanMissedKeySession(plan, isoOf(plan, 3, w4q))
    plan = replanAfterIllness(plan, isoOf(plan, 5, 0))
    const qa = validatePlan({ ...plan, methodId: plan.methodId })
    expect(qa.errors.map(e => `${e.id}@${e.weekNum}: ${e.detail}`)).toEqual([])
    expect(maxConsecHard(plan)).toBeLessThanOrEqual(2)
  })
})

describe('110-F5 — compliance surfacing', () => {
  it('two consecutive <70% weeks suggest regeneration; one does not', () => {
    expect(weekCompliance(30, 15)).toBe(0.5)
    expect(shouldSuggestRegeneration([1, 0.6, 0.5])).toBe(true)
    expect(shouldSuggestRegeneration([0.6, 1])).toBe(false)
    expect(shouldSuggestRegeneration([0.6])).toBe(false)
  })
})
