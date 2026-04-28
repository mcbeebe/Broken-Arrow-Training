import { describe, it, expect } from 'vitest'
import { eccentricScore, computeEccentricLoad, ECCENTRIC_BY_GRADE } from '../../../engines/descent/eccentric'

describe('eccentricScore — Hill Running v1.1 reference table fit', () => {
  it('matches the canonical anchor points from the v1.1 table', () => {
    // From docs/research/Hill_Running_Load_Multipliers_v1.1.xlsx — these
    // are the exact values surfaced in the Settings methodology copy and
    // the Vernillo 2017 / Peake 2017 reference points.
    expect(eccentricScore(-0.45)).toBe(5)
    expect(eccentricScore(-0.30)).toBe(5)
    expect(eccentricScore(-0.20)).toBe(4)
    expect(eccentricScore(-0.10)).toBe(2)
    expect(eccentricScore(0)).toBe(1)
    expect(eccentricScore(0.05)).toBe(1)
    expect(eccentricScore(0.10)).toBe(2)
    expect(eccentricScore(0.20)).toBe(2)
    expect(eccentricScore(0.30)).toBe(2)
    expect(eccentricScore(0.45)).toBe(3)
  })

  it('linearly interpolates between anchors', () => {
    // -0.10 → 2, 0.00 → 1; midpoint -0.05 → 1.5
    expect(eccentricScore(-0.05)).toBeCloseTo(1.5, 2)
    // -0.20 → 4, -0.10 → 2; midpoint -0.15 → 3
    expect(eccentricScore(-0.15)).toBeCloseTo(3, 2)
  })

  it('clamps grades outside [-0.45, +0.45]', () => {
    expect(eccentricScore(-1.0)).toBe(5)
    expect(eccentricScore(1.0)).toBe(3)
  })

  it('peaks on descents — descent eccentric > climb eccentric at same magnitude', () => {
    expect(eccentricScore(-0.20)).toBeGreaterThan(eccentricScore(0.20))
    expect(eccentricScore(-0.30)).toBeGreaterThan(eccentricScore(0.30))
  })
})

describe('ECCENTRIC_BY_GRADE table provenance', () => {
  it('is tier T2 with a verifiable PubMed citation URL', () => {
    expect(ECCENTRIC_BY_GRADE.tier).toBe('T2')
    expect(ECCENTRIC_BY_GRADE.url).toMatch(/pubmed\.ncbi\.nlm\.nih\.gov/)
    expect(ECCENTRIC_BY_GRADE.citation).toMatch(/Vernillo/)
    expect(ECCENTRIC_BY_GRADE.citation).toMatch(/Peake/)
  })
})

describe('computeEccentricLoad', () => {
  // Build a simple synthetic stream: alt[i] and dist[i] in metres,
  // time[i] in seconds. Each step is 1s and 5m forward.
  function makeStream(altitudeChanges: number[]): {
    altitude: number[]; distance: number[]; time: number[]; heartrate: number[]; velocity: number[]; cadence: number[]
  } {
    const altitude: number[] = [0]
    const distance: number[] = [0]
    const time: number[] = [0]
    let alt = 0
    let dist = 0
    for (let i = 0; i < altitudeChanges.length; i++) {
      alt += altitudeChanges[i]
      dist += 5  // 5m per step
      altitude.push(alt)
      distance.push(dist)
      time.push(i + 1)
    }
    return {
      altitude,
      distance,
      time,
      heartrate: time.map(() => 150),
      velocity: time.map(() => 5),
      cadence: time.map(() => 90),
    }
  }

  it('returns null for an empty / too-short stream', () => {
    const stream = makeStream([])
    expect(computeEccentricLoad(stream)).toBeNull()
  })

  it('reports averageScore 1.0 for an entirely flat stream', () => {
    const stream = makeStream(Array(100).fill(0))
    const result = computeEccentricLoad(stream)
    expect(result).not.toBeNull()
    expect(result!.averageScore).toBeCloseTo(1, 2)
    expect(result!.buckets.severe).toBe(0)
  })

  it('flags a steep descent stream with high averageScore + severe bucket', () => {
    // 100 steps of -1m altitude per 5m distance → -20% grade → score 4
    const stream = makeStream(Array(100).fill(-1))
    const result = computeEccentricLoad(stream)
    expect(result).not.toBeNull()
    expect(result!.averageScore).toBeCloseTo(4, 1)
    // -20% sits in the "severe" bucket (score 4 ≥ 3 threshold)
    expect(result!.buckets.severe).toBeGreaterThan(0)
    expect(result!.buckets.mild).toBe(0)
  })

  it('reports moderate score for sustained gentle climbing (+10%)', () => {
    // 100 steps of +0.5m / 5m = +10% grade → score 2
    const stream = makeStream(Array(100).fill(0.5))
    const result = computeEccentricLoad(stream)
    expect(result).not.toBeNull()
    expect(result!.averageScore).toBeCloseTo(2, 1)
    // Score = 2 sits in "moderate" bucket (2 ≤ score < 3)
    expect(result!.buckets.moderate).toBeGreaterThan(0)
  })

  it('hill-repeats-style stream (alternating climb / descent) averages to ~3', () => {
    // 50 steps at +1m/5m (+20% → score 2), 50 steps at -1m/5m (-20% → score 4)
    const altChanges = [...Array(50).fill(1), ...Array(50).fill(-1)]
    const stream = makeStream(altChanges)
    const result = computeEccentricLoad(stream)
    expect(result).not.toBeNull()
    // 50% at score 2 + 50% at score 4 = 3.0
    expect(result!.averageScore).toBeCloseTo(3, 1)
    expect(result!.totalKmScore).toBeGreaterThan(0)
  })

  it('returns null when altitude and distance arrays mismatch', () => {
    const stream = makeStream(Array(10).fill(0))
    stream.altitude.pop()
    expect(computeEccentricLoad(stream)).toBeNull()
  })
})
