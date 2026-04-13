import { describe, it, expect } from 'vitest'
import {
  calculateBaseline,
  scoreLnRmssd,
  scoreRhr,
  scoreSleep,
  scoreTrainingLoad,
  classifyStatus,
  calculateReadiness,
  applyGuardrails,
  checkHRVStability,
  suggestDailyAdjustment,
  generateReadinessMessage,
} from '../utils/readiness'
import type { GarminHealthData, ReadinessScore, DailyTRIMP } from '../types'

describe('calculateBaseline', () => {
  it('returns zero baseline for empty array', () => {
    const b = calculateBaseline([])
    expect(b.mean).toBe(0)
    expect(b.stdDev).toBe(0)
    expect(b.sampleSize).toBe(0)
  })

  it('calculates correct mean and stdDev', () => {
    const values = [50, 50, 50, 50]
    const b = calculateBaseline(values)
    expect(b.mean).toBe(50)
    expect(b.stdDev).toBe(0)
    expect(b.sampleSize).toBe(4)
  })

  it('handles NaN values gracefully', () => {
    const values = [50, NaN, 60, NaN, 70]
    const b = calculateBaseline(values)
    expect(b.mean).toBe(60)
    expect(b.sampleSize).toBe(3)
  })
})

describe('scoreLnRmssd', () => {
  it('returns 50 when no HRV data', () => {
    expect(scoreLnRmssd(undefined, { mean: 4, stdDev: 0.2, sampleSize: 30 })).toBe(50)
  })

  it('returns 50 with insufficient baseline', () => {
    expect(scoreLnRmssd(50, { mean: 4, stdDev: 0.2, sampleSize: 2 })).toBe(50)
  })

  it('scores above 50 when HRV is above baseline', () => {
    // ln(60) ≈ 4.09, baseline mean 3.9 → above baseline
    const score = scoreLnRmssd(60, { mean: 3.9, stdDev: 0.2, sampleSize: 30 })
    expect(score).toBeGreaterThan(50)
  })

  it('scores below 50 when HRV is below baseline', () => {
    // ln(35) ≈ 3.56, baseline mean 3.9 → below baseline
    const score = scoreLnRmssd(35, { mean: 3.9, stdDev: 0.2, sampleSize: 30 })
    expect(score).toBeLessThan(50)
  })

  it('clamps between 0 and 100', () => {
    const veryHigh = scoreLnRmssd(200, { mean: 3.0, stdDev: 0.1, sampleSize: 30 })
    const veryLow = scoreLnRmssd(5, { mean: 4.5, stdDev: 0.1, sampleSize: 30 })
    expect(veryHigh).toBeLessThanOrEqual(100)
    expect(veryLow).toBeGreaterThanOrEqual(0)
  })
})

describe('scoreRhr', () => {
  it('returns 50 when no RHR data', () => {
    expect(scoreRhr(undefined, { mean: 55, stdDev: 3, sampleSize: 30 })).toBe(50)
  })

  it('scores above 50 when RHR is below baseline (good)', () => {
    const score = scoreRhr(50, { mean: 55, stdDev: 3, sampleSize: 30 })
    expect(score).toBeGreaterThan(50)
  })

  it('scores below 50 when RHR is above baseline (bad)', () => {
    const score = scoreRhr(62, { mean: 55, stdDev: 3, sampleSize: 30 })
    expect(score).toBeLessThan(50)
  })
})

describe('scoreSleep', () => {
  it('returns 50 when no sleep data', () => {
    const baseline = { mean: 7, stdDev: 1, sampleSize: 30 }
    expect(scoreSleep(undefined, baseline, baseline)).toBe(50)
  })

  it('scores high for 8 hours with good sleep score', () => {
    const score = scoreSleep(
      { durationSeconds: 8 * 3600, quality: 'GOOD', deepSeconds: 0, remSeconds: 0, lightSeconds: 0, awakeSeconds: 0, score: 85 },
      { mean: 7, stdDev: 1, sampleSize: 30 },
      { mean: 70, stdDev: 10, sampleSize: 30 },
    )
    expect(score).toBeGreaterThan(70)
  })

  it('scores low for 4 hours with poor sleep score', () => {
    const score = scoreSleep(
      { durationSeconds: 4 * 3600, quality: 'POOR', deepSeconds: 0, remSeconds: 0, lightSeconds: 0, awakeSeconds: 0, score: 30 },
      { mean: 7, stdDev: 1, sampleSize: 30 },
      { mean: 70, stdDev: 10, sampleSize: 30 },
    )
    expect(score).toBeLessThan(40)
  })
})

