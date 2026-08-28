import { describe, it, expect } from 'vitest'
import type { PlannedDay, TrainingWeek, WorkoutType } from '../../../types'
import { assessBenchmarkResult, benchmarkCompletedIso, scaleZoneTable } from '../../../engines/planGenerator/benchmarkResult'

/**
 * 4.1 tests: the benchmark loop closes. A completed 20-min TT proposes
 * an LTHR (Friel 95%-of-test-avg), a completed 1 km TT contributes only
 * the observed-max floor (a 4-minute all-out is above threshold), and
 * nothing qualifies without a meaningful delta or a plausible HR.
 */

function day(dayLabel: string, over: Partial<PlannedDay> & { type?: WorkoutType } = {}): PlannedDay {
  return {
    day: dayLabel,
    type: over.type ?? 'quality',
    workout: over.workout ?? 'BENCHMARK: 20-min time trial',
    detail: over.detail ?? '15-min warmup, 20 min at max sustainable, 12-min cooldown',
    zone: over.zone ?? 'LT · 130-148 bpm',
    route: 'Flat, measured', time: '45-50 min',
    ...over,
  }
}

function done(over: Record<string, unknown> = {}) {
  return {
    actual: {
      name: 'Field test', distance: 4.5, movingTime: 2820,
      avgHR: 172, maxHR: 183,
      ...over,
    } as unknown as PlannedDay['actual'],
  }
}

function week(days: PlannedDay[], num = 1, dates = 'Jul 1-7'): TrainingWeek {
  return { num, dates, miles: 20, focus: 'Base', days }
}

const TODAY = '2026-07-08'
const MAX_HR = 185
const CUR_LTHR = 150

describe('assessBenchmarkResult — method 20-min TT', () => {
  it('proposes LTHR = 95% of the test average HR (Friel)', () => {
    const a = assessBenchmarkResult([week([day('Wed 7/1', done())])], TODAY, MAX_HR, CUR_LTHR)
    expect(a.qualifies).toBe(true)
    expect(a.source).toBe('method_20min_tt')
    expect(a.ttAvgHR).toBe(172)
    expect(a.suggestedLthr).toBe(Math.round(172 * 0.95)) // 163
    expect(a.evidence[0]).toMatch(/Friel/)
  })

  it('prefers the fastest splits over the whole-session average', () => {
    const splits = [
      { split: 1, pace: '9:30', hr: 150, elev: 0 },
      { split: 2, pace: '7:10', hr: 175, elev: 0 },
      { split: 3, pace: '7:05', hr: 176, elev: 0 },
      { split: 4, pace: '7:15', hr: 174, elev: 0 },
      { split: 5, pace: '9:40', hr: 148, elev: 0 },
    ]
    const a = assessBenchmarkResult([week([day('Wed 7/1', done({ avgHR: 160, splits }))])], TODAY, MAX_HR, CUR_LTHR)
    expect(a.ttAvgHR).toBe(175) // avg of 176, 175, 174
    expect(a.suggestedLthr).toBe(Math.round(175 * 0.95))
    expect(a.evidence[0]).toMatch(/fastest splits/)
  })

  it('GUARD: a small LTHR delta is not worth re-anchoring', () => {
    // 172 avg → 163 suggested; current 163 → delta 0.
    const a = assessBenchmarkResult([week([day('Wed 7/1', done({ maxHR: undefined }))])], TODAY, MAX_HR, 163)
    expect(a.suggestedLthr).toBeNull()
    expect(a.qualifies).toBe(false)
  })

  it('GUARD: implausibly low test HR (bad strap) proposes nothing', () => {
    const a = assessBenchmarkResult([week([day('Wed 7/1', done({ avgHR: 95, maxHR: undefined }))])], TODAY, MAX_HR, CUR_LTHR)
    expect(a.suggestedLthr).toBeNull()
    expect(a.qualifies).toBe(false)
  })

  it('detects by workoutId when the workout text is customized', () => {
    const d = day('Wed 7/1', { workout: 'Field test day', ...done() })
    d.plannedWorkout = { workoutId: 'benchmark_20min_tt' } as unknown as PlannedDay['plannedWorkout']
    const a = assessBenchmarkResult([week([d])], TODAY, MAX_HR, CUR_LTHR)
    expect(a.source).toBe('method_20min_tt')
    expect(a.qualifies).toBe(true)
  })
})

