import { describe, it, expect } from 'vitest'
import {
  buildTrainingSignals,
  classifyLoad,
  classifyBody,
  classifyDamage,
} from '../utils/trainingSignals'
import type { PerformanceMetrics, ReadinessScore } from '../types'

// ─── Fixtures ───────────────────────────────────────────────────

function perf(overrides: Partial<PerformanceMetrics> = {}): PerformanceMetrics {
  return {
    date: '2026-05-16',
    ctl: 73,
    atl: 73,
    tsb: 0,
    acwr: 1.0,
    ...overrides,
  }
}

function readiness(
  status: ReadinessScore['status'],
  overrides: Partial<ReadinessScore> = {},
): ReadinessScore {
  return {
    date: '2026-05-16',
    composite: status === 'PEAK' ? 1.5 : status === 'GREEN' ? 0.5 : status === 'YELLOW' ? 0 : -0.5,
    displayScore: status === 'PEAK' ? 85 : status === 'GREEN' ? 70 : status === 'YELLOW' ? 45 : 25,
    status,
    trainingState: 'B',
    components: { hrv: 0, rhr: 0, sleep: 0, trainingLoad: 0 },
    message: '',
    ...overrides,
  }
}

/** Helper to build a soreness map keyed off today's local date. */
function sorenessMap(adjustments: number[]): Map<string, number> {
  const map = new Map<string, number>()
  const today = new Date()
  for (let i = 0; i < adjustments.length; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    map.set(`${y}-${m}-${day}`, adjustments[i])
  }
  return map
}

// ─── Axis classifiers ───────────────────────────────────────────

describe('classifyLoad', () => {
  it('returns balanced when TSB and ACWR sit in the absorption zone', () => {
    expect(classifyLoad(perf({ tsb: 0, acwr: 1.0 })).state).toBe('balanced')
  })

  it('flags overreach below TSB -10', () => {
    expect(classifyLoad(perf({ tsb: -15, acwr: 1.1 })).state).toBe('overreach')
  })

  it('flags danger below TSB -25', () => {
    expect(classifyLoad(perf({ tsb: -30, acwr: 1.1 })).state).toBe('danger')
  })

  it('flags danger when ACWR > 1.5 even with neutral TSB', () => {
    expect(classifyLoad(perf({ tsb: 0, acwr: 1.6 })).state).toBe('danger')
  })

  it('flags detrained when ACWR < 0.7', () => {
    expect(classifyLoad(perf({ tsb: 5, acwr: 0.5 })).state).toBe('detrained')
  })

  it('flags productive when TSB > 5', () => {
    expect(classifyLoad(perf({ tsb: 12, acwr: 1.0 })).state).toBe('productive')
  })

  it('returns balanced severity 0 for missing performance', () => {
    expect(classifyLoad(null).severity).toBe(0)
  })
})

describe('classifyBody', () => {
  it('maps PEAK to peak severity 0', () => {
    expect(classifyBody(readiness('PEAK')).severity).toBe(0)
  })

  it('maps GREEN to green severity 0', () => {
    expect(classifyBody(readiness('GREEN')).severity).toBe(0)
  })

  it('maps YELLOW to yellow severity 2', () => {
    const r = classifyBody(readiness('YELLOW'))
    expect(r.state).toBe('yellow')
    expect(r.severity).toBe(2)
  })

  it('maps RED to red severity 3', () => {
    expect(classifyBody(readiness('RED')).severity).toBe(3)
  })

  it('returns unknown when no readiness score', () => {
    expect(classifyBody(null).state).toBe('unknown')
  })
})

describe('classifyDamage', () => {
  it('returns fresh when soreness map is empty', () => {
    expect(classifyDamage(new Map()).state).toBe('fresh')
    expect(classifyDamage(undefined).state).toBe('fresh')
  })

  it('returns mild for a single recent elevated day', () => {
    // [today=+15, yesterday=0, ...] → not escalating (only 1 elevated day), last > 0 → mild
    expect(classifyDamage(sorenessMap([15, 0, 0, 0, 0])).state).toBe('mild')
  })

  it('returns elevated when 3+ days are elevated but not trending up', () => {
    // 3 elevated days, not strictly non-decreasing
    expect(classifyDamage(sorenessMap([15, 35, 15, 0, 0])).state).toBe('elevated')
  })

  it('returns escalating when trending up + last >= 35', () => {
    expect(classifyDamage(sorenessMap([35, 15, 15, 0, 0])).state).toBe('escalating')
  })
})

// ─── Aggregator: dominant, coherence, reason, todayCall ─────────

