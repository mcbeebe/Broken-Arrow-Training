import { describe, it, expect } from 'vitest'
import type { PlannedDay, TrainingWeek } from '../../../types'
import {
  travelSwap,
  buildTravelBatch,
  activeTravelWindows,
  type TravelWindow,
} from '../../../engines/planGenerator/travelMode'

function day(label: string, type: PlannedDay['type'], zone = '—'): PlannedDay {
  return { day: label, type, workout: type, detail: `${type} detail`, zone, route: 'Home', time: '45 min' }
}

/** A realistic mid-block week starting Mon 2026-09-07. Long sits mid-week
 *  (Wed) so relocation has room to move it forward. */
function week(): TrainingWeek {
  const days: PlannedDay[] = [
    day('Mon 9/7', 'rest'),
    day('Tue 9/8', 'run', '5 mi · Z2'),
    day('Wed 9/9', 'long', '12 mi · Z2'),
    day('Thu 9/10', 'quality', '6 mi · Z4'),
    day('Fri 9/11', 'strength'),
    day('Sat 9/12', 'run', '4 mi · Z2'),
    day('Sun 9/13', 'rest'),
  ]
  return { num: 3, dates: 'Sep 7–13', miles: 27, focus: 'Build', days, startIso: '2026-09-07' }
}

const sumZoneMiles = (days: PlannedDay[]) =>
  days.reduce((t, d) => t + (parseFloat(d.zone?.match(/^([\d.]+)\s*mi/)?.[1] ?? '0') || 0), 0)

describe('travelSwap', () => {
  it('never touches rest, race, or existing travel days', () => {
    for (const t of ['rest', 'race', 'travel'] as const) {
      expect(travelSwap(day('x', t), 'bodyweight')).toBeNull()
      expect(travelSwap(day('x', t), 'rest')).toBeNull()
    }
  })

  it('rest kit turns every trainable day into a travel day', () => {
    const s = travelSwap(day('x', 'quality', '6 mi'), 'rest')
    expect(s?.type).toBe('travel')
    expect(s?.zone).toBe('—')
  })

  it('run kit keeps runs (annotated) and drops strength to bodyweight', () => {
    const run = travelSwap(day('x', 'long', '12 mi · Z2'), 'run')
    expect(run?.type).toBeUndefined() // type unchanged — still a long run
    expect(run?.route).toMatch(/treadmill|outdoors/i)
    const str = travelSwap(day('x', 'strength'), 'run')
    expect(str?.type).toBe('strength')
    expect(str?.workout).toMatch(/bodyweight/i)
    expect(str?.zone).toBe('—')
  })

  it('bodyweight kit converts runs to room cardio and zeroes the mileage', () => {
    const s = travelSwap(day('x', 'run', '5 mi · Z2'), 'bodyweight')
    expect(s?.type).toBe('cross')
    expect(s?.zone).toBe('—')
  })

  it('full kit keeps the session, only marking it away', () => {
    const s = travelSwap(day('x', 'long', '12 mi'), 'full')
    expect(s?.type).toBeUndefined()
    expect(s?.route).toBe('Away')
  })
})

