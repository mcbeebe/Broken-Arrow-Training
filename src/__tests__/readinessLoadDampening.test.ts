/**
 * Load-dampening pipeline (the "forecast24h from recent activities" follow-on
 * deferred by PR-13 — see readinessDampening.test.ts header).
 *
 * Proves the wired path APPLIES the logic: recent steep-descent bouts → a
 * canonical doseAU → a DOMS forecast → a load-dampening factor in [0.7, 1) that
 * actually lowers the readiness composite — while an athlete with no descent
 * data stays byte-identical to the undampened baseline (the GUARD).
 */
import { describe, it, expect } from 'vitest'
import { computeLoadDampening, calculateReadiness } from '../utils/readiness'
import { doseAUFromSteepDescent, DOSE_AU_PER_STEEP_DESCENT_M } from '../engines/descent/eccentricTrimp'
import type { GarminHealthData, ReadinessBaselines } from '../types'

const FOR_DATE = '2026-05-10'
const YESTERDAY = '2026-05-09'
const TWO_DAYS = '2026-05-08'
const STALE = '2026-04-25' // > DOMS carry window

describe('doseAUFromSteepDescent (cache → canonical doseAU)', () => {
  it('is 0 for flat / climb-only / non-positive input', () => {
    expect(doseAUFromSteepDescent(0)).toBe(0)
    expect(doseAUFromSteepDescent(-50)).toBe(0)
  })
  it('scales linearly: a ~1.1 km steep-descent day lands near the engine reference', () => {
    expect(doseAUFromSteepDescent(1000)).toBeCloseTo(100, 6)
    expect(doseAUFromSteepDescent(1100)).toBeCloseTo(110, 6) // ~hard BA 23K, spec §8.5
    expect(doseAUFromSteepDescent(300)).toBeCloseTo(300 * DOSE_AU_PER_STEEP_DESCENT_M, 6)
  })
})

describe('computeLoadDampening — APPLY (recent descent attenuates)', () => {
  it('a big recent downhill day floors the factor at 0.7', () => {
    const map = new Map([[YESTERDAY, 110]]) // ~1.1 km steep descent
    const f = computeLoadDampening(map, FOR_DATE)
    expect(f).toBeGreaterThanOrEqual(0.7)
    expect(f).toBeLessThan(1)
    expect(f).toBe(0.7)
  })

  it('a moderate downhill day lands strictly between the floor and 1', () => {
    const f = computeLoadDampening(new Map([[YESTERDAY, 15]]), FOR_DATE)
    expect(f).toBeGreaterThan(0.7)
    expect(f).toBeLessThan(1)
  })

  it('back-to-back descent days stack into MORE dampening than one', () => {
    const one = computeLoadDampening(new Map([[YESTERDAY, 8]]), FOR_DATE)
    const two = computeLoadDampening(new Map([[YESTERDAY, 8], [TWO_DAYS, 8]]), FOR_DATE)
    expect(two).toBeLessThan(one)
    expect(two).toBeGreaterThanOrEqual(0.7)
  })
})

describe('computeLoadDampening — GUARDS (stay at 1.0)', () => {
  it('no descent data → 1', () => {
    expect(computeLoadDampening(new Map(), FOR_DATE)).toBe(1)
  })
  it('only zero-dose (flat) entries → 1', () => {
    expect(computeLoadDampening(new Map([[YESTERDAY, 0]]), FOR_DATE)).toBe(1)
  })
  it('bout older than the carry window → 1', () => {
    expect(computeLoadDampening(new Map([[STALE, 200]]), FOR_DATE)).toBe(1)
  })
  it('same-day work does not dampen the morning score → 1', () => {
    expect(computeLoadDampening(new Map([[FOR_DATE, 200]]), FOR_DATE)).toBe(1)
  })
  it('unparseable date → 1', () => {
    expect(computeLoadDampening(new Map([[YESTERDAY, 100]]), 'not-a-date')).toBe(1)
  })
})

describe('end-to-end: dampening lowers the readiness composite when fatigued-by-descent', () => {
  // Undertraining-by-ACWR (loadScore = +1) so a descent debt should pull the
  // ready-looking score back down — the intuitive direction.
  const HEALTH: GarminHealthData = {
    date: FOR_DATE,
    hrv: { weeklyAvg: 56, lastNightAvg: 56, status: 'BALANCED' },
    rhr: 50,
    sleep: { durationSeconds: 7.5 * 3600, quality: 'GOOD', deepSeconds: 5400, lightSeconds: 12600, remSeconds: 4800, awakeSeconds: 600, score: 82 },
  }
  const BASELINES: ReadinessBaselines = {
    lnRmssd: { mean: Math.log(56), stdDev: 0.05, sampleSize: 14 },
    rhr: { mean: 50, stdDev: 2, sampleSize: 14 },
    sleepDuration: { mean: 7.5, stdDev: 0.5, sampleSize: 14 },
    sleepScore: { mean: 82, stdDev: 4, sampleSize: 14 },
    dailyTrimp: { mean: 80, stdDev: 20, sampleSize: 14 },
  }
  const UNDERTRAIN_ACWR = 0.7 // loadScore = +1
  const HRV_CV = 0.05

  it('a big recent descent day lowers the composite vs no descent data', () => {
    const dampening = computeLoadDampening(new Map([[YESTERDAY, 110]]), FOR_DATE)
    expect(dampening).toBeLessThan(1)
    const fatigued = calculateReadiness(HEALTH, BASELINES, UNDERTRAIN_ACWR, HRV_CV, dampening)
    const fresh = calculateReadiness(HEALTH, BASELINES, UNDERTRAIN_ACWR, HRV_CV, computeLoadDampening(new Map(), FOR_DATE))
    expect(fresh.composite).toBeGreaterThan(fatigued.composite)
    // GUARD: only the Load component moved; HRV/RHR/Sleep untouched.
    expect(fatigued.components.hrv).toBe(fresh.components.hrv)
    expect(fatigued.components.trainingLoad).toBe(fresh.components.trainingLoad) // raw score unchanged
  })
})
