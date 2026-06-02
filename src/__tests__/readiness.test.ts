import { describe, it, expect } from 'vitest'
import {
  calculateBaseline,
  scoreRHR,
  scoreSleep,
  scoreLoad,
  classifyStatus,
  compositeToDisplayScore,
  calculateReadiness,
  applyGuardrails,
  checkHRVStability,
  suggestDailyAdjustment,
  generateReadinessMessage,
  classifyTrainingState,
  countConsecutiveRedDays,
  computeDeloadProgram,
} from '../utils/readiness'
import type { GarminHealthData, ReadinessScore, ReadinessBaselines, Baseline } from '../types'

// ─── Helper factories ────────────────���─────────────────────────

function makeBaselines(overrides?: Partial<ReadinessBaselines>): ReadinessBaselines {
  return {
    lnRmssd: { mean: 3.9, stdDev: 0.2, sampleSize: 30 },
    rhr: { mean: 55, stdDev: 3, sampleSize: 30 },
    sleepDuration: { mean: 7, stdDev: 1, sampleSize: 30 },
    sleepScore: { mean: 70, stdDev: 10, sampleSize: 30 },
    dailyTrimp: { mean: 50, stdDev: 20, sampleSize: 30 },
    ...overrides,
  }
}

function makeScore(
  status: 'PEAK' | 'GREEN' | 'YELLOW' | 'RED',
  date: string,
  overrides?: Partial<ReadinessScore>,
): ReadinessScore {
  const compositeMap = { PEAK: 1.5, GREEN: 0.5, YELLOW: 0.0, RED: -0.5 }
  return {
    date,
    composite: compositeMap[status],
    displayScore: compositeToDisplayScore(compositeMap[status]),
    status,
    trainingState: 'A',
    components: { hrv: 0, rhr: 0, sleep: 0, trainingLoad: 0 },
    message: '',
    adjustment: '',
    ...overrides,
  }
}

// ─── calculateBaseline ──────────────────────────────────────────

describe('calculateBaseline', () => {
  it('returns zero baseline for empty array', () => {
    const b = calculateBaseline([])
    expect(b.mean).toBe(0)
    expect(b.stdDev).toBe(0)
    expect(b.sampleSize).toBe(0)
  })

  it('calculates correct mean and stdDev', () => {
    const b = calculateBaseline([50, 50, 50, 50])
    expect(b.mean).toBe(50)
    expect(b.stdDev).toBe(0)
    expect(b.sampleSize).toBe(4)
  })

  it('handles NaN values gracefully', () => {
    const b = calculateBaseline([50, NaN, 60, NaN, 70])
    expect(b.mean).toBe(60)
    expect(b.sampleSize).toBe(3)
  })
})

// ─── Score functions (ATE scale: -1 to +2) ─────────────────────

describe('scoreRHR (ATE deviation-based)', () => {
  const baseline: Baseline = { mean: 55, stdDev: 3, sampleSize: 30 }

  it('returns 0 when no RHR data', () => {
    expect(scoreRHR(undefined, baseline)).toBe(0)
  })

  it('returns +2.0 when RHR is ≥5 below baseline', () => {
    expect(scoreRHR(49, baseline)).toBe(2.0)
    expect(scoreRHR(50, baseline)).toBe(2.0)
  })

  it('returns +1.0 when RHR is 2-5 below baseline', () => {
    expect(scoreRHR(52, baseline)).toBe(1.0)
    expect(scoreRHR(53, baseline)).toBe(1.0)
  })

  it('returns 0.0 when RHR is near baseline (within +5)', () => {
    expect(scoreRHR(55, baseline)).toBe(0.0)
    expect(scoreRHR(60, baseline)).toBe(0.0)
  })

  it('returns -1.0 when RHR is elevated >5 above baseline', () => {
    expect(scoreRHR(61, baseline)).toBe(-1.0)
    expect(scoreRHR(65, baseline)).toBe(-1.0)
  })
})

