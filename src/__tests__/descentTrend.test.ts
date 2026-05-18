import { describe, it, expect } from 'vitest'
import {
  buildDescentTrend,
  classifyAgainstBand,
  describeDescentState,
  descentTargetForCourse,
  weekStartForDate,
} from '../utils/descentTrend'
import type { CachedEccentric } from '../utils/runEccentric'
import { brokenArrow18k2026, brokenArrow11k2026 } from '../data/courses'

function ecc(severe: number, moderate: number, mild = 0, totalKmScore = 1): CachedEccentric {
  return {
    averageScore: 2.5,
    totalKmScore,
    buckets: { mild, moderate, severe },
  }
}

describe('weekStartForDate', () => {
  it('returns the Sunday before any given date', () => {
    expect(weekStartForDate('2026-05-13')).toBe('2026-05-10') // Wed → prev Sun
    expect(weekStartForDate('2026-05-10')).toBe('2026-05-10') // Sun → same Sun
    expect(weekStartForDate('2026-05-16')).toBe('2026-05-10') // Sat → that Sun
  })
})

describe('buildDescentTrend', () => {
  it('returns the requested lookback window with zeroed weeks', () => {
    const trend = buildDescentTrend({}, { lookbackWeeks: 4, now: new Date('2026-05-15') })
    expect(trend.weeks.length).toBe(4)
    expect(trend.weeks.every(w => w.runCount === 0)).toBe(true)
    expect(trend.totalHardDescentMeters).toBe(0)
    expect(trend.current?.weekStart).toBe('2026-05-10')
  })

  it('attributes a run to its activity-date week', () => {
    const cache: Record<string, CachedEccentric> = {
      '2026-05-13|Trail Run': ecc(800, 1200, 200, 5),
    }
    const trend = buildDescentTrend(cache, { lookbackWeeks: 4, now: new Date('2026-05-15') })
    const wk = trend.weeks.find(w => w.weekStart === '2026-05-10')!
    expect(wk.severeMeters).toBe(800)
    expect(wk.hardDescentMeters).toBe(2000) // severe + moderate
    expect(wk.totalDescentMeters).toBe(2200) // + mild
    expect(wk.eccentricLoad).toBe(5)
    expect(wk.runCount).toBe(1)
  })

  it('rolls multiple runs in the same week into a single bucket', () => {
    const cache: Record<string, CachedEccentric> = {
      '2026-05-11|Run A': ecc(300, 400),
      '2026-05-13|Run B': ecc(500, 600),
    }
    const trend = buildDescentTrend(cache, { lookbackWeeks: 4, now: new Date('2026-05-15') })
    const wk = trend.weeks.find(w => w.weekStart === '2026-05-10')!
    expect(wk.runCount).toBe(2)
    expect(wk.hardDescentMeters).toBe(1800)
  })

  it('ignores runs outside the lookback window', () => {
    const cache: Record<string, CachedEccentric> = {
      '2025-01-01|Old Run': ecc(9999, 9999),
    }
    const trend = buildDescentTrend(cache, { lookbackWeeks: 4, now: new Date('2026-05-15') })
    expect(trend.totalHardDescentMeters).toBe(0)
  })

  it('ignores malformed cache keys', () => {
    const cache: Record<string, CachedEccentric> = {
      'nodate': ecc(500, 500),
      '2026-05-13|Valid Run': ecc(100, 100),
    }
    const trend = buildDescentTrend(cache, { lookbackWeeks: 4, now: new Date('2026-05-15') })
    expect(trend.totalHardDescentMeters).toBe(200)
  })

  it('returns current and previous week pointers', () => {
    const cache: Record<string, CachedEccentric> = {
      '2026-05-13|This week': ecc(100, 100),
      '2026-05-06|Last week': ecc(200, 200),
    }
    const trend = buildDescentTrend(cache, { lookbackWeeks: 4, now: new Date('2026-05-15') })
    expect(trend.current?.hardDescentMeters).toBe(200)
    expect(trend.previous?.hardDescentMeters).toBe(400)
  })
})

describe('descentTargetForCourse', () => {
  it('scales the target band from race vertical loss', () => {
    const target = descentTargetForCourse(brokenArrow18k2026)
    expect(target).not.toBeNull()
    // 3850 ft × 0.3048 ≈ 1173 m. Band = 1.2×–1.8×
    expect(target!.raceDescentMeters).toBeCloseTo(1173, -1)
    expect(target!.minMetersPerWeek).toBeGreaterThan(target!.raceDescentMeters)
    expect(target!.maxMetersPerWeek).toBeGreaterThan(target!.minMetersPerWeek)
  })

  it('11K target band is lower than the 18K band', () => {
    const t18 = descentTargetForCourse(brokenArrow18k2026)!
    const t11 = descentTargetForCourse(brokenArrow11k2026)!
    expect(t11.maxMetersPerWeek).toBeLessThan(t18.minMetersPerWeek)
  })

  it('returns null for courses with negligible descent', () => {
    const flat = { ...brokenArrow18k2026, verticalLossFt: 50 }
    expect(descentTargetForCourse(flat)).toBeNull()
  })
})

describe('classifyAgainstBand', () => {
  const target = descentTargetForCourse(brokenArrow18k2026)!
  it('classifies below, in-band, and above correctly', () => {
    expect(classifyAgainstBand(0, target)).toBe('below')
    expect(classifyAgainstBand(target.minMetersPerWeek - 1, target)).toBe('below')
    expect(classifyAgainstBand(target.minMetersPerWeek, target)).toBe('in-band')
    expect(classifyAgainstBand(target.maxMetersPerWeek, target)).toBe('in-band')
    expect(classifyAgainstBand(target.maxMetersPerWeek + 1, target)).toBe('above')
  })
})

describe('describeDescentState', () => {
  const target = descentTargetForCourse(brokenArrow18k2026)!
  const baseTrend = (currentMeters: number, runCount = 1) => buildDescentTrend(
    runCount === 0 ? {} : { '2026-05-13|Run': ecc(currentMeters / 2, currentMeters / 2) },
    { lookbackWeeks: 4, now: new Date('2026-05-15') },
  )

  it('prompts for action when no runs are logged', () => {
    const trend = baseTrend(0, 0)
    expect(describeDescentState(trend, target, 4)).toMatch(/no descent runs/i)
  })

  it('says "in the race-ready band" when on target', () => {
    const trend = baseTrend(target.minMetersPerWeek + 50)
    expect(describeDescentState(trend, target, 4)).toMatch(/race-ready band/i)
  })

  it('quantifies the gap when below', () => {
    const trend = baseTrend(100)
    const text = describeDescentState(trend, target, 4)
    expect(text).toMatch(/short of/i)
    expect(text).toMatch(/\bm\b/)
  })

  it('mentions weeks-to-race when known', () => {
    const trend = baseTrend(target.minMetersPerWeek + 50)
    expect(describeDescentState(trend, target, 6)).toMatch(/6 weeks/i)
    expect(describeDescentState(trend, target, 1)).toMatch(/1 week/i)
  })

  it('falls back gracefully when no target is set', () => {
    const trend = baseTrend(500)
    const text = describeDescentState(trend, null, null)
    expect(text).toMatch(/500 m/)
    expect(text).toMatch(/pick a race/i)
  })
})
