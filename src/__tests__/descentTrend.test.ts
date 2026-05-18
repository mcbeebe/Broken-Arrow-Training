import { describe, it, expect } from 'vitest'
import {
  buildVerticalTrend,
  classifyAgainstBand,
  describeVerticalState,
  verticalTargetsForCourse,
  weekStartForDate,
} from '../utils/descentTrend'
import type { CachedEccentric } from '../utils/runEccentric'
import { brokenArrow18k2026, brokenArrow11k2026 } from '../data/courses'

/** Builds a CachedEccentric with the new vertical-meters fields. The
 *  legacy `buckets` are still required by the type (other consumers use
 *  them), but the descent trend now reads `hardAscent/DescentVerticalMeters`
 *  directly. */
function ecc(opts: {
  ascentM?: number
  descentM?: number
  totalKmScore?: number
}): CachedEccentric {
  return {
    averageScore: 2.5,
    totalKmScore: opts.totalKmScore ?? 1,
    buckets: { mild: 0, moderate: 0, severe: 0 },
    hardAscentVerticalMeters: opts.ascentM ?? 0,
    hardDescentVerticalMeters: opts.descentM ?? 0,
  }
}

describe('weekStartForDate', () => {
  it('returns the Sunday before any given date', () => {
    expect(weekStartForDate('2026-05-13')).toBe('2026-05-10')
    expect(weekStartForDate('2026-05-10')).toBe('2026-05-10')
    expect(weekStartForDate('2026-05-16')).toBe('2026-05-10')
  })
})

describe('buildVerticalTrend', () => {
  it('returns the requested lookback window with zeroed weeks', () => {
    const trend = buildVerticalTrend({}, { lookbackWeeks: 4, now: new Date('2026-05-15') })
    expect(trend.weeks.length).toBe(4)
    expect(trend.weeks.every(w => w.runCount === 0)).toBe(true)
    expect(trend.totalHardAscentMeters).toBe(0)
    expect(trend.totalHardDescentMeters).toBe(0)
    expect(trend.current?.weekStart).toBe('2026-05-10')
  })

  it('attributes a run to its activity-date week (vertical meters)', () => {
    const cache: Record<string, CachedEccentric> = {
      '2026-05-13|Trail Run': ecc({ ascentM: 600, descentM: 800, totalKmScore: 5 }),
    }
    const trend = buildVerticalTrend(cache, { lookbackWeeks: 4, now: new Date('2026-05-15') })
    const wk = trend.weeks.find(w => w.weekStart === '2026-05-10')!
    expect(wk.hardAscentMeters).toBe(600)
    expect(wk.hardDescentMeters).toBe(800)
    expect(wk.eccentricLoad).toBe(5)
    expect(wk.runCount).toBe(1)
  })

  it('rolls multiple runs in the same week into a single bucket', () => {
    const cache: Record<string, CachedEccentric> = {
      '2026-05-11|Run A': ecc({ ascentM: 200, descentM: 300 }),
      '2026-05-13|Run B': ecc({ ascentM: 400, descentM: 500 }),
    }
    const trend = buildVerticalTrend(cache, { lookbackWeeks: 4, now: new Date('2026-05-15') })
    const wk = trend.weeks.find(w => w.weekStart === '2026-05-10')!
    expect(wk.runCount).toBe(2)
    expect(wk.hardAscentMeters).toBe(600)
    expect(wk.hardDescentMeters).toBe(800)
  })

  it('ignores runs outside the lookback window', () => {
    const cache: Record<string, CachedEccentric> = {
      '2025-01-01|Old Run': ecc({ ascentM: 9999, descentM: 9999 }),
    }
    const trend = buildVerticalTrend(cache, { lookbackWeeks: 4, now: new Date('2026-05-15') })
    expect(trend.totalHardAscentMeters).toBe(0)
    expect(trend.totalHardDescentMeters).toBe(0)
  })

  it('ignores malformed cache keys', () => {
    const cache: Record<string, CachedEccentric> = {
      'nodate': ecc({ descentM: 500 }),
      '2026-05-13|Valid Run': ecc({ descentM: 100 }),
    }
    const trend = buildVerticalTrend(cache, { lookbackWeeks: 4, now: new Date('2026-05-15') })
    expect(trend.totalHardDescentMeters).toBe(100)
  })

  it('returns current and previous week pointers', () => {
    const cache: Record<string, CachedEccentric> = {
      '2026-05-13|This week': ecc({ ascentM: 100, descentM: 150 }),
      '2026-05-06|Last week': ecc({ ascentM: 250, descentM: 350 }),
    }
    const trend = buildVerticalTrend(cache, { lookbackWeeks: 4, now: new Date('2026-05-15') })
    expect(trend.current?.hardDescentMeters).toBe(150)
    expect(trend.previous?.hardDescentMeters).toBe(350)
    expect(trend.current?.hardAscentMeters).toBe(100)
    expect(trend.previous?.hardAscentMeters).toBe(250)
  })

  it('treats older cached runs (missing vertical fields) as zero', () => {
    // Simulate a pre-vertical-meters cache entry.
    const legacy = {
      averageScore: 2.5,
      totalKmScore: 1,
      buckets: { mild: 0, moderate: 1000, severe: 500 },
    } as unknown as CachedEccentric
    const cache: Record<string, CachedEccentric> = {
      '2026-05-13|Legacy': legacy,
    }
    const trend = buildVerticalTrend(cache, { lookbackWeeks: 4, now: new Date('2026-05-15') })
    expect(trend.totalHardAscentMeters).toBe(0)
    expect(trend.totalHardDescentMeters).toBe(0)
  })
})