describe('scoreSleep (ATE hours-based)', () => {
  it('returns 0 when no sleep data', () => {
    expect(scoreSleep(undefined)).toBe(0)
  })

  it('returns +2.0 for ≥8.5h sleep', () => {
    expect(scoreSleep({ durationSeconds: 9 * 3600, quality: 'GOOD', deepSeconds: 0, remSeconds: 0, lightSeconds: 0, awakeSeconds: 0, score: 90 })).toBe(2.0)
  })

  it('returns +1.0 for 7-8.5h sleep', () => {
    expect(scoreSleep({ durationSeconds: 7.5 * 3600, quality: 'GOOD', deepSeconds: 0, remSeconds: 0, lightSeconds: 0, awakeSeconds: 0, score: 80 })).toBe(1.0)
  })

  it('returns 0.0 for 6-7h sleep', () => {
    expect(scoreSleep({ durationSeconds: 6.5 * 3600, quality: 'FAIR', deepSeconds: 0, remSeconds: 0, lightSeconds: 0, awakeSeconds: 0, score: 60 })).toBe(0.0)
  })

  it('returns -1.0 for <6h sleep', () => {
    expect(scoreSleep({ durationSeconds: 5 * 3600, quality: 'POOR', deepSeconds: 0, remSeconds: 0, lightSeconds: 0, awakeSeconds: 0, score: 30 })).toBe(-1.0)
  })
})

describe('scoreLoad (ATE ACWR Gabbett zones)', () => {
  it('returns 0.0 for zero ACWR (insufficient data)', () => {
    expect(scoreLoad(0)).toBe(0)
  })

  it('returns +1.0 for undertraining (ACWR < 0.8)', () => {
    expect(scoreLoad(0.5)).toBe(1.0)
    expect(scoreLoad(0.79)).toBe(1.0)
  })

  it('returns 0.0 for sweet spot (0.8-1.3)', () => {
    expect(scoreLoad(0.8)).toBe(0.0)
    expect(scoreLoad(1.0)).toBe(0.0)
    expect(scoreLoad(1.3)).toBe(0.0)
  })

  it('returns -0.5 for caution zone (1.3-1.5)', () => {
    expect(scoreLoad(1.31)).toBe(-0.5)
    expect(scoreLoad(1.5)).toBe(-0.5)
  })

  it('returns -1.0 for danger zone (>1.5)', () => {
    expect(scoreLoad(1.51)).toBe(-1.0)
    expect(scoreLoad(2.0)).toBe(-1.0)
  })
})

// ─── classifyStatus (ATE thresholds) ───────────────────────────

describe('classifyStatus (ATE composite thresholds)', () => {
  it('classifies PEAK for composite ≥ 1.25', () => {
    expect(classifyStatus(1.25)).toBe('PEAK')
    expect(classifyStatus(2.0)).toBe('PEAK')
  })

  it('classifies GREEN for composite ≥ 0.25', () => {
    expect(classifyStatus(0.25)).toBe('GREEN')
    expect(classifyStatus(1.0)).toBe('GREEN')
  })

  it('classifies YELLOW for composite ≥ -0.25', () => {
    expect(classifyStatus(-0.25)).toBe('YELLOW')
    expect(classifyStatus(0.0)).toBe('YELLOW')
    expect(classifyStatus(0.24)).toBe('YELLOW')
  })

  it('classifies RED for composite < -0.25', () => {
    expect(classifyStatus(-0.26)).toBe('RED')
    expect(classifyStatus(-2.0)).toBe('RED')
  })
})

// ─── compositeToDisplayScore ───────────────────────────────────

describe('compositeToDisplayScore', () => {
  it('maps -2.0 to 0', () => {
    expect(compositeToDisplayScore(-2.0)).toBe(0)
  })

  it('maps +2.0 to 100', () => {
    expect(compositeToDisplayScore(2.0)).toBe(100)
  })

  it('maps 0.0 to 50', () => {
    expect(compositeToDisplayScore(0.0)).toBe(50)
  })

  it('clamps values outside range', () => {
    expect(compositeToDisplayScore(-5.0)).toBe(0)
    expect(compositeToDisplayScore(5.0)).toBe(100)
  })
})

// ─── calculateReadiness ────────────────────────────────────────