describe('scoreTrainingLoad', () => {
  it('returns 50 when no TRIMP data', () => {
    expect(scoreTrainingLoad([], { mean: 50, stdDev: 20, sampleSize: 30 })).toBe(50)
  })

  it('scores higher when yesterday TRIMP is below baseline (good recovery)', () => {
    const daily: DailyTRIMP[] = [{ date: '2026-04-14', total: 20, records: [] }]
    const score = scoreTrainingLoad(daily, { mean: 60, stdDev: 20, sampleSize: 30 })
    expect(score).toBeGreaterThan(50)
  })

  it('scores lower when yesterday TRIMP is above baseline (fatigued)', () => {
    const daily: DailyTRIMP[] = [{ date: '2026-04-14', total: 120, records: [] }]
    const score = scoreTrainingLoad(daily, { mean: 60, stdDev: 20, sampleSize: 30 })
    expect(score).toBeLessThan(50)
  })
})

describe('classifyStatus', () => {
  it('classifies correctly', () => {
    expect(classifyStatus(85)).toBe('GREEN')
    expect(classifyStatus(70)).toBe('GREEN')
    expect(classifyStatus(69)).toBe('YELLOW')
    expect(classifyStatus(40)).toBe('YELLOW')
    expect(classifyStatus(39)).toBe('RED')
    expect(classifyStatus(0)).toBe('RED')
  })
})

describe('calculateReadiness', () => {
  const baselines = {
    lnRmssd: { mean: 3.9, stdDev: 0.2, sampleSize: 30 },
    rhr: { mean: 55, stdDev: 3, sampleSize: 30 },
    sleepDuration: { mean: 7, stdDev: 1, sampleSize: 30 },
    sleepScore: { mean: 70, stdDev: 10, sampleSize: 30 },
    dailyTrimp: { mean: 50, stdDev: 20, sampleSize: 30 },
  }

  it('produces GREEN for good metrics', () => {
    const today: GarminHealthData = {
      date: '2026-04-15',
      hrv: { weeklyAvg: 55, lastNightAvg: 60, status: 'BALANCED' },
      rhr: 52,
      sleep: { durationSeconds: 8 * 3600, quality: 'GOOD', deepSeconds: 0, remSeconds: 0, lightSeconds: 0, awakeSeconds: 0, score: 85 },
    }
    const dailyTrimp: DailyTRIMP[] = [{ date: '2026-04-14', total: 30, records: [] }]
    const score = calculateReadiness(today, baselines, dailyTrimp)
    expect(score.status).toBe('GREEN')
    expect(score.composite).toBeGreaterThanOrEqual(70)
  })

  it('produces RED for poor metrics', () => {
    const today: GarminHealthData = {
      date: '2026-04-15',
      hrv: { weeklyAvg: 30, lastNightAvg: 25, status: 'LOW' },
      rhr: 65,
      sleep: { durationSeconds: 4.5 * 3600, quality: 'POOR', deepSeconds: 0, remSeconds: 0, lightSeconds: 0, awakeSeconds: 0, score: 25 },
    }
    const dailyTrimp: DailyTRIMP[] = [{ date: '2026-04-14', total: 130, records: [] }]
    const score = calculateReadiness(today, baselines, dailyTrimp)
    expect(score.status).toBe('RED')
    expect(score.composite).toBeLessThan(40)
  })

  it('defaults to YELLOW-ish scores when data is missing', () => {
    const today: GarminHealthData = { date: '2026-04-15' }
    const score = calculateReadiness(today, baselines, [])
    expect(score.composite).toBe(50) // all components default to 50
    expect(score.status).toBe('YELLOW')
  })
})

