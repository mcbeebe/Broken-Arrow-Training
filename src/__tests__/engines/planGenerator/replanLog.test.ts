/**
 * Phase 5 surface (PRD-110) — the replan op-log. The rules themselves are
 * proven in phase5-adaptation.test.ts; what's under test here is the
 * REPLAY contract the app depends on: order, idempotence over a re-render,
 * graceful no-ops, and "drop the record" as undo.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { getMethodById } from '../../../data/methods'
import { applyReplanLog, hasReplanFor, type ReplanRecord } from '../../../engines/planGenerator/replanLog'
import { validatePlan } from '../../../engines/planQA/validatePlan'
import { TODAY, PERSONAS, buildConfig } from '../../helpers/roadPersonas'
import type { TrainingWeek } from '../../../types'

const carmen = PERSONAS.find(p => p.label.startsWith('Carmen'))!
const plan = () => generatePlanFromMethod(getMethodById('pfitzinger')!, buildConfig(carmen, 16), TODAY)

const isoOf = (weeks: TrainingWeek[], wi: number, di: number) => {
  const d = new Date(`${weeks[wi].startIso}T12:00:00`)
  d.setDate(d.getDate() + di)
  return d.toISOString().slice(0, 10)
}

const rec = (kind: ReplanRecord['kind'], dateIso: string, appliedAt: number): ReplanRecord =>
  ({ id: `r${appliedAt}`, kind, dateIso, appliedAt })

const HARD = new Set(['quality', 'long', 'race'])
const maxConsecHard = (weeks: TrainingWeek[]) => {
  let run = 0, max = 0
  for (const w of weeks) for (const d of w.days) {
    const hard = HARD.has(d.type) || (d.type === 'strength' && /heavy strength \(4–6|explosive power/i.test(d.detail))
    run = hard ? run + 1 : 0
    max = Math.max(max, run)
  }
  return max
}

describe('replan log — replay', () => {
  it('an empty log returns the same weeks (identity, not a copy)', () => {
    const weeks = plan().weeks
    expect(applyReplanLog(weeks, [])).toBe(weeks)
  })

  it('a skip record lowers its week and tags it, and replay is stable', () => {
    const weeks = plan().weeks
    const di = weeks[2].days.findIndex(d => d.type === 'run')
    const log = [rec('skip', isoOf(weeks, 2, di), 1)]

    const once = applyReplanLog(weeks, log)
    expect(Number(once[2].miles)).toBeLessThan(Number(weeks[2].miles))
    expect(once[2].focus).toMatch(/replanned/)
    expect(once[2].days[di].workout).toMatch(/skipped/i)

    // Re-render: the log replays over the BASE weeks again, so the result
    // is identical — replaying twice never compounds.
    const twice = applyReplanLog(weeks, log)
    expect(twice[2].miles).toBe(once[2].miles)
    expect(twice[2].focus).toBe(once[2].focus)
  })

  it('records replay in appliedAt order, not array order', () => {
    const weeks = plan().weeks
    const a = isoOf(weeks, 2, weeks[2].days.findIndex(d => d.type === 'run'))
    const b = isoOf(weeks, 4, 0)
    const forward = applyReplanLog(weeks, [rec('skip', a, 1), rec('illness', b, 2)])
    const shuffled = applyReplanLog(weeks, [rec('illness', b, 2), rec('skip', a, 1)])
    expect(shuffled.map(w => `${w.num}:${w.miles}:${w.focus}`))
      .toEqual(forward.map(w => `${w.num}:${w.miles}:${w.focus}`))
  })

  it('a record aimed at a date the plan no longer covers is a no-op', () => {
    const weeks = plan().weeks
    const out = applyReplanLog(weeks, [rec('skip', '2031-01-05', 1)])
    expect(out.map(w => w.miles)).toEqual(weeks.map(w => w.miles))
  })

  it('dropping a record IS the undo — the base plan comes back untouched', () => {
    const weeks = plan().weeks
    const iso = isoOf(weeks, 3, weeks[3].days.findIndex(d => d.type === 'run'))
    const applied = applyReplanLog(weeks, [rec('skip', iso, 1)])
    expect(applied[3].miles).not.toBe(weeks[3].miles)
    expect(applyReplanLog(weeks, []).map(w => `${w.miles}|${w.focus}`))
      .toEqual(weeks.map(w => `${w.miles}|${w.focus}`))
  })

  it('a stacked log (skip + move + illness) still passes the QA gate and the mandate', () => {
    const base = plan()
    const weeks = base.weeks
    const skipIso = isoOf(weeks, 1, weeks[1].days.findIndex(d => d.type === 'run'))
    const qi = weeks[3].days.findIndex(d => d.type === 'quality' && !/BENCHMARK/i.test(d.workout))
    const log: ReplanRecord[] = [
      rec('skip', skipIso, 1),
      ...(qi >= 0 ? [rec('move', isoOf(weeks, 3, qi), 2)] : []),
      rec('illness', isoOf(weeks, 5, 0), 3),
    ]
    const out = applyReplanLog(weeks, log)
    expect(maxConsecHard(out)).toBeLessThanOrEqual(2)
    const qa = validatePlan({ weeks: out, methodId: base.methodId })
    expect(qa.errors.map(e => `${e.id}@${e.weekNum}: ${e.detail}`)).toEqual([])
  })

  it('no replan ever raises a week above its original volume', () => {
    const weeks = plan().weeks
    const log: ReplanRecord[] = [
      rec('skip', isoOf(weeks, 2, 1), 1),
      rec('illness', isoOf(weeks, 6, 0), 2),
      rec('skip', isoOf(weeks, 8, 2), 3),
    ]
    applyReplanLog(weeks, log).forEach((w, i) => {
      expect(Number(w.miles), `week ${i + 1}`).toBeLessThanOrEqual(Number(weeks[i].miles) + 0.01)
    })
  })
})

describe('replan log — lookup', () => {
  it('hasReplanFor matches on the acted-on date only', () => {
    const log = [rec('skip', '2026-09-01', 1)]
    expect(hasReplanFor(log, '2026-09-01')).toBe(true)
    expect(hasReplanFor(log, '2026-09-02')).toBe(false)
    expect(hasReplanFor([], '2026-09-01')).toBe(false)
  })
})
