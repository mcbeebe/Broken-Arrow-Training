import { describe, it, expect } from 'vitest'
import type { DayCompliance } from '../../types'
import {
  weeklyIntensitySplit,
  methodEasyTarget,
  grayZoneAssessment,
  aerobicDecoupling,
  decouplingFromSplits,
  buildIntensityContext,
} from '../../utils/intensityDistribution'
import { getMethodById } from '../../data/methods'

/**
 * G7 tests: polarization compliance measured against the method's OWN
 * phase targets (already in every method file), quiet-below-evidence
 * guards, and the decoupling math on synthetic steady/fading runs.
 */

function dayWithZones(zoneSeconds: number[]): DayCompliance {
  return {
    date: '2026-07-06', day: 'Mon', workoutType: 'run', hasActual: true,
    targets: {}, distanceGrade: 'na', durationGrade: 'na', hrGrade: 'hit',
    hrZoneSummary: zoneSeconds.map((seconds, i) => ({ zone: i + 1, seconds })),
  } as DayCompliance
}

describe('weeklyIntensitySplit', () => {
  it('time-weights Z1-Z2 as easy, Z3+ as hard (gray zone counts against easy)', () => {
    const split = weeklyIntensitySplit([
      dayWithZones([600, 2400, 0, 0, 0]),    // 50 min easy
      dayWithZones([0, 1800, 1200, 0, 0]),   // 30 easy + 20 gray
      dayWithZones([0, 600, 0, 900, 300]),   // 10 easy + 20 hard
    ])!
    expect(split.measuredSessions).toBe(3)
    // easy = 600+2400+1800+600 = 5400; hard = 1200+900+300 = 2400
    expect(split.easyPct).toBe(Math.round((5400 / 7800) * 100))
  })

  it('GUARD: no HR data → null (no verdicts from thin data)', () => {
    expect(weeklyIntensitySplit([dayWithZones([0, 0, 0, 0, 0])])).toBeNull()
  })
})

describe('methodEasyTarget + grayZoneAssessment', () => {
  const method = getMethodById('fitzgerald_8020')!

  it("reads the target from the method's own phase data", () => {
    const t = methodEasyTarget(method, null)
    expect(t.easyPct).toBeGreaterThanOrEqual(75) // 80/20's whole identity
  })

  it("flags a gray-zone week with the method's own numbers", () => {
    const split = { easyPct: 61, hardPct: 39, measuredSessions: 4, totalSec: 10000 }
    const a = grayZoneAssessment(split, { easyPct: 80, phaseName: 'Build' }, method.name)
    expect(a.flagged).toBe(true)
    expect(a.message).toContain('80%')
    expect(a.message).toContain('61%')
    expect(a.message).toContain('slow the easy ones down')
  })

  it('GUARD: within tolerance or under 3 measured sessions → quiet', () => {
    expect(grayZoneAssessment(
      { easyPct: 74, hardPct: 26, measuredSessions: 4, totalSec: 10000 },
      { easyPct: 80, phaseName: 'Build' }, method.name).flagged).toBe(false)
    expect(grayZoneAssessment(
      { easyPct: 50, hardPct: 50, measuredSessions: 2, totalSec: 4000 },
      { easyPct: 80, phaseName: 'Build' }, method.name).flagged).toBe(false)
  })
})

describe('aerobicDecoupling', () => {
  function steadyRun(fadePct: number) {
    // 60 min at 3 m/s; HR 140 in half 1, drifting up by fadePct in half 2.
    const time: number[] = []
    const dist: number[] = []
    const hr: number[] = []
    for (let s = 0; s <= 3600; s += 10) {
      time.push(s)
      dist.push(s * 3)
      hr.push(s <= 1800 ? 140 : Math.round(140 * (1 + fadePct / 100)))
    }
    return { time, dist, hr }
  }

  it('a well-coupled run reads ~0%; a 10% HR drift reads ~9-10%', () => {
    expect(aerobicDecoupling(steadyRun(0))).toBeCloseTo(0, 1)
    const drifted = aerobicDecoupling(steadyRun(10))!
    expect(drifted).toBeGreaterThan(8)
    expect(drifted).toBeLessThan(11)
  })

  it('GUARD: too short → null', () => {
    expect(aerobicDecoupling({ time: [0, 60], dist: [0, 200], hr: [140, 141] })).toBeNull()
  })

  it('decouplingFromSplits reads lap data (the granularity Garmin sync caches)', () => {
    // 10 one-mile laps at constant pace; HR climbs 12% across the back half.
    const splits = Array.from({ length: 10 }, (_, i) => ({
      distance: 1609, duration: 600,
      averageHR: i < 5 ? 140 : 157,
      splitType: 'INTERVAL_ACTIVE',
    }))
    const d = decouplingFromSplits(splits)!
    expect(d).toBeGreaterThan(8)
    expect(decouplingFromSplits(splits.slice(0, 4))).toBeNull() // too few laps
  })
})

describe('buildIntensityContext', () => {
  it('carries the split, the flag, and the decoupling read', () => {
    const ctx = buildIntensityContext(
      { easyPct: 61, hardPct: 39, measuredSessions: 4, totalSec: 10000 },
      { easyPct: 80, phaseName: 'Build phase' },
      '80/20 Running (Fitzgerald)',
      9.5,
    )!
    expect(ctx).toContain('61% easy')
    expect(ctx).toContain('GRAY-ZONE FLAG')
    expect(ctx).toContain('9.5%')
    expect(ctx).toContain('under construction')
  })

  it('GUARD: no split → null (no section)', () => {
    expect(buildIntensityContext(null, { easyPct: 80, phaseName: 'Build' }, 'X')).toBeNull()
  })
})