describe('applyGuardrails', () => {
  function makeScore(status: 'GREEN' | 'YELLOW' | 'RED', date: string): ReadinessScore {
    return {
      date,
      composite: status === 'GREEN' ? 80 : status === 'YELLOW' ? 55 : 30,
      status,
      components: { hrv: 50, rhr: 50, sleep: 50, trainingLoad: 50 },
      message: '',
    }
  }

  it('forces YELLOW after 3 consecutive GREEN days', () => {
    const scores = [
      makeScore('GREEN', '2026-04-13'),
      makeScore('GREEN', '2026-04-14'),
      makeScore('GREEN', '2026-04-15'),
    ]
    const result = applyGuardrails(scores)
    expect(result[2].status).toBe('YELLOW')
    expect(result[2].message).toContain('structural fatigue')
  })

  it('forces YELLOW after 3 consecutive RED days', () => {
    const scores = [
      makeScore('RED', '2026-04-13'),
      makeScore('RED', '2026-04-14'),
      makeScore('RED', '2026-04-15'),
    ]
    const result = applyGuardrails(scores)
    expect(result[2].status).toBe('YELLOW')
    expect(result[2].message).toContain('light activity')
  })

  it('does not modify non-consecutive same-status days', () => {
    const scores = [
      makeScore('GREEN', '2026-04-13'),
      makeScore('YELLOW', '2026-04-14'),
      makeScore('GREEN', '2026-04-15'),
    ]
    const result = applyGuardrails(scores)
    expect(result[2].status).toBe('GREEN')
  })
})

describe('checkHRVStability', () => {
  it('returns stable for insufficient data', () => {
    const history: GarminHealthData[] = [
      { date: '2026-04-15', hrv: { weeklyAvg: 50, lastNightAvg: 50, status: 'BALANCED' } },
    ]
    const result = checkHRVStability(history)
    expect(result.stable).toBe(true)
  })

  it('detects unstable HRV (CV > 10%)', () => {
    // Create wildly varying HRV values
    const history: GarminHealthData[] = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      hrv: { weeklyAvg: 50, lastNightAvg: i % 2 === 0 ? 80 : 20, status: 'UNBALANCED' },
    }))
    const result = checkHRVStability(history)
    expect(result.cv).toBeGreaterThan(10)
    expect(result.stable).toBe(false)
  })
})

describe('suggestDailyAdjustment', () => {
  const components = { hrv: 50, rhr: 50, sleep: 50, trainingLoad: 50 }

  it('suggests executing plan for GREEN', () => {
    expect(suggestDailyAdjustment('GREEN', 'quality', components)).toContain('as written')
  })

  it('suggests reducing intensity for YELLOW + quality', () => {
    expect(suggestDailyAdjustment('YELLOW', 'quality', components)).toContain('Z2')
  })

  it('suggests cutting distance for YELLOW + long', () => {
    expect(suggestDailyAdjustment('YELLOW', 'long', components)).toContain('15-20%')
  })

  it('suggests replacement for RED + run', () => {
    expect(suggestDailyAdjustment('RED', 'run', components)).toContain('easy walk')
  })

  it('affirms rest for RED + rest', () => {
    expect(suggestDailyAdjustment('RED', 'rest', components)).toContain('needs it')
  })
})

describe('generateReadinessMessage', () => {
  it('generates GREEN message', () => {
    const score: ReadinessScore = {
      date: '2026-04-15',
      composite: 82,
      status: 'GREEN',
      components: { hrv: 80, rhr: 70, sleep: 85, trainingLoad: 75 },
      message: '',
    }
    const msg = generateReadinessMessage(score)
    expect(msg).toContain('Strong recovery')
  })

  it('generates RED message mentioning sleep', () => {
    const score: ReadinessScore = {
      date: '2026-04-15',
      composite: 28,
      status: 'RED',
      components: { hrv: 25, rhr: 30, sleep: 20, trainingLoad: 35 },
      message: '',
    }
    const msg = generateReadinessMessage(score)
    expect(msg).toContain('Low recovery')
    expect(msg).toContain('sleep')
  })
})
