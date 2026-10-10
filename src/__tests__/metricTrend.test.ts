/**
 * The trend math behind the snapshot sparklines and the Training Load
 * chart's Fitness change.
 *
 * Field request (2026-10-10): "I want to see my fitness improvement better
 * on the graph" and "a spark line of how my key metrics have been tracking
 * over past 1–2 weeks".
 */
import { describe, it, expect } from 'vitest'
import {
  shiftDate, recentWindow, valueOnOrBefore, changeOver, sparkGeometry,
  fitnessChange, fitnessAxisDomain, formatChange, changeTone, SPARK_DAYS, niceTicks,
  rollingMean, healthyBands, bandCaption, FITNESS_SAFE_WEEKLY_RAMP,
} from '../utils/metricTrend'
import type { PerformanceMetrics } from '../types'

const p = (date: string, ctl: number, atl = 50): PerformanceMetrics =>
  ({ date, ctl, atl, tsb: ctl - atl, acwr: atl / ctl })

/** `n` consecutive days ending 2026-10-10, Fitness rising 1 a day from `start`. */
const days = (n: number, start = 60) =>
  Array.from({ length: n }, (_, i) => p(shiftDate('2026-10-10', i - (n - 1)), start + i))

describe('shiftDate', () => {
  it('crosses month and year boundaries', () => {
    expect(shiftDate('2026-10-01', -1)).toBe('2026-09-30')
    expect(shiftDate('2026-01-03', -7)).toBe('2025-12-27')
    expect(shiftDate('2026-02-28', 1)).toBe('2026-03-01')
  })
  it('is a whole calendar day across a DST change', () => {
    expect(shiftDate('2026-03-08', 1)).toBe('2026-03-09')
    expect(shiftDate('2026-11-01', 1)).toBe('2026-11-02')
  })
})

describe('recentWindow', () => {
  it('keeps the last 14 calendar days, oldest first, whatever the input order', () => {
    const w = recentWindow(days(30).reverse())
    expect(w).toHaveLength(SPARK_DAYS)
    expect(w[0].date).toBe('2026-09-27')
    expect(w[w.length - 1].date).toBe('2026-10-10')
  })
  it('goes by date, not by count, when the timeline has gaps', () => {
    const gappy = [p('2026-09-01', 50), p('2026-10-01', 60), p('2026-10-10', 62)]
    expect(recentWindow(gappy).map(x => x.date)).toEqual(['2026-10-01', '2026-10-10'])
  })
  it('is empty for an empty timeline and keeps a short one whole', () => {
    expect(recentWindow([])).toEqual([])
    expect(recentWindow(days(3))).toHaveLength(3)
  })
})

describe('valueOnOrBefore / changeOver', () => {
  it('reads the exact day, else carries the newest earlier one forward', () => {
    const t = [p('2026-10-01', 60), p('2026-10-05', 64)]
    expect(valueOnOrBefore(t, 'ctl', '2026-10-05')).toBe(64)
    expect(valueOnOrBefore(t, 'ctl', '2026-10-03')).toBe(60)
    expect(valueOnOrBefore(t, 'ctl', '2026-09-30')).toBeNull()
  })
  it('today minus 7 days ago', () => {
    expect(changeOver(days(14), 'ctl')).toBe(7)
    expect(changeOver(days(14), 'atl')).toBe(0)
  })
  it('is null when history is shorter than the lookback, or empty', () => {
    expect(changeOver(days(7), 'ctl')).toBeNull()
    expect(changeOver(days(8), 'ctl')).toBe(7)
    expect(changeOver([], 'ctl')).toBeNull()
  })
})

describe('sparkGeometry', () => {
  const opts = { width: 100, height: 40, pad: 0 }
  it('maps the min to the bottom, the max to the top, first to left, last to right', () => {
    const g = sparkGeometry([10, 20, 30], opts)!
    expect(g.d).toBe('M0 40L50 20L100 0')
    expect(g.end).toEqual({ x: 100, y: 0 })
  })
  it('widens the range to include reference values', () => {
    const g = sparkGeometry([-10, -20], { ...opts, include: [0] })!
    expect(g.y(0)).toBe(0)
    expect(g.y(-20)).toBe(40)
  })
  it('draws a flat series mid-height instead of dividing by zero', () => {
    const g = sparkGeometry([5, 5, 5], opts)!
    expect(g.d).toBe('M0 20L50 20L100 20')
  })
  it('is null with fewer than two finite points', () => {
    expect(sparkGeometry([], opts)).toBeNull()
    expect(sparkGeometry([3], opts)).toBeNull()
    expect(sparkGeometry([3, NaN], opts)).toBeNull()
  })
  it('keeps the stroke inside the padding', () => {
    const g = sparkGeometry([0, 1], { width: 100, height: 40, pad: 3 })!
    expect(g.end).toEqual({ x: 97, y: 3 })
  })
})

