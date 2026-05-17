import { describe, it, expect } from 'vitest'
import {
  scoreMatch,
  matchTrainingToCourseSegments,
  summarizeCoverage,
  DEFAULT_WEIGHTS,
} from '../utils/courseMatching'
import { brokenArrow18k2026 } from '../data/courses'
import type { CourseSegment } from '../types/course'

const SIBERIA_DESCENT = brokenArrow18k2026.segments.find(s => s.id.endsWith(':siberia-descent'))!
const STAIRWAY = brokenArrow18k2026.segments.find(s => s.id.endsWith(':stairway-to-heaven'))!
const KT22 = brokenArrow18k2026.segments.find(s => s.id.endsWith(':kt22-climb'))!

describe('scoreMatch', () => {
  it('rewards near-identical segments with a score above 0.9', () => {
    const training = {
      avgGradePct: SIBERIA_DESCENT.avgGradePct,
      netVerticalFt: SIBERIA_DESCENT.netVerticalFt,
      lengthMi: SIBERIA_DESCENT.lengthMi,
      surfaces: SIBERIA_DESCENT.surfaces,
      avgAltitudeFt: SIBERIA_DESCENT.avgAltitudeFt,
    }
    const match = scoreMatch(training, SIBERIA_DESCENT)
    expect(match.score).toBeGreaterThan(0.9)
    expect(match.components.grade).toBe(1)
    expect(match.components.surface).toBe(1)
    expect(match.reasons.join(' ')).toMatch(/grade matches/i)
  })

  it('zeros out the grade term when stimuli oppose (climb vs descent)', () => {
    const training = {
      avgGradePct: -16.5,
      netVerticalFt: -1100,
      lengthMi: 1.3,
      surfaces: SIBERIA_DESCENT.surfaces,
    }
    const match = scoreMatch(training, STAIRWAY) // STAIRWAY is +13.5%
    expect(match.components.grade).toBe(0)
    expect(match.reasons.some(r => /wrong stimulus/i.test(r))).toBe(true)
  })

  it('penalizes surface mismatch', () => {
    const trainingPavement = {
      avgGradePct: SIBERIA_DESCENT.avgGradePct,
      netVerticalFt: SIBERIA_DESCENT.netVerticalFt,
      lengthMi: SIBERIA_DESCENT.lengthMi,
      surfaces: ['pavement'] as const,
    }
    const trainingTechnical = {
      ...trainingPavement,
      surfaces: SIBERIA_DESCENT.surfaces,
    }
    const pavementMatch = scoreMatch(trainingPavement, SIBERIA_DESCENT)
    const technicalMatch = scoreMatch(trainingTechnical, SIBERIA_DESCENT)
    expect(technicalMatch.components.surface).toBeGreaterThan(pavementMatch.components.surface)
    expect(technicalMatch.score).toBeGreaterThan(pavementMatch.score)
    expect(pavementMatch.reasons.some(r => /surface mismatch/i.test(r))).toBe(true)
  })

  it('returns a neutral surface score when training surfaces are unknown', () => {
    const training = {
      avgGradePct: SIBERIA_DESCENT.avgGradePct,
      netVerticalFt: SIBERIA_DESCENT.netVerticalFt,
      lengthMi: SIBERIA_DESCENT.lengthMi,
    }
    const match = scoreMatch(training, SIBERIA_DESCENT)
    expect(match.components.surface).toBe(0.5)
  })

  it('clamps overall score to [0,1]', () => {
    const bad = {
      avgGradePct: 999,
      netVerticalFt: -99999,
      lengthMi: 0,
    }
    const match = scoreMatch(bad, SIBERIA_DESCENT)
    expect(match.score).toBeGreaterThanOrEqual(0)
    expect(match.score).toBeLessThanOrEqual(1)
  })

  it('respects custom weights — surface-heavy weighting drops pavement matches further', () => {
    const trainingPavement = {
      avgGradePct: SIBERIA_DESCENT.avgGradePct,
      netVerticalFt: SIBERIA_DESCENT.netVerticalFt,
      lengthMi: SIBERIA_DESCENT.lengthMi,
      surfaces: ['pavement'] as const,
    }
    const defaultMatch = scoreMatch(trainingPavement, SIBERIA_DESCENT)
    const surfaceHeavy = scoreMatch(trainingPavement, SIBERIA_DESCENT, {
      grade: 0.1,
      vertical: 0.1,
      length: 0.1,
      surface: 0.7,
      altitude: 0.0,
    })
    expect(surfaceHeavy.score).toBeLessThan(defaultMatch.score)
  })

  it('default weights sum to 1', () => {
    const sum =
      DEFAULT_WEIGHTS.grade +
      DEFAULT_WEIGHTS.vertical +
      DEFAULT_WEIGHTS.length +
      DEFAULT_WEIGHTS.surface +
      DEFAULT_WEIGHTS.altitude
    expect(sum).toBeCloseTo(1, 5)
  })
})