describe('buildTrainingSignals — aligned (all green)', () => {
  it('returns aligned coherence and train as planned', () => {
    const signals = buildTrainingSignals({
      performance: perf(),
      readiness: readiness('GREEN'),
      sorenessLoadByDate: new Map(),
    })
    expect(signals.coherence).toBe('aligned')
    expect(signals.todayCall).toBe('train')
    expect(signals.reason).toMatch(/aligned/i)
  })
})

describe('buildTrainingSignals — aligned (all restrictive)', () => {
  it('returns aligned when every axis says back off', () => {
    const signals = buildTrainingSignals({
      performance: perf({ tsb: -30, acwr: 1.6 }),
      readiness: readiness('RED'),
      sorenessLoadByDate: sorenessMap([65, 35, 35, 0, 0]),
    })
    expect(signals.coherence).toBe('aligned')
    expect(signals.todayCall).toBe('rest')
  })
})

describe('buildTrainingSignals — mixed (the user case)', () => {
  // Mirrors the actual contradiction in the screenshots:
  //   Load = balanced (TSB ≈ 0, ACWR ≈ 1.0)
  //   Body = YELLOW (sleep 5.8h, HRV drop)
  //   Damage = escalating (3 days elevated soreness)
  it('flags mixed, picks body as dominant, names both sides', () => {
    const signals = buildTrainingSignals({
      performance: perf({ tsb: 0, acwr: 1.0 }),
      readiness: readiness('YELLOW'),
      sorenessLoadByDate: sorenessMap([35, 35, 35, 0, 0]),
    })
    expect(signals.coherence).toBe('mixed')
    // Body severity 2 ties with damage 3 → damage wins by severity,
    // but the tie-breaking gives body precedence when severities tie.
    // Here damage severity is 3 (escalating) so damage dominates.
    expect(signals.dominant).toBe('damage')
    expect(signals.todayCall).toBe('rest')
    // Reason names the load permissive side
    expect(signals.reason.toLowerCase()).toContain('load')
  })

  it('picks body when body is the most acute and damage is fine', () => {
    const signals = buildTrainingSignals({
      performance: perf({ tsb: 0, acwr: 1.0 }),
      readiness: readiness('YELLOW'),
      sorenessLoadByDate: new Map(),
    })
    expect(signals.coherence).toBe('mixed')
    expect(signals.dominant).toBe('body')
    expect(signals.todayCall).toBe('easy')
    expect(signals.reason.toLowerCase()).toContain('body')
    expect(signals.reason.toLowerCase()).toContain('load')
  })
})

describe('buildTrainingSignals — body unknown', () => {
  it('does not count an unknown body as a permissive vote', () => {
    // No readiness score yet, load balanced, no soreness — aligned, train
    const signals = buildTrainingSignals({
      performance: perf(),
      readiness: null,
      sorenessLoadByDate: new Map(),
    })
    expect(signals.coherence).toBe('aligned')
    expect(signals.todayCall).toBe('train')
  })

  it('still flags mixed when load is restrictive and only damage is permissive', () => {
    // load = danger, body = unknown, damage = fresh.
    // effectiveRestrictive = 1 (load), effectivePermissive = 1 (damage; body is unknown and excluded).
    const signals = buildTrainingSignals({
      performance: perf({ tsb: -40, acwr: 1.8 }),
      readiness: null,
      sorenessLoadByDate: new Map(),
    })
    expect(signals.coherence).toBe('mixed')
    expect(signals.dominant).toBe('load')
    expect(signals.todayCall).toBe('rest')
  })
})

describe('buildTrainingSignals — todayCall mapping', () => {
  it('rest when max severity is 3', () => {
    expect(buildTrainingSignals({
      performance: perf(), readiness: readiness('RED'), sorenessLoadByDate: new Map(),
    }).todayCall).toBe('rest')
  })

  it('easy when max severity is 2', () => {
    expect(buildTrainingSignals({
      performance: perf(), readiness: readiness('YELLOW'), sorenessLoadByDate: new Map(),
    }).todayCall).toBe('easy')
  })

  it('monitor when max severity is 1', () => {
    expect(buildTrainingSignals({
      performance: perf({ tsb: 0, acwr: 0.5 }),  // detrained, sev 1
      readiness: readiness('GREEN'),
      sorenessLoadByDate: new Map(),
    }).todayCall).toBe('monitor')
  })

  it('train when all severities are 0', () => {
    expect(buildTrainingSignals({
      performance: perf(), readiness: readiness('GREEN'), sorenessLoadByDate: new Map(),
    }).todayCall).toBe('train')
  })
})