describe('assessBenchmarkResult — Hyrox 1 km TT', () => {
  const hyroxDay = (over: Partial<PlannedDay> = {}) =>
    day('Wed 7/1', { workout: 'BENCHMARK: 1km time trial + erg baseline', ...over })

  it('never proposes LTHR from a ~4-minute all-out, but uses the observed max', () => {
    const a = assessBenchmarkResult(
      [week([hyroxDay(done({ avgHR: 178, maxHR: 195 }))])], TODAY, MAX_HR, CUR_LTHR,
    )
    expect(a.source).toBe('hyrox_1km_tt')
    expect(a.suggestedLthr).toBeNull()
    expect(a.suggestedMaxHR).toBe(195)
    expect(a.qualifies).toBe(true)
    expect(a.evidence[0]).toMatch(/floor/)
  })

  it('GUARD: an observed max at/below the configured max proposes nothing', () => {
    const a = assessBenchmarkResult(
      [week([hyroxDay(done({ avgHR: 178, maxHR: 184 }))])], TODAY, MAX_HR, CUR_LTHR,
    )
    expect(a.suggestedMaxHR).toBeNull()
    expect(a.qualifies).toBe(false)
  })

  it('a TT filed as a SECONDARY still closes the loop', () => {
    // A standalone ~5-min recording fails the duration-share matching
    // gate and lands in secondaryActuals — the benchmark must still see it.
    const d = hyroxDay()
    d.secondaryActuals = [
      { name: 'Morning walk', distance: 1, movingTime: 1200, avgHR: 95, type: 'Walk' },
      { name: '1km TT', distance: 0.62, movingTime: 265, avgHR: 178, maxHR: 195, type: 'Run' },
    ] as unknown as PlannedDay['secondaryActuals']
    const a = assessBenchmarkResult([week([d])], TODAY, MAX_HR, CUR_LTHR)
    expect(a.source).toBe('hyrox_1km_tt')
    expect(a.suggestedMaxHR).toBe(195) // read from the hardest secondary
    expect(a.qualifies).toBe(true)
  })

  it('reads the erg baseline (500m split) straight from an erg recording', () => {
    // 1000m erg in 3:45 → 1:52/500m (0.6214 mi ≈ 1000 m).
    const d = hyroxDay(done({ avgHR: 165, maxHR: 180 }))
    d.secondaryActuals = [
      { name: '1k erg TT', distance: 0.6214, movingTime: 225, avgHR: 170, type: 'Rowing' },
    ] as unknown as PlannedDay['secondaryActuals']
    const a = assessBenchmarkResult([week([d])], TODAY, MAX_HR, CUR_LTHR)
    expect(a.suggestedErg500Sec).toBe(112)
    expect(a.qualifies).toBe(true)
    expect(a.evidence.some(e => /1:52 \/500m/.test(e))).toBe(true)
    // Already recorded at the same split → no re-suggestion.
    const again = assessBenchmarkResult([week([d])], TODAY, MAX_HR, CUR_LTHR, 112)
    expect(again.suggestedErg500Sec).toBeNull()
  })

  it('an unpaired erg (0 m distance) still yields the baseline from its duration', () => {
    // The field case: watch-recorded Indoor Rowing, 3:34 (214 s), 0 m —
    // a plausibly-1km piece by duration → 1:47 /500m.
    const d = hyroxDay(done({ avgHR: 169, maxHR: 193 }))
    d.secondaryActuals = [
      { name: 'Indoor Rowing', distance: 0, movingTime: 214, avgHR: 169, type: 'indoor_rowing' },
    ] as unknown as PlannedDay['secondaryActuals']
    const a = assessBenchmarkResult([week([d])], TODAY, MAX_HR, CUR_LTHR)
    expect(a.suggestedErg500Sec).toBe(107)
  })

  it('an erg recording that claimed the day as PRIMARY also yields the baseline', () => {
    const d = hyroxDay({
      workout: 'BENCHMARK: 1km erg time trial',
      ...done({ avgHR: 168, maxHR: 182, distance: 0.6214, movingTime: 230, type: 'Indoor Rowing' }),
    })
    const a = assessBenchmarkResult([week([d])], TODAY, MAX_HR, CUR_LTHR)
    expect(a.suggestedErg500Sec).toBe(115)
    expect(a.qualifies).toBe(true)
  })
})

describe('benchmarkCompletedIso', () => {
  it('reports the completed benchmark from a primary or a secondary, never from the future', () => {
    expect(benchmarkCompletedIso([week([day('Wed 7/1', done())])], TODAY)).toBe('2026-07-01')
    const secondaryOnly = day('Wed 7/1')
    secondaryOnly.secondaryActuals = [
      { name: '1km TT', distance: 0.62, movingTime: 265, avgHR: 178, type: 'Run' },
    ] as unknown as PlannedDay['secondaryActuals']
    expect(benchmarkCompletedIso([week([secondaryOnly])], TODAY)).toBe('2026-07-01')
    expect(benchmarkCompletedIso([week([day('Wed 7/1')])], TODAY)).toBeNull()
    expect(benchmarkCompletedIso([week([day('Wed 7/15', done())], 1, 'Jul 13-19')], '2026-07-08')).toBeNull()
  })
})

describe('assessBenchmarkResult — liveness guards', () => {
  it('an unlogged benchmark day proposes nothing', () => {
    const a = assessBenchmarkResult([week([day('Wed 7/1')])], TODAY, MAX_HR, CUR_LTHR)
    expect(a.qualifies).toBe(false)
    expect(a.source).toBeNull()
  })

  it('a benchmark dated after today is ignored', () => {
    const a = assessBenchmarkResult([week([day('Wed 7/15', done())], 1, 'Jul 13-19')], '2026-07-08', MAX_HR, CUR_LTHR)
    expect(a.qualifies).toBe(false)
  })

  it('a plan with no benchmark day proposes nothing', () => {
    const a = assessBenchmarkResult(
      [week([day('Wed 7/1', { workout: 'Tempo 5mi', ...done() })])], TODAY, MAX_HR, CUR_LTHR,
    )
    expect(a.qualifies).toBe(false)
  })
})

describe('scaleZoneTable', () => {
  const zones = [
    { zone: 'Z1', hr: '102–120', pct: '55-65%', desc: 'Recovery' },
    { zone: 'Z2', hr: '120–139', pct: '65-75%', desc: 'Aerobic' },
    { zone: 'Z3', hr: '139–157', pct: '75-85%', desc: 'Tempo' },
  ]

  it('scales every band by the anchor ratio, preserving labels', () => {
    const out = scaleZoneTable(zones, 185, 195)
    expect(out[0].hr).toBe(`${Math.round(102 * 195 / 185)}–${Math.round(120 * 195 / 185)}`)
    expect(out[0].zone).toBe('Z1')
    expect(out[0].pct).toBe('55-65%')
    expect(out[2].hr).toBe(`${Math.round(139 * 195 / 185)}–${Math.round(157 * 195 / 185)}`)
  })

  it('identity when the anchor is unchanged', () => {
    expect(scaleZoneTable(zones, 185, 185)).toEqual(zones)
  })
})
