/**
 * P2 — the morning verdict, on every morning.
 *
 * The engine only spoke on days it acted. These are the other days: green
 * ones, ones where it is still learning the athlete's baseline, and ones
 * where there is no wearable to ask at all. Silence used to be the answer
 * to all three.
 */
import { describe, it, expect } from 'vitest'
import { buildVerdict, type VerdictInputs } from '../utils/verdict'
import { HRV_BASELINE_NIGHTS } from '../engines/adaptive/morningOutlook'
import type { ReadinessScore, ReadinessBaselines, GarminHealthData, PlannedDay } from '../types'

const score = (displayScore: number, status: ReadinessScore['status']): ReadinessScore => ({
  date: '2026-08-29', composite: 0.8, displayScore, status, trainingState: 'A',
  components: { hrv: 1, rhr: 1, sleep: 1, trainingLoad: 1 }, message: '',
})

const baselines = (): ReadinessBaselines => ({
  lnRmssd: { mean: Math.log(58), stdDev: 0.2, sampleSize: 21 },
  rhr: { mean: 47, stdDev: 2, sampleSize: 21 },
  sleepDuration: { mean: 7.2 * 3600, stdDev: 1800, sampleSize: 21 },
  sleepScore: { mean: 80, stdDev: 8, sampleSize: 21 },
  dailyTrimp: { mean: 60, stdDev: 15, sampleSize: 21 },
})

const health = (sleepH: number, hrv: number): GarminHealthData => ({
  date: '2026-08-29',
  sleep: { durationSeconds: sleepH * 3600, quality: 'GOOD', deepSeconds: 0, remSeconds: 0, lightSeconds: 0, awakeSeconds: 0 },
  hrv: { weeklyAvg: hrv, lastNightAvg: hrv, status: 'BALANCED' },
})

const tempo = (): PlannedDay => ({
  day: 'Fri', type: 'quality', workout: 'Tempo — 4×5min @ AnT',
  detail: '', zone: 'Z4', route: '', time: '50 min',
})

const inputs = (over: Partial<VerdictInputs> = {}): VerdictInputs => ({
  score: score(82, 'GREEN'),
  baselines: baselines(),
  health: health(7.8, 64),
  today: tempo(),
  nightsOfHistory: 21,
  hasSource: true,
  ...over,
})

describe('the green morning', () => {
  it('answers the question instead of staying silent', () => {
    const v = buildVerdict(inputs())
    expect(v.tone).toBe('clear')
    expect(v.headline).toBe('All clear — go as planned.')
    expect(v.score).toBe(82)
  })

  it('shows sleep against the athlete\'s own baseline, not a norm', () => {
    const v = buildVerdict(inputs())
    const sleep = v.evidence.find(e => e.label === 'Sleep')!
    expect(sleep.value).toBe('7.8h')
    expect(sleep.sub).toBe('above your 7.2h baseline')
  })

  it('says HRV is at baseline when it is within noise', () => {
    const v = buildVerdict(inputs({ health: health(7.8, 59) }))
    expect(v.evidence.find(e => e.label === 'HRV')!.sub).toBe('at baseline')
  })

  it('quantifies a real HRV gap rather than hand-waving it', () => {
    const v = buildVerdict(inputs({ health: health(7.8, 48) }))
    expect(v.evidence.find(e => e.label === 'HRV')!.sub).toBe('10 under baseline')
  })

  it('promises that nothing was moved', () => {
    expect(buildVerdict(inputs()).footer).toContain('nothing was changed')
  })
})

describe('one bad night', () => {
  it('is named out loud, but does not move the session', () => {
    const v = buildVerdict(inputs({ score: score(54, 'YELLOW'), health: health(5.9, 48) }))
    expect(v.tone).toBe('watch')
    expect(v.headline).toBe('A bit under — your call.')
    expect(v.sub).toContain('One night')
    expect(v.footer).toContain('nothing was changed')
  })

  it('shows the sleep shortfall against baseline', () => {
    const v = buildVerdict(inputs({ score: score(54, 'YELLOW'), health: health(5.9, 48) }))
    expect(v.evidence.find(e => e.label === 'Sleep')!.sub).toBe('under your 7.2h baseline')
  })
})

describe('while the engine is still learning', () => {
  it('counts the nights instead of going quiet', () => {
    const v = buildVerdict(inputs({ nightsOfHistory: 12 }))
    expect(v.tone).toBe('arming')
    expect(v.sub).toContain(`12 of ${HRV_BASELINE_NIGHTS} nights`)
    expect(v.footer).toContain('arms in 9 nights')
  })

  it('uses the singular on the last night', () => {
    expect(buildVerdict(inputs({ nightsOfHistory: 20 })).footer).toContain('arms in 1 night.')
  })

  it('promises not to act before it knows the baseline', () => {
    expect(buildVerdict(inputs({ nightsOfHistory: 3 })).sub).toContain("won't move a session")
  })
})

describe('no wearable at all', () => {
  it('hands the decision back rather than showing an empty ring', () => {
    const v = buildVerdict(inputs({ hasSource: false, health: null, score: null, baselines: null }))
    expect(v.tone).toBe('unknown')
    expect(v.headline).toBe('Go by feel today.')
    expect(v.score).toBeNull()
  })

  it('names both sources, never just Garmin', () => {
    const v = buildVerdict(inputs({ hasSource: false, health: null, score: null }))
    expect(v.footer).toContain('Garmin or Apple')
  })

  it('still shows what it does know about today', () => {
    const v = buildVerdict(inputs({ hasSource: false, health: null, score: null }))
    expect(v.evidence.find(e => e.label === 'Today')!.value).toBe('50 min')
  })
})

describe('missing signals', () => {
  it('omits a signal it has no data for rather than dashing it', () => {
    const v = buildVerdict(inputs({ health: { date: '2026-08-29' } }))
    expect(v.evidence.some(e => e.label === 'Sleep')).toBe(false)
    expect(v.evidence.some(e => e.label === 'HRV')).toBe(false)
    expect(v.evidence.some(e => e.label === 'Today')).toBe(true)
  })

  it('never shows more than three tiles', () => {
    expect(buildVerdict(inputs()).evidence.length).toBeLessThanOrEqual(3)
  })

  it('calls a rest day a rest day', () => {
    const rest: PlannedDay = { ...tempo(), type: 'rest', workout: 'Rest', time: '—' }
    expect(buildVerdict(inputs({ today: rest })).evidence.find(e => e.label === 'Today')!.value).toBe('rest day')
  })
})