describe('calculateReadiness (ATE-aligned)', () => {
  const baselines = makeBaselines()

  it('produces GREEN for good metrics', () => {
    const today: GarminHealthData = {
      date: '2026-04-15',
      hrv: { weeklyAvg: 55, lastNightAvg: 60, status: 'BALANCED' },
      rhr: 52,
      sleep: { durationSeconds: 8 * 3600, quality: 'GOOD', deepSeconds: 0, remSeconds: 0, lightSeconds: 0, awakeSeconds: 0, score: 85 },
    }
    const score = calculateReadiness(today, baselines, 1.0, 5.0)
    expect(score.status === 'GREEN' || score.status === 'PEAK').toBe(true)
    expect(score.displayScore).toBeGreaterThanOrEqual(50)
  })

  it('produces RED for poor metrics', () => {
    const today: GarminHealthData = {
      date: '2026-04-15',
      hrv: { weeklyAvg: 30, lastNightAvg: 25, status: 'LOW' },
      rhr: 65,
      sleep: { durationSeconds: 4.5 * 3600, quality: 'POOR', deepSeconds: 0, remSeconds: 0, lightSeconds: 0, awakeSeconds: 0, score: 25 },
    }
    const score = calculateReadiness(today, baselines, 1.6, 5.0)
    expect(score.status).toBe('RED')
    expect(score.displayScore).toBeLessThan(50)
  })

  it('includes ACWR in result', () => {
    const today: GarminHealthData = { date: '2026-04-15' }
    const score = calculateReadiness(today, baselines, 1.35, 5.0)
    expect(score.acwr).toBe(1.35)
  })

  it('sets training state to A by default (classified later)', () => {
    const today: GarminHealthData = { date: '2026-04-15' }
    const score = calculateReadiness(today, baselines, 1.0, 5.0)
    expect(score.trainingState).toBe('A')
  })
})

// ─── classifyTrainingState ─────────────────────────────────────

describe('classifyTrainingState', () => {
  it('returns A for well-recovered (composite ≥ 0.25)', () => {
    expect(classifyTrainingState(0.5, 1.0, 0, false)).toBe('A')
  })

  it('returns B for not fully recovered (0 ≤ composite < 0.25)', () => {
    expect(classifyTrainingState(0.1, 1.0, 0, false)).toBe('B')
  })

  it('returns C for overreaching (composite < 0)', () => {
    expect(classifyTrainingState(-0.1, 1.0, 0, false)).toBe('C')
  })

  it('returns C when composite < 0.25 AND acwr > 1.3', () => {
    expect(classifyTrainingState(0.1, 1.4, 0, false)).toBe('C')
  })

  it('returns D for overtrained (5+ consecutive RED days)', () => {
    expect(classifyTrainingState(-0.5, 1.0, 5, false)).toBe('D')
  })

  it('returns D when 7d HRV trend is declining', () => {
    expect(classifyTrainingState(0.5, 1.0, 0, true)).toBe('D')
  })
})

// ─── applyGuardrails ──────────────────────────���───────────────

