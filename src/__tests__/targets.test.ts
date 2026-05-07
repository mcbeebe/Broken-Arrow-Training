import { describe, it, expect } from 'vitest'
import {
  parseDistance,
  parseHRRange,
  parseDuration,
  parseElevation,
  parsePlannedTargets,
} from '../utils/targets'
import type { PlannedDay } from '../types'

describe('parseDistance', () => {
  it('parses typical run zone string', () => {
    expect(parseDistance('3.0 mi · Z1–2 (108–148)')).toBe(3.0)
    expect(parseDistance('7.0 mi · Z1–2 (108–148)')).toBe(7.0)
  })
  it('parses integer distances', () => {
    expect(parseDistance('5 mi · Z2 (128–148)')).toBe(5)
  })
  it('parses intervals / bounds strings', () => {
    expect(parseDistance('3.5 mi · Z3 intervals (148–167)')).toBe(3.5)
    expect(parseDistance('4.0 mi · Z4 bounds (167–177)')).toBe(4.0)
  })
  it('returns undefined for strength/cross-train with no distance', () => {
    expect(parseDistance('Z1 (108–128)')).toBeUndefined()
    expect(parseDistance('Z2 (128–148)')).toBeUndefined()
  })
  it('returns undefined for rest days', () => {
    expect(parseDistance('—')).toBeUndefined()
    expect(parseDistance('')).toBeUndefined()
  })
})

describe('parseHRRange', () => {
  it('parses ranges from parentheses', () => {
    expect(parseHRRange('3.0 mi · Z1–2 (108–148)')).toEqual({ low: 108, high: 148 })
    expect(parseHRRange('Z1 (108–128)')).toEqual({ low: 108, high: 128 })
    expect(parseHRRange('3.1 mi · Z3–4 (148–177)')).toEqual({ low: 148, high: 177 })
  })
  it('parses both en-dash and hyphen', () => {
    expect(parseHRRange('(100-120)')).toEqual({ low: 100, high: 120 })
    expect(parseHRRange('(100–120)')).toEqual({ low: 100, high: 120 })
  })
  it('returns undefined when no range present', () => {
    expect(parseHRRange('—')).toBeUndefined()
    expect(parseHRRange('Z1')).toBeUndefined()
  })
})

describe('parseDuration', () => {
  it('parses minute-only strings', () => {
    expect(parseDuration('45 min')).toBe(45)
    expect(parseDuration('30 min')).toBe(30)
    expect(parseDuration('20 min')).toBe(20)
  })
  it('parses hour-only strings', () => {
    expect(parseDuration('1 hr')).toBe(60)
    expect(parseDuration('2 hr')).toBe(120)
  })
  it('parses combined hr + min', () => {
    expect(parseDuration('1 hr 10 min')).toBe(70)
    expect(parseDuration('1 hr 30 min')).toBe(90)
    expect(parseDuration('2 hr 15 min')).toBe(135)
    expect(parseDuration('1 hr 15 min')).toBe(75)
  })
  it('handles "1 hr+" as lower bound', () => {
    expect(parseDuration('1 hr+')).toBe(60)
  })
  it('returns undefined for rest-day markers', () => {
    expect(parseDuration('—')).toBeUndefined()
    expect(parseDuration('')).toBeUndefined()
  })
})

describe('parseElevation', () => {
  it('parses elevation gain from detail strings', () => {
    expect(parseElevation('~760 ft gain. Practice gels.')).toBe(760)
    expect(parseElevation('~2,000 ft gain. Full race nutrition.')).toBe(2000)
    expect(parseElevation('1528 ft gain')).toBe(1528)
    expect(parseElevation('Big vert ~1,200 ft climbing')).toBe(1200)
  })
  it('returns undefined when no ft mentioned', () => {
    expect(parseElevation('Post-race recovery')).toBeUndefined()
    expect(parseElevation('')).toBeUndefined()
  })
})