describe('verticalTargetsForCourse', () => {
  it('produces ascent + descent bands scaled from race vertical', () => {
    const targets = verticalTargetsForCourse(brokenArrow18k2026)
    expect(targets.descent).not.toBeNull()
    expect(targets.ascent).not.toBeNull()
    expect(targets.descent!.raceVerticalMeters).toBeCloseTo(1173, -1)
    expect(targets.descent!.minMetersPerWeek).toBeGreaterThan(targets.descent!.raceVerticalMeters)
  })

  it('11K bands are lower than the 18K bands', () => {
    const t18 = verticalTargetsForCourse(brokenArrow18k2026)
    const t11 = verticalTargetsForCourse(brokenArrow11k2026)
    expect(t11.descent!.maxMetersPerWeek).toBeLessThan(t18.descent!.minMetersPerWeek)
    expect(t11.ascent!.maxMetersPerWeek).toBeLessThan(t18.ascent!.minMetersPerWeek)
  })

  it('drops bands for axes with negligible vertical', () => {
    const flat = { ...brokenArrow18k2026, verticalLossFt: 50, verticalGainFt: 50 }
    const targets = verticalTargetsForCourse(flat)
    expect(targets.descent).toBeNull()
    expect(targets.ascent).toBeNull()
  })
})

describe('classifyAgainstBand', () => {
  const band = verticalTargetsForCourse(brokenArrow18k2026).descent!
  it('classifies below, in-band, and above', () => {
    expect(classifyAgainstBand(0, band)).toBe('below')
    expect(classifyAgainstBand(band.minMetersPerWeek - 1, band)).toBe('below')
    expect(classifyAgainstBand(band.minMetersPerWeek, band)).toBe('in-band')
    expect(classifyAgainstBand(band.maxMetersPerWeek, band)).toBe('in-band')
    expect(classifyAgainstBand(band.maxMetersPerWeek + 1, band)).toBe('above')
  })
})

describe('describeVerticalState', () => {
  const targets = verticalTargetsForCourse(brokenArrow18k2026)
  const baseTrend = (ascentM: number, descentM: number, runCount = 1) => buildVerticalTrend(
    runCount === 0
      ? {}
      : { '2026-05-13|Run': ecc({ ascentM, descentM }) },
    { lookbackWeeks: 4, now: new Date('2026-05-15') },
  )

  it('prompts for action when no runs are logged', () => {
    const trend = baseTrend(0, 0, 0)
    expect(describeVerticalState(trend, targets, 4)).toMatch(/no vertical work/i)
  })

  it('says "in band" when both axes are on target', () => {
    const trend = baseTrend(
      targets.ascent!.minMetersPerWeek + 50,
      targets.descent!.minMetersPerWeek + 50,
    )
    const text = describeVerticalState(trend, targets, 4)
    expect(text).toMatch(/in band/i)
    expect(text).toMatch(/climb/i)
    expect(text).toMatch(/descent/i)
  })

  it('quantifies the gap on the side that is below', () => {
    const trend = baseTrend(100, 100)
    const text = describeVerticalState(trend, targets, 4)
    expect(text).toMatch(/short/i)
    expect(text).toMatch(/\bm\b/)
  })

  it('mentions weeks-to-race when known', () => {
    const trend = baseTrend(
      targets.ascent!.minMetersPerWeek + 50,
      targets.descent!.minMetersPerWeek + 50,
    )
    expect(describeVerticalState(trend, targets, 6)).toMatch(/6 weeks/i)
    expect(describeVerticalState(trend, targets, 1)).toMatch(/1 week/i)
  })

  it('falls back gracefully when no target is set', () => {
    const trend = baseTrend(400, 500)
    const text = describeVerticalState(trend, { ascent: null, descent: null }, null)
    expect(text).toMatch(/500 m/)
    expect(text).toMatch(/pick a race/i)
  })
})
