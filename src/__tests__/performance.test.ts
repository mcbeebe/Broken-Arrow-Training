import { describe, it, expect } from 'vitest'
import {
  calculateEWMA,
  calculatePerformanceTimeline,
  getTSBState,
  getACWRRisk,
  projectRaceDayTSB,
  generateWeeklyRecommendations,
} from '../utils/performance'

describe('calculateEWMA', () => {
  it('returns empty for empty input', () => {
    expect(calculateEWMA([], 7)).toEqual([])
  })

  it('decays toward zero with no new input', () => {
    const values = [
      { date: '2026-04-01', value: 100 },
      { date: '2026-04-02', value: 0 },
      { date: '2026-04-03', value: 0 },
      { date: '2026-04-04', value: 0 },
      { date: '2026-04-05', value: 0 },
      { date: '2026-04-06', value: 0 },
      { date: '2026-04-07', value: 0 },
      { date: '2026-04-08', value: 0 },
    ]
    const result = calculateEWMA(values, 7)
    // After 7 days of zero, the EWMA should have decayed significantly
    expect(result[result.length - 1].ewma).toBeLessThan(result[0].ewma * 0.5)
  })

  it('ATL (tau=7) decays faster than CTL (tau=42)', () => {
    const values = [
      { date: '2026-04-01', value: 100 },
      ...Array.from({ length: 30 }, (_, i) => ({
        date: `2026-04-${String(i + 2).padStart(2, '0')}`,
        value: 0,
      })),
    ]
    const atl = calculateEWMA(values, 7)
    const ctl = calculateEWMA(values, 42)
    // After 30 zero days, ATL should be much lower than CTL
    // (ATL reacts faster to the spike but also decays faster)
    const atlFinal = atl[atl.length - 1].ewma
    const ctlFinal = ctl[ctl.length - 1].ewma
    expect(atlFinal).toBeLessThan(ctlFinal)
  })

  it('converges to constant input value', () => {
    const values = Array.from({ length: 100 }, (_, i) => ({
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      value: 50,
    }))
    const result = calculateEWMA(values, 7)
    // After many iterations, should converge near 50
    expect(result[result.length - 1].ewma).toBeCloseTo(50, 0)
  })
})