describe('parsePlannedTargets', () => {
  const mkDay = (overrides: Partial<PlannedDay>): PlannedDay => ({
    day: 'Mon 4/13',
    type: 'run',
    workout: 'Easy run',
    detail: 'Conversational pace',
    zone: '3.0 mi · Z1–2 (108–148)',
    route: 'Temescal Lake Park',
    time: '45 min',
    ...overrides,
  })

  it('derives full set of targets for a run day', () => {
    const t = parsePlannedTargets(mkDay({}))
    expect(t).toEqual({
      distanceMi: 3.0,
      durationMin: 45,
      // Run days also get a running-time range derived from distance/zone:
      // 3.0 mi × (10.5–12.5 min/mi easy flat) = 32–38 min
      durationMinLow: 32,
      durationMinHigh: 38,
      hrLow: 108,
      hrHigh: 148,
    })
  })

  it('handles strength day (no distance, has HR + duration)', () => {
    const t = parsePlannedTargets(mkDay({
      type: 'strength',
      zone: 'Z1 (108–128)',
      time: '1 hr',
      detail: 'BB squat 3×10',
    }))
    expect(t).toEqual({
      durationMin: 60,
      hrLow: 108,
      hrHigh: 128,
    })
    expect(t.distanceMi).toBeUndefined()
  })

  it('handles rest day (no targets)', () => {
    const t = parsePlannedTargets(mkDay({
      type: 'rest',
      zone: '—',
      time: '—',
      detail: '',
    }))
    expect(t).toEqual({})
  })

  it('picks up elevation from detail', () => {
    const t = parsePlannedTargets(mkDay({
      detail: '~2,000 ft gain. Big day.',
      zone: '8.0 mi · Z1–2 (108–148)',
      time: '2 hr 30 min',
    }))
    expect(t.elevationFt).toBe(2000)
    expect(t.distanceMi).toBe(8.0)
    expect(t.durationMin).toBe(150)
  })

  it('shifts HR target band down for cycling actuals', () => {
    // Plan was a Z4 running interval (167–177); athlete completed it as
    // indoor cycling, where steady-state HR is ~10 bpm lower at the same
    // perceived effort. Target band should shift to 157–167.
    const t = parsePlannedTargets(
      mkDay({ type: 'quality', zone: '4.0 mi · Z4 (167–177)' }),
      'cycling',
    )
    expect(t.hrLow).toBe(157)
    expect(t.hrHigh).toBe(167)
  })

  it('leaves HR target band unchanged for running actuals', () => {
    const t = parsePlannedTargets(mkDay({}), 'running')
    expect(t.hrLow).toBe(108)
    expect(t.hrHigh).toBe(148)
  })

  it('shifts HR band further for swimming', () => {
    const t = parsePlannedTargets(
      mkDay({ zone: 'Z2 (128–148)', type: 'cross' }),
      'swimming',
    )
    expect(t.hrLow).toBe(116)
    expect(t.hrHigh).toBe(136)
  })

  it('uses athlete-customized HR zones (maxHR override) over plan defaults', () => {
    // Plan zone string is "Z4 (167–177)" — baked from default maxHR=197.
    // Athlete bumped maxHR to 200, so their custom Z4 is 170–180. The
    // grader should resolve the Z4 label against the customized zones.
    const userZones = [
      { zone: 'Z1 – Recovery', hr: '110–130', pct: '55–65%', desc: '' },
      { zone: 'Z2 – Aerobic', hr: '130–150', pct: '65–75%', desc: '' },
      { zone: 'Z3 – Tempo', hr: '150–170', pct: '75–85%', desc: '' },
      { zone: 'Z4 – Threshold', hr: '170–180', pct: '85–90%', desc: '' },
    ]
    const t = parsePlannedTargets(
      mkDay({ type: 'quality', zone: '4.0 mi · Z4 (167–177)' }),
      'running',
      userZones,
    )
    expect(t.hrLow).toBe(170)
    expect(t.hrHigh).toBe(180)
  })

  it('stacks customized zones with cycling sport offset', () => {
    // maxHR=200 + indoor cycling: user's Z4 (170–180) shifted by −10 → 160–170
    const userZones = [
      { zone: 'Z1 – Recovery', hr: '110–130', pct: '55–65%', desc: '' },
      { zone: 'Z2 – Aerobic', hr: '130–150', pct: '65–75%', desc: '' },
      { zone: 'Z3 – Tempo', hr: '150–170', pct: '75–85%', desc: '' },
      { zone: 'Z4 – Threshold', hr: '170–180', pct: '85–90%', desc: '' },
    ]
    const t = parsePlannedTargets(
      mkDay({ type: 'quality', zone: '4.0 mi · Z4 (167–177)' }),
      'cycling',
      userZones,
    )
    expect(t.hrLow).toBe(160)
    expect(t.hrHigh).toBe(170)
  })
})