describe('matchTrainingToCourseSegments', () => {
  it('returns matches sorted best-first', () => {
    const training = {
      avgGradePct: 12,
      netVerticalFt: 1000,
      lengthMi: 1.7,
      surfaces: ['technical_trail'] as const,
    }
    const matches = matchTrainingToCourseSegments(
      training,
      brokenArrow18k2026.segments,
      { minScore: 0 },
    )
    expect(matches.length).toBeGreaterThan(0)
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i].score).toBeLessThanOrEqual(matches[i - 1].score)
    }
    // A training segment mimicking Stairway should rank Stairway first
    expect(matches[0].segment.id).toBe(STAIRWAY.id)
  })

  it('honors minScore threshold', () => {
    const training = {
      avgGradePct: 1,
      netVerticalFt: 50,
      lengthMi: 0.5,
      surfaces: ['pavement'] as const,
    }
    const strict = matchTrainingToCourseSegments(training, brokenArrow18k2026.segments, {
      minScore: 0.7,
    })
    expect(strict).toEqual([])
    const loose = matchTrainingToCourseSegments(training, brokenArrow18k2026.segments, {
      minScore: 0,
    })
    expect(loose.length).toBe(brokenArrow18k2026.segments.length)
  })
})

describe('summarizeCoverage', () => {
  it('returns zero coverage for an empty training history', () => {
    const coverage = summarizeCoverage([], brokenArrow18k2026)
    expect(coverage.overall).toBe(0)
    expect(coverage.perSegment.every(s => s.coverage === 0)).toBe(true)
    expect(coverage.perSegment.length).toBe(brokenArrow18k2026.segments.length)
  })

  it('credits a Stairway-equivalent workout to the Stairway segment', () => {
    const training = [
      {
        avgGradePct: 13,
        netVerticalFt: 1000,
        lengthMi: 1.5,
        surfaces: ['technical_trail'] as const,
        avgAltitudeFt: 8000,
      },
    ]
    const coverage = summarizeCoverage(training, brokenArrow18k2026)
    const stairway = coverage.perSegment.find(s => s.segment.id === STAIRWAY.id)!
    expect(stairway.hitCount).toBe(1)
    expect(stairway.matchedMiles).toBe(1.5)
    expect(stairway.coverage).toBeGreaterThan(0.8)
  })

  it('overall coverage rises monotonically as training segments accumulate', () => {
    const segOne = {
      avgGradePct: 13,
      netVerticalFt: 1000,
      lengthMi: 1.5,
      surfaces: ['technical_trail'] as const,
    }
    const segTwo = {
      avgGradePct: -16,
      netVerticalFt: -1000,
      lengthMi: 1.2,
      surfaces: ['technical_trail'] as const,
    }
    const one = summarizeCoverage([segOne], brokenArrow18k2026).overall
    const two = summarizeCoverage([segOne, segTwo], brokenArrow18k2026).overall
    expect(two).toBeGreaterThan(one)
  })

  it('caps per-segment coverage at 1.0 even when training over-delivers', () => {
    const heavy = Array.from({ length: 10 }, () => ({
      avgGradePct: KT22.avgGradePct,
      netVerticalFt: KT22.netVerticalFt,
      lengthMi: KT22.lengthMi,
      surfaces: KT22.surfaces,
    }))
    const coverage = summarizeCoverage(heavy, brokenArrow18k2026)
    const kt22 = coverage.perSegment.find(s => s.segment.id === KT22.id)!
    expect(kt22.coverage).toBe(1)
    expect(kt22.hitCount).toBe(10)
  })

  it('attributes each training segment to its single best match (no double-counting)', () => {
    const training = [
      {
        avgGradePct: STAIRWAY.avgGradePct,
        netVerticalFt: STAIRWAY.netVerticalFt,
        lengthMi: STAIRWAY.lengthMi,
        surfaces: STAIRWAY.surfaces,
      },
    ]
    const coverage = summarizeCoverage(training, brokenArrow18k2026)
    const totalHits = coverage.perSegment.reduce((s, c) => s + c.hitCount, 0)
    expect(totalHits).toBe(1)
  })

  it('handles courses with empty segments gracefully', () => {
    const emptyCourse = {
      ...brokenArrow18k2026,
      segments: [] as CourseSegment[],
    }
    const coverage = summarizeCoverage(
      [{ avgGradePct: 10, netVerticalFt: 500, lengthMi: 1 }],
      emptyCourse,
    )
    expect(coverage.overall).toBe(0)
    expect(coverage.perSegment).toEqual([])
  })
})
