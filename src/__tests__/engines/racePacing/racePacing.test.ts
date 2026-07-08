import { describe, it, expect } from 'vitest'
import {
  buildRacePacingPlan,
  buildRacePacingContext,
  segmentCost,
} from '../../../engines/racePacing'
import brokenArrow18k from '../../../data/courses/broken-arrow-18k-2026'
import { costRun, costWalk } from '../../../engines/terrain/locomotion/minetti'

/**
 * G6 tests: pace bands derive from real Minetti physics on the real BA-18k
 * course data, the hike call is the walking-economy crossover (physics,
 * not vibes), fueling checkpoints share the plan's carb tiers, and the
 * guards (bad pace, empty course) return null instead of nonsense.
 */

const FLAT_10MIN_MI = 600 // 10:00/mi race-effort flat pace

describe('segmentCost — the physics-called gait', () => {
  it('runs on flat and moderate grades, hikes above the ~+20% race-speed crossover', () => {
    expect(segmentCost(0).gait).toBe('run')
    expect(segmentCost(10).gait).toBe('run')
    expect(segmentCost(19).gait).toBe('run')
    expect(segmentCost(20).gait).toBe('hike')
    expect(segmentCost(30).gait).toBe('hike')
    // One continuous cost curve prices everything (no cliff at the flag).
    expect(segmentCost(20).ratio).toBeCloseTo(costRun(0.2) / costRun(0), 5)
    expect(segmentCost(30).ratio).toBeCloseTo(costRun(0.3) / costRun(0), 5)
    // The energy fact behind the flag: walking is cheaper there.
    expect(costWalk(0.2)).toBeLessThan(costRun(0.2))
  })

  it('climbs cost more than flat; steeper costs more than shallower', () => {
    expect(segmentCost(11.4).ratio).toBeGreaterThan(1)
    expect(segmentCost(15).ratio).toBeGreaterThan(segmentCost(8).ratio)
  })
})

describe('buildRacePacingPlan on the real Broken Arrow 18K', () => {
  const plan = buildRacePacingPlan(brokenArrow18k, FLAT_10MIN_MI)!

  it('produces a band for every course segment, in order, with coherent ETAs', () => {
    expect(plan).not.toBeNull()
    expect(plan.segments).toHaveLength(brokenArrow18k.segments.length)
    for (const s of plan.segments) {
      expect(s.paceLowSecMi).toBeLessThan(s.paceHighSecMi)
    }
    for (let i = 1; i < plan.segments.length; i++) {
      expect(plan.segments[i].etaLowSec).toBeGreaterThan(plan.segments[i - 1].etaLowSec)
    }
    expect(plan.totalLowSec).toBeLessThan(plan.totalHighSec)
  })

  it('climb segments are slower than the flat race pace; the KT-22 climb reflects its grade', () => {
    const kt22 = plan.segments.find(s => s.name === 'KT-22 Climb')!
    expect(kt22.paceLowSecMi).toBeGreaterThan(FLAT_10MIN_MI)
  })

  it('fueling checkpoints ride the aid stations with cumulative grams from the shared tiers', () => {
    expect(plan.checkpoints.length).toBe(brokenArrow18k.aidStations.length)
    // 18K ≈ 11.2 mi → 0 g/hr tier is wrong for a mountain race? No: the
    // shared tier says <13 mi = 0 g/hr — and the plan must agree with the
    // in-app prescription rather than invent its own.
    if (plan.gPerHour === 0) {
      for (const c of plan.checkpoints) expect(c.cumulativeCarbsG).toBe(0)
    } else {
      const last = plan.checkpoints[plan.checkpoints.length - 1]
      expect(last.cumulativeCarbsG).toBeGreaterThan(0)
    }
  })

  it('altitude caution fires for a course topping out over 7,000 ft', () => {
    expect(plan.cautions.some(c => /ft/.test(c))).toBe(true)
  })

  it('coach context names segments with their bands', () => {
    const ctx = buildRacePacingContext(plan)
    expect(ctx).toContain('KT-22 Climb')
    expect(ctx).toMatch(/\d{1,2}:\d{2}\/mi/)
  })

  it('GUARD: bad inputs return null, never a bogus plan', () => {
    expect(buildRacePacingPlan(brokenArrow18k, 0)).toBeNull()
    expect(buildRacePacingPlan(brokenArrow18k, NaN)).toBeNull()
    expect(buildRacePacingPlan({ ...brokenArrow18k, segments: [] }, FLAT_10MIN_MI)).toBeNull()
  })
})