describe('applyGuardrails (ATE guardrail system)', () => {
  it('caps PEAK/GREEN to YELLOW when ACWR > 1.5', () => {
    const scores = [makeScore('GREEN', '2026-04-15')]
    const result = applyGuardrails(scores, [], [], 1.6)
    expect(result[0].status).toBe('YELLOW')
    expect(result[0].guardrailsTriggered).toBeDefined()
    expect(result[0].guardrailsTriggered!.some(g => g.includes('ACWR'))).toBe(true)
  })

  it('caps PEAK to GREEN when ACWR > 1.3', () => {
    const scores = [makeScore('PEAK', '2026-04-15')]
    const result = applyGuardrails(scores, [], [], 1.35)
    expect(result[0].status).toBe('GREEN')
  })

  it('forces YELLOW on the 3rd high day when the prior 2 were actually trained', () => {
    const scores = [
      makeScore('GREEN', '2026-04-13'),
      makeScore('GREEN', '2026-04-14'),
      makeScore('GREEN', '2026-04-15'),
    ]
    const trimp = [
      { date: '2026-04-13', total: 100, records: [] },
      { date: '2026-04-14', total: 100, records: [] },
      { date: '2026-04-15', total: 100, records: [] },
    ]
    const result = applyGuardrails(scores, [], trimp, 1.0)
    expect(result[2].status).toBe('YELLOW')
    expect(result[2].guardrailsTriggered!.some(g => g.includes('structural recovery'))).toBe(true)
    // displayed number is clamped into the YELLOW band, not left in the GREEN band
    expect(result[2].displayScore).toBeLessThanOrEqual(compositeToDisplayScore(0.25))
  })

  it('stays GREEN on the 3rd high day when the prior 2 were rest/easy days', () => {
    const scores = [
      makeScore('GREEN', '2026-04-13'),
      makeScore('GREEN', '2026-04-14'),
      makeScore('GREEN', '2026-04-15'),
    ]
    // Athlete's typical active-day load is ~100 (earlier days), but the two days
    // before today were rest (0 load) — no structural fatigue to manage.
    const trimp = [
      { date: '2026-04-10', total: 100, records: [] },
      { date: '2026-04-11', total: 100, records: [] },
      { date: '2026-04-13', total: 0, records: [] },
      { date: '2026-04-14', total: 0, records: [] },
    ]
    const result = applyGuardrails(scores, [], trimp, 1.0)
    expect(result[2].status).toBe('GREEN')
    expect(result[2].guardrailsTriggered!.some(g => g.includes('structural recovery'))).toBe(false)
  })

  it('forces YELLOW after 3 consecutive RED days', () => {
    const scores = [
      makeScore('RED', '2026-04-13'),
      makeScore('RED', '2026-04-14'),
      makeScore('RED', '2026-04-15'),
    ]
    const result = applyGuardrails(scores, [], [], 1.0)
    expect(result[2].status).toBe('YELLOW')
    expect(result[2].guardrailsTriggered!.some(g => g.includes('detraining'))).toBe(true)
  })

  it('does not modify non-consecutive same-status days', () => {
    const scores = [
      makeScore('GREEN', '2026-04-13'),
      makeScore('YELLOW', '2026-04-14'),
      makeScore('GREEN', '2026-04-15'),
    ]
    const result = applyGuardrails(scores, [], [], 1.0)
    expect(result[2].status).toBe('GREEN')
  })

  it('caps to 1 PEAK per 7 days', () => {
    const scores = [
      makeScore('PEAK', '2026-04-13'),
      makeScore('YELLOW', '2026-04-14'), // break the consecutive high guardrail
      makeScore('PEAK', '2026-04-15'),
    ]
    const result = applyGuardrails(scores, [], [], 1.0)
    expect(result[2].status).toBe('GREEN')
    expect(result[2].guardrailsTriggered!.some(g => g.includes('PEAK per 7 days'))).toBe(true)
  })

  it('forces YELLOW when sleep < 6h (acute override)', () => {
    const scores = [makeScore('GREEN', '2026-04-15')]
    const health: GarminHealthData[] = [{
      date: '2026-04-15',
      sleep: { durationSeconds: 5 * 3600, quality: 'POOR', deepSeconds: 0, remSeconds: 0, lightSeconds: 0, awakeSeconds: 0, score: 30 },
    }]
    const result = applyGuardrails(scores, health, [], 1.0)
    expect(result[0].status).toBe('YELLOW')
    expect(result[0].guardrailsTriggered!.some(g => g.includes('Sleep'))).toBe(true)
  })
})

// ─── checkHRVStability ─────────────────────────────────────────

describe('checkHRVStability', () => {
  it('returns stable for insufficient data', () => {
    const history: GarminHealthData[] = [
      { date: '2026-04-15', hrv: { weeklyAvg: 50, lastNightAvg: 50, status: 'BALANCED' } },
    ]
    const result = checkHRVStability(history)
    expect(result.stable).toBe(true)
  })

  it('detects unstable HRV (CV > 10%)', () => {
    const history: GarminHealthData[] = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      hrv: { weeklyAvg: 50, lastNightAvg: i % 2 === 0 ? 80 : 20, status: 'UNBALANCED' },
    }))
    const result = checkHRVStability(history)
    expect(result.cv).toBeGreaterThan(10)
    expect(result.stable).toBe(false)
  })
})

// ─── countConsecutiveRedDays ───────────────────────────��───────