describe('fitnessChange', () => {
  it('first reading in the range to the last', () => {
    const c = fitnessChange(days(30, 64), '2026-09-11', '2026-10-10')!
    expect(c.from).toBe(64)
    expect(c.to).toBe(93)
    expect(c.delta).toBe(29)
    expect(c.pct).toBeCloseTo(45.3, 1)
    expect(c.since).toBe('2026-09-11')
  })
  it('measures from the first day with data when the range starts earlier', () => {
    const c = fitnessChange(days(5, 70), '2026-09-11', '2026-10-10')!
    expect(c.since).toBe('2026-10-06')
    expect(c.delta).toBe(4)
  })
  it('reports a drop as negative', () => {
    const t = [p('2026-10-01', 70), p('2026-10-10', 63)]
    expect(fitnessChange(t, '2026-10-01', '2026-10-10')!.delta).toBe(-7)
  })
  it('is null without two days of data, or before Fitness has built', () => {
    expect(fitnessChange([p('2026-10-10', 70)], '2026-10-01', '2026-10-10')).toBeNull()
    expect(fitnessChange([p('2026-10-01', 0), p('2026-10-10', 0.5)], '2026-10-01', '2026-10-10')).toBeNull()
  })
  it('measures from the first day Fitness had built, where the chart line starts', () => {
    const c = fitnessChange([p('2026-10-01', 0), p('2026-10-02', 0.8), p('2026-10-03', 4), p('2026-10-10', 10)], '2026-10-01', '2026-10-10')!
    expect(c.since).toBe('2026-10-03')
    expect(c.delta).toBe(6)
    expect(c.pct).toBe(150)
  })
})

describe('fitnessAxisDomain', () => {
  it('zooms to the data on multiples of 5, with headroom', () => {
    expect(fitnessAxisDomain([64, 75.1])).toEqual([60, 80])
  })
  it('is at least 10 tall so a flat week does not read as a cliff', () => {
    const [lo, hi] = fitnessAxisDomain([70, 70.4])!
    expect(hi - lo).toBeGreaterThanOrEqual(10)
    expect(lo).toBeLessThanOrEqual(70)
    expect(hi).toBeGreaterThanOrEqual(70.4)
  })
  it('never goes below zero', () => {
    expect(fitnessAxisDomain([2, 3])![0]).toBe(0)
  })
  it('is null with no data', () => {
    expect(fitnessAxisDomain([])).toBeNull()
  })
})

describe('formatChange / changeTone', () => {
  it('formats with an arrow and a sign', () => {
    expect(formatChange(1.84, 1)).toBe('▲ +1.8')
    expect(formatChange(-3.4, 0)).toBe('▼ −3')
    expect(formatChange(0.04, 1)).toBe('± 0.0')
    expect(formatChange(-0.4, 0)).toBe('± 0')
  })
  const B = { tsbOverreaching: -30, acwrLow: 0.8, acwrHigh: 1.3 }
  it('Fitness rising is good up to the safe weekly ramp, caution past it; falling is caution', () => {
    expect(changeTone('ctl', 2, 75, B)).toBe('good')
    expect(changeTone('ctl', 8, 75, B)).toBe('good')
    expect(changeTone('ctl', 12, 75, B)).toBe('caution')
    expect(changeTone('ctl', -2, 75, B)).toBe('caution')
  })
  it('Fatigue rising is caution; falling is only neutral', () => {
    expect(changeTone('atl', 30, 125, B)).toBe('caution')
    expect(changeTone('atl', -30, 60, B)).toBe('neutral')
  })
  it('Recovery Balance falling is caution only once it is overreaching', () => {
    expect(changeTone('tsb', 5, -20, B)).toBe('good')
    expect(changeTone('tsb', -8, -20, B)).toBe('neutral') // a build week, tired by design
    expect(changeTone('tsb', -8, -35, B)).toBe('caution')
  })
  it('Load Ratio toward the band is good, away from it caution, within it neutral', () => {
    expect(changeTone('acwr', 0.35, 0.95, B)).toBe('good')    // 0.6 → 0.95: out of undertraining
    expect(changeTone('acwr', -0.3, 1.2, B)).toBe('good')     // 1.5 → 1.2: back from a spike
    expect(changeTone('acwr', 0.41, 1.67, B)).toBe('caution') // 1.26 → 1.67: spiking
    expect(changeTone('acwr', -0.2, 0.6, B)).toBe('caution')  // 0.8 → 0.6: detraining
    expect(changeTone('acwr', 0.1, 1.1, B)).toBe('neutral')   // 1.0 → 1.1: in range
  })
  it('no change is neutral', () => {
    expect(changeTone('ctl', 0, 75, B)).toBe('neutral')
  })
})