describe('calculatePerformanceTimeline', () => {
  it('returns empty for empty input', () => {
    expect(calculatePerformanceTimeline([])).toEqual([])
  })

  it('computes CTL, ATL, TSB, and ACWR', () => {
    const daily = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      total: 50,
      records: [],
    }))
    const timeline = calculatePerformanceTimeline(daily)
    expect(timeline).toHaveLength(14)
    const last = timeline[timeline.length - 1]
    expect(last.ctl).toBeGreaterThan(0)
    expect(last.atl).toBeGreaterThan(0)
    expect(last.tsb).toBeDefined()
    expect(last.acwr).toBeGreaterThan(0)
  })

  it('TSB = CTL - ATL', () => {
    const daily = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-04-${String((i % 28) + 1).padStart(2, '0')}`,
      total: i < 20 ? 80 : 20, // heavy block then taper
      records: [],
    }))
    const timeline = calculatePerformanceTimeline(daily)
    for (const m of timeline) {
      expect(m.tsb).toBeCloseTo(m.ctl - m.atl, 1)
    }
  })

  it('TSB becomes positive during taper (ATL drops faster than CTL)', () => {
    const daily = [
      // 21 days of hard training
      ...Array.from({ length: 21 }, (_, i) => ({
        date: `2026-04-${String(i + 1).padStart(2, '0')}`,
        total: 80,
        records: [],
      })),
      // 10 days of taper
      ...Array.from({ length: 10 }, (_, i) => ({
        date: `2026-05-${String(i + 1).padStart(2, '0')}`,
        total: 10,
        records: [],
      })),
    ]
    const timeline = calculatePerformanceTimeline(daily)
    const last = timeline[timeline.length - 1]
    // After taper, TSB should be positive (fatigue dropped, fitness retained)
    expect(last.tsb).toBeGreaterThan(0)
  })

  it('ACWR = ATL / CTL with floor preventing division by zero', () => {
    const daily = [{ date: '2026-04-01', total: 0, records: [] }]
    const timeline = calculatePerformanceTimeline(daily)
    expect(timeline[0].acwr).toBe(0) // CTL <= 1, so returns 0
  })
})

describe('getTSBState', () => {
  it('classifies TSB ranges correctly', () => {
    expect(getTSBState(20)).toBe('peaked')
    expect(getTSBState(15)).toBe('peaked')
    expect(getTSBState(10)).toBe('well_rested')
    expect(getTSBState(5)).toBe('well_rested')
    expect(getTSBState(0)).toBe('productive')
    expect(getTSBState(-10)).toBe('productive')
    expect(getTSBState(-15)).toBe('overreaching')
    expect(getTSBState(-30)).toBe('overreaching')
    expect(getTSBState(-31)).toBe('danger')
    expect(getTSBState(-50)).toBe('danger')
  })
})

describe('getACWRRisk', () => {
  it('classifies ACWR ranges correctly', () => {
    expect(getACWRRisk(0.5)).toBe('detraining')
    expect(getACWRRisk(0.79)).toBe('detraining')
    expect(getACWRRisk(0.8)).toBe('sweet_spot')
    expect(getACWRRisk(1.0)).toBe('sweet_spot')
    expect(getACWRRisk(1.3)).toBe('sweet_spot')
    expect(getACWRRisk(1.31)).toBe('caution')
    expect(getACWRRisk(1.5)).toBe('caution')
    expect(getACWRRisk(1.51)).toBe('high_risk')
    expect(getACWRRisk(2.0)).toBe('high_risk')
  })
})

describe('projectRaceDayTSB', () => {
  it('returns onTrack=false for empty timeline', () => {
    const result = projectRaceDayTSB([], '2026-06-20')
    expect(result.onTrack).toBe(false)
  })

  it('projects TSB forward with taper', () => {
    // Simulate trained athlete at end of build phase
    const timeline = [{
      date: '2026-06-01',
      ctl: 45,
      atl: 55,
      tsb: -10,
      acwr: 1.22,
    }]
    // 19 days to race, with very low training (taper)
    const result = projectRaceDayTSB(timeline, '2026-06-20', 5)
    expect(result.daysOut).toBe(19)
    // After taper, TSB should increase (become more positive)
    expect(result.projectedTSB).toBeGreaterThan(-10)
  })
})

describe('generateWeeklyRecommendations', () => {
  it('returns empty for empty timeline', () => {
    expect(generateWeeklyRecommendations([], 1, '2026-06-20')).toEqual([])
  })

  it('flags overreaching when TSB < -30 for 3+ days', () => {
    const timeline = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-05-${String(i + 1).padStart(2, '0')}`,
      ctl: 40,
      atl: 80,
      tsb: -40,
      acwr: 2.0,
    }))
    const recs = generateWeeklyRecommendations(timeline, 5, '2026-06-20')
    expect(recs.some(r => r.type === 'overreaching')).toBe(true)
  })

  it('flags ACWR spike when > 1.5', () => {
    const timeline = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-05-${String(i + 1).padStart(2, '0')}`,
      ctl: 30,
      atl: 50,
      tsb: -20,
      acwr: 1.67,
    }))
    const recs = generateWeeklyRecommendations(timeline, 5, '2026-06-20')
    expect(recs.some(r => r.type === 'acwr_spike')).toBe(true)
  })

  it('flags low ACWR when < 0.8 for 5+ days', () => {
    const timeline = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-05-${String(i + 1).padStart(2, '0')}`,
      ctl: 40,
      atl: 25,
      tsb: 15,
      acwr: 0.625,
    }))
    const recs = generateWeeklyRecommendations(timeline, 5, '2026-06-20')
    expect(recs.some(r => r.type === 'acwr_low')).toBe(true)
  })
})