describe('countConsecutiveRedDays', () => {
  it('returns 0 for empty scores', () => {
    expect(countConsecutiveRedDays([])).toBe(0)
  })

  it('counts consecutive RED days from end', () => {
    const scores = [
      makeScore('GREEN', '2026-04-13'),
      makeScore('RED', '2026-04-14'),
      makeScore('RED', '2026-04-15'),
    ]
    expect(countConsecutiveRedDays(scores)).toBe(2)
  })

  it('stops counting at non-RED day', () => {
    const scores = [
      makeScore('RED', '2026-04-13'),
      makeScore('GREEN', '2026-04-14'),
      makeScore('RED', '2026-04-15'),
    ]
    expect(countConsecutiveRedDays(scores)).toBe(1)
  })
})

// ─── computeDeloadProgram ────────────────────────────────��─────

describe('computeDeloadProgram', () => {
  it('returns 7-day deload cycle', () => {
    const program = computeDeloadProgram()
    expect(program).toHaveLength(7)
    expect(program[0].intensityCap).toBe(0) // complete rest day 1
    expect(program[6].intensityCap).toBe(0.5) // reassessment day 7
  })
})

// ─── suggestDailyAdjustment (ATE signal × state matrix) ────────

describe('suggestDailyAdjustment', () => {
  const components = { hrv: 0, rhr: 0, sleep: 0, trainingLoad: 0 }

  it('suggests full execution for PEAK + State A', () => {
    const msg = suggestDailyAdjustment('PEAK', 'A', 'quality', components)
    expect(msg).toContain('Peak form')
  })

  it('suggests executing as written for GREEN + State A', () => {
    const msg = suggestDailyAdjustment('GREEN', 'A', 'run', components)
    expect(msg).toContain('as written')
  })

  it('suggests reducing intensity for GREEN + State B', () => {
    const msg = suggestDailyAdjustment('GREEN', 'B', 'run', components)
    expect(msg).toContain('reduce intensity')
  })

  it('suggests Z2 for YELLOW + quality', () => {
    const msg = suggestDailyAdjustment('YELLOW', 'A', 'quality', components)
    expect(msg).toContain('Z2')
  })

  it('suggests cutting distance for YELLOW + long', () => {
    const msg = suggestDailyAdjustment('YELLOW', 'A', 'long', components)
    expect(msg).toContain('15-20%')
  })

  it('suggests overreaching protocol for YELLOW + State C', () => {
    const msg = suggestDailyAdjustment('YELLOW', 'C', 'run', components)
    expect(msg).toContain('Overreaching')
  })

  it('suggests easy walk for RED + run', () => {
    const msg = suggestDailyAdjustment('RED', 'A', 'run', components)
    expect(msg).toContain('easy walk')
  })

  it('affirms rest for RED + rest', () => {
    const msg = suggestDailyAdjustment('RED', 'A', 'rest', components)
    expect(msg).toContain('needs it')
  })

  it('suggests deload for RED + State D', () => {
    const msg = suggestDailyAdjustment('RED', 'D', 'run', components)
    expect(msg).toContain('Deload')
  })
})

// ─── generateReadinessMessage ──────────────────────────────────

describe('generateReadinessMessage', () => {
  it('generates PEAK message', () => {
    const score = makeScore('PEAK', '2026-04-15', {
      components: { hrv: 2.0, rhr: 1.0, sleep: 2.0, trainingLoad: 1.0 },
    })
    const msg = generateReadinessMessage(score)
    expect(msg).toContain('Peak recovery')
  })

  it('generates GREEN message', () => {
    const score = makeScore('GREEN', '2026-04-15', {
      components: { hrv: 1.0, rhr: 0, sleep: 1.0, trainingLoad: 0 },
    })
    const msg = generateReadinessMessage(score)
    expect(msg).toContain('Strong recovery')
  })

  it('generates RED message mentioning sleep', () => {
    const score = makeScore('RED', '2026-04-15', {
      components: { hrv: -1, rhr: -1, sleep: -1, trainingLoad: -0.5 },
    })
    const msg = generateReadinessMessage(score)
    expect(msg).toContain('Low recovery')
    expect(msg).toContain('sleep')
  })

  it('generates YELLOW + State C overreaching message', () => {
    const score = makeScore('YELLOW', '2026-04-15', {
      trainingState: 'C',
      components: { hrv: 0, rhr: 0, sleep: 0, trainingLoad: -0.5 },
    })
    const msg = generateReadinessMessage(score)
    expect(msg).toContain('Overreaching')
  })
})