describe('buildTravelBatch', () => {
  it('adapts every trip day and leaves the rest of the week alone', () => {
    // Trip Tue–Fri, kit run: runs stay, strength → bodyweight.
    const res = buildTravelBatch([week()], { startIso: '2026-09-08', endIso: '2026-09-11', kit: 'run' })
    // Tue run, Wed long, Thu quality kept (annotated); Fri strength → bodyweight = 4 day ops + 1 week op.
    expect(res.affectedDays).toBe(4)
    expect(res.affectedWeeks).toEqual([3])
    const dayOps = res.ops.filter(o => o.op.kind === 'updateDay')
    expect(dayOps).toHaveLength(4)
    // No day outside the trip is touched.
    for (const o of dayOps) {
      if (o.op.kind === 'updateDay') expect([1, 2, 3, 4]).toContain(o.op.dayIndex)
    }
  })

  it('never increases a week total — the recomputed miles never exceed the original', () => {
    for (const kit of ['full', 'run', 'bodyweight', 'rest'] as const) {
      const res = buildTravelBatch([week()], { startIso: '2026-09-08', endIso: '2026-09-13', kit })
      const weekOp = res.ops.find(o => o.op.kind === 'updateWeek')
      if (weekOp && weekOp.op.kind === 'updateWeek') {
        expect(Number(weekOp.op.updates.miles)).toBeLessThanOrEqual(27)
      }
    }
  })

  it('moves a long run out of the trip to the soonest home day when the kit cannot run', () => {
    // Trip Tue–Wed covers the Wed long; bodyweight can't run away.
    const res = buildTravelBatch([week()], { startIso: '2026-09-08', endIso: '2026-09-09', kit: 'bodyweight' })
    expect(res.longRunMoved).toBeTruthy()
    expect(res.longRunMoved?.fromDay).toBe('Wed 9/9')
    expect(res.longRunMoved?.toDay).toBe('Sat 9/12') // soonest eligible run/rest day back
    // The moved-to day gets a long, the original becomes travel.
    const toOp = res.ops.find(o => o.op.kind === 'updateDay' && o.op.dayIndex === 5)
    expect(toOp?.op.kind === 'updateDay' && toOp.op.updates.type).toBe('long')
    const fromOp = res.ops.find(o => o.op.kind === 'updateDay' && o.op.dayIndex === 2)
    expect(fromOp?.op.kind === 'updateDay' && fromOp.op.updates.type).toBe('travel')
    expect(res.summary).toMatch(/long run moved to Sat/i)
  })

  it('keeps the long in place (running away) rather than moving it when the kit can run', () => {
    const res = buildTravelBatch([week()], { startIso: '2026-09-08', endIso: '2026-09-09', kit: 'run' })
    expect(res.longRunMoved).toBeUndefined()
  })

  it('is a no-op when the trip falls outside the plan', () => {
    const res = buildTravelBatch([week()], { startIso: '2027-01-01', endIso: '2027-01-05', kit: 'bodyweight' })
    expect(res.ops).toHaveLength(0)
    expect(res.affectedDays).toBe(0)
    expect(res.summary).toMatch(/nothing to adapt/i)
  })

  it('never rewrites a race day inside the trip', () => {
    const w = week()
    w.days[3] = day('Thu 9/10', 'race', '13.1 mi')
    const res = buildTravelBatch([w], { startIso: '2026-09-08', endIso: '2026-09-13', kit: 'rest' })
    const raceOp = res.ops.find(o => o.op.kind === 'updateDay' && o.op.dayIndex === 3)
    expect(raceOp).toBeUndefined()
  })

  it('recomputed miles reconcile with the adapted days', () => {
    const res = buildTravelBatch([week()], { startIso: '2026-09-08', endIso: '2026-09-13', kit: 'bodyweight' })
    const weekOp = res.ops.find(o => o.op.kind === 'updateWeek')
    // Apply the day ops to a working copy and sum — the week op must match.
    const days = week().days.map(d => ({ ...d }))
    for (const o of res.ops) {
      if (o.op.kind === 'updateDay') days[o.op.dayIndex] = { ...days[o.op.dayIndex], ...o.op.updates }
    }
    if (weekOp && weekOp.op.kind === 'updateWeek') {
      expect(Number(weekOp.op.updates.miles)).toBeCloseTo(sumZoneMiles(days), 1)
    }
  })
})

describe('activeTravelWindows', () => {
  const win = (endIso: string): TravelWindow => ({
    id: 'w', batchId: 'b', appliedAt: 1, summary: 's', affectedDays: 1,
    startIso: '2026-09-01', endIso, kit: 'bodyweight',
  })
  it('keeps windows ending today or later, drops past ones', () => {
    expect(activeTravelWindows([win('2026-09-15')], '2026-09-10')).toHaveLength(1)
    expect(activeTravelWindows([win('2026-09-15')], '2026-09-15')).toHaveLength(1)
    expect(activeTravelWindows([win('2026-09-15')], '2026-09-16')).toHaveLength(0)
  })
})
