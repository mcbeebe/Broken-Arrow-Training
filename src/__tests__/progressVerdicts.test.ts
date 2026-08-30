/**
 * The per-chart verdicts on Progress — plain-language reads grounded in the
 * thresholds the load and readiness engines already use.
 */
import { describe, it, expect } from 'vitest'
import { loadVerdict, readinessVerdict, MIN_LOAD_DAYS } from '../utils/progressVerdicts'
import type { PerformanceMetrics, ReadinessScore } from '../types'

const perf = (over: Partial<PerformanceMetrics>): PerformanceMetrics => ({
  date: '2026-08-01', ctl: 40, atl: 40, tsb: 0, acwr: 1.0, ...over,
})
// A series long enough to grade, with a controllable latest point and CTL start.
const series = (latest: Partial<PerformanceMetrics>, startCtl = 38): PerformanceMetrics[] => {
  const out = Array.from({ length: MIN_LOAD_DAYS }, (_, i) => perf({ date: `2026-08-0${i + 1}`, ctl: startCtl }))
  out[out.length - 1] = perf({ date: '2026-08-20', ctl: startCtl, ...latest })
  return out
}

const score = (over: Partial<ReadinessScore>): ReadinessScore => ({
  date: '2026-08-20', composite: 0.5, displayScore: 70, status: 'GREEN',
  trainingState: 'balanced', components: { hrv: 1, rhr: 1, sleep: 1, trainingLoad: 1 },
  message: '', ...over,
} as ReadinessScore)

describe('loadVerdict', () => {
  it('says nothing until there is enough history', () => {
    expect(loadVerdict([perf({}), perf({})])).toBeNull()
  })

  it('calls a genuine spike bad', () => {
    const v = loadVerdict(series({ acwr: 1.7 }))!
    expect(v.tone).toBe('bad')
    expect(v.headline).toBe('Load is spiking')
    expect(v.evidence).toContain('1.7')
  })

  it('flags a hard ramp as watch, not failure', () => {
    expect(loadVerdict(series({ acwr: 1.35 }))!.tone).toBe('watch')
  })

  it('calls the safe build zone good, and reports the CTL direction', () => {
    const v = loadVerdict(series({ acwr: 1.1, ctl: 46 }, 38))! // 46 vs 38 → rising
    expect(v.tone).toBe('good')
    expect(v.headline).toBe('Load building safely')
    expect(v.evidence).toContain('rising')
  })

  it('reads a light patch as neutral, never red', () => {
    const v = loadVerdict(series({ acwr: 0.6 }))!
    expect(v.tone).toBe('neutral')
    expect(v.headline).toBe('Load easing')
  })

  it('never paints an ordinary build red', () => {
    for (const acwr of [0.8, 1.0, 1.2, 1.29]) {
      expect(loadVerdict(series({ acwr }))!.tone, `acwr ${acwr}`).not.toBe('bad')
    }
  })
})

describe('readinessVerdict', () => {
  it('says nothing with no scores', () => {
    expect(readinessVerdict([])).toBeNull()
  })

  it('leads with the honest "you’re fine" on a steady green week', () => {
    const v = readinessVerdict([score({ displayScore: 71 }), score({ displayScore: 72 })])!
    expect(v.tone).toBe('good')
    expect(v.headline).toBe('Readiness holding')
  })

  it('notices a green week that is climbing', () => {
    const v = readinessVerdict([score({ displayScore: 60 }), score({ displayScore: 74 })])!
    expect(v.headline).toBe('Readiness climbing')
  })

  it('treats red as the body asking for easier days', () => {
    const v = readinessVerdict([score({ displayScore: 40, status: 'RED' })])!
    expect(v.tone).toBe('bad')
    expect(v.headline).toBe('Running down')
    expect(v.evidence).toContain('easier days')
  })

  it('keeps yellow a watch, not an alarm', () => {
    expect(readinessVerdict([score({ status: 'YELLOW', displayScore: 55 })])!.tone).toBe('watch')
  })

  it('celebrates a peak', () => {
    const v = readinessVerdict([score({ status: 'PEAK', displayScore: 88 })])!
    expect(v.tone).toBe('good')
    expect(v.headline).toBe('Primed')
  })
})

describe('the wiring (source guard)', () => {
  const DASH = Object.values(import.meta.glob('../components/Dashboard.tsx', { query: '?raw', import: 'default', eager: true }))[0] as string
  it('tops the readiness tab with a readiness verdict and the load tab with a load verdict', () => {
    expect(DASH).toMatch(/const verdict = readinessVerdict\(weekScores\)/)
    expect(DASH).toMatch(/const verdict = loadVerdict\(performance\)/)
    expect((DASH.match(/<ChartVerdictHeader verdict=\{verdict\} \/>/g) ?? []).length).toBe(2)
  })
})