describe('niceTicks', () => {
  it('lands on round steps that cover the data', () => {
    expect(niceTicks(64, 75.1)).toEqual([60, 65, 70, 75, 80])
    expect(niceTicks(52, 130)).toEqual([40, 60, 80, 100, 120, 140])
    expect(niceTicks(-55.3, 6)).toEqual([-60, -40, -20, 0, 20])
  })
  it('handles ratios without float noise', () => {
    const t = niceTicks(0.8, 1.67)
    expect(t).toEqual([0.75, 1, 1.25, 1.5, 1.75])
  })
  it('first tick ≤ lo, last ≥ hi, evenly spaced', () => {
    for (const [lo, hi] of [[3, 97], [0.01, 0.04], [-12, -3], [1000, 1234]]) {
      const t = niceTicks(lo, hi)
      expect(t[0]).toBeLessThanOrEqual(lo)
      expect(t[t.length - 1]).toBeGreaterThanOrEqual(hi)
      const steps = t.slice(1).map((v, i) => +(v - t[i]).toFixed(9))
      expect(new Set(steps).size).toBe(1)
    }
  })
  it('a flat series still gets an axis; nonsense gets none', () => {
    expect(niceTicks(5, 5).length).toBeGreaterThan(1)
    expect(niceTicks(NaN, 3)).toEqual([])
  })
})

describe('rollingMean', () => {
  const pts = (vals: number[], start = '2026-10-01') => vals.map((value, i) => ({ date: shiftDate(start, i), value }))
  it('each day is the mean of itself and the two before', () => {
    expect(rollingMean(pts([3, 6, 9, 12])).map(p => p.value)).toEqual([3, 4.5, 6, 9])
  })
  it('a gap shrinks the window instead of borrowing from outside it', () => {
    const gappy = [{ date: '2026-10-01', value: 10 }, { date: '2026-10-05', value: 20 }, { date: '2026-10-06', value: 30 }]
    expect(rollingMean(gappy).map(p => p.value)).toEqual([10, 20, 25])
  })
  it('keeps input order and other fields', () => {
    const p = [{ date: '2026-10-02', value: 4, k: 'b' }, { date: '2026-10-01', value: 2, k: 'a' }]
    expect(rollingMean(p)).toEqual([{ date: '2026-10-02', value: 3, k: 'b' }, { date: '2026-10-01', value: 2, k: 'a' }])
  })
  it('crosses a month boundary by calendar date', () => {
    expect(rollingMean(pts([1, 2, 3], '2026-09-29')).map(p => p.value)).toEqual([1, 1.5, 2])
  })
  it('empty in, empty out', () => {
    expect(rollingMean([])).toEqual([])
  })
})

describe('healthyBands', () => {
  const B = { acwrLow: 0.8, acwrHigh: 1.3, tsbLow: -30, tsbHigh: 15 }
  it('Fitness: last week up to the safe weekly ramp; none without a reading a week back', () => {
    const t = days(14, 60)
    const bands = healthyBands(t, 'ctl', B)
    expect(bands.get(t[6].date)).toBeNull()
    expect(bands.get(t[7].date)).toEqual([60, 60 + FITNESS_SAFE_WEEKLY_RAMP])
    expect(bands.get(t[13].date)).toEqual([66, 66 + FITNESS_SAFE_WEEKLY_RAMP])
  })
  it('Fatigue: the Load Ratio band in Fatigue units', () => {
    const t = [p('2026-10-10', 50)]
    const [lo, hi] = healthyBands(t, 'atl', B).get('2026-10-10')!
    expect(lo).toBeCloseTo(40)
    expect(hi).toBeCloseTo(65)
  })
  it('Fatigue: none before Fitness has built', () => {
    expect(healthyBands([p('2026-10-10', 0.5)], 'atl', B).get('2026-10-10')).toBeNull()
  })
  it('Recovery Balance and Load Ratio: fixed ranges from the bounds', () => {
    const t = [p('2026-10-10', 50)]
    expect(healthyBands(t, 'tsb', B).get('2026-10-10')).toEqual([-30, 15])
    expect(healthyBands(t, 'acwr', { ...B, acwrHigh: 1.2 }).get('2026-10-10')).toEqual([0.8, 1.2])
  })
  it('captions say what each band means, with the tuned numbers', () => {
    expect(bandCaption('ctl', B)).toContain(`+${FITNESS_SAFE_WEEKLY_RAMP} a week`)
    expect(bandCaption('atl', B)).toContain('0.8–1.3× your Fitness')
    expect(bandCaption('tsb', B)).toContain('−30 to +15')
    expect(bandCaption('acwr', { ...B, acwrHigh: 1.2 })).toContain('0.8–1.2')
  })
})
