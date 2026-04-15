import { describe, it, expect } from 'vitest'
import { computeRaceProjection } from '../utils/raceProjection'
import type { PerformanceMetrics } from '../types'

// Generate a growing CTL trajectory so the "stalled CTL" downgrade
// heuristic doesn't fire on histories meant to be confident.
function perf(n: number, ctl: number): PerformanceMetrics[] {
  const out: PerformanceMetrics[] = []
  const startCtl = Math.max(1, ctl * 0.5)
  for (let i = 0; i < n; i++) {
    const progress = n === 1 ? 1 : i / (n - 1)
    const interp = startCtl + (ctl - startCtl) * progress
    out.push({
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      ctl: interp,
      atl: interp,
      tsb: 0,
      acwr: 1,
    })
  }
  return out
}

describe('computeRaceProjection', () => {
  it('returns null with no performance data', () => {
    const p = computeRaceProjection({
      performance: [],
      distanceMiles: 11.2,
      elevationFt: 3000,
    })
    expect(p.estimatedSeconds).toBeNull()
    expect(p.confidence).toBe('low')
  })

  it('produces a positive projection with plausible magnitude', () => {
    const p = computeRaceProjection({
      performance: perf(50, 50),
      distanceMiles: 11.2,
      elevationFt: 3000,
    })
    // CTL 50 → 10.5 min/mi + 30 sec/mi elev penalty = 11 min/mi × 11.2 ≈ 7392s
    expect(p.estimatedSeconds).toBeGreaterThan(3000)
    expect(p.estimatedSeconds).toBeLessThan(12000)
    expect(p.confidence).toBe('high')
  })

  it('clamps pace at low CTL', () => {
    const low = computeRaceProjection({
      performance: perf(50, 5),
      distanceMiles: 10,
      elevationFt: 0,
    })
    const floor = computeRaceProjection({
      performance: perf(50, 20),
      distanceMiles: 10,
      elevationFt: 0,
    })
    expect(low.estimatedSeconds).toBe(floor.estimatedSeconds)
  })

  it('clamps pace at high CTL', () => {
    const high = computeRaceProjection({
      performance: perf(50, 200),
      distanceMiles: 10,
      elevationFt: 0,
    })
    const ceiling = computeRaceProjection({
      performance: perf(50, 90),
      distanceMiles: 10,
      elevationFt: 0,
    })
    expect(high.estimatedSeconds).toBe(ceiling.estimatedSeconds)
  })

  it('VO2max bonus speeds up the projected time', () => {
    const base = computeRaceProjection({
      performance: perf(50, 50),
      distanceMiles: 10,
      elevationFt: 0,
    })
    const bonused = computeRaceProjection({
      performance: perf(50, 50),
      distanceMiles: 10,
      elevationFt: 0,
      vo2max: 55,
    })
    expect(bonused.estimatedSeconds!).toBeLessThan(base.estimatedSeconds!)
    expect(bonused.basis).toContain('VO2max')
  })

  it('low VO2max slows the projection within cap', () => {
    const base = computeRaceProjection({
      performance: perf(50, 50),
      distanceMiles: 10,
      elevationFt: 0,
    })
    const penalized = computeRaceProjection({
      performance: perf(50, 50),
      distanceMiles: 10,
      elevationFt: 0,
      vo2max: 35,
    })
    expect(penalized.estimatedSeconds!).toBeGreaterThan(base.estimatedSeconds!)
    // Cap is 8% so the delta should be bounded
    const ratio = penalized.estimatedSeconds! / base.estimatedSeconds!
    expect(ratio).toBeLessThan(1.09)
  })

  it('elevation adds seconds per mile across the course', () => {
    const flat = computeRaceProjection({
      performance: perf(50, 50),
      distanceMiles: 10,
      elevationFt: 0,
    })
    const hilly = computeRaceProjection({
      performance: perf(50, 50),
      distanceMiles: 10,
      elevationFt: 3000,
    })
    // 3000ft → 30 sec/mi × 10 miles = 300s added
    expect(hilly.estimatedSeconds! - flat.estimatedSeconds!).toBeCloseTo(300, -1)
  })

  it('downgrades confidence when history is sparse', () => {
    const p = computeRaceProjection({
      performance: perf(10, 40),
      distanceMiles: 10,
      elevationFt: 0,
    })
    expect(p.confidence).toBe('low')
  })

  it('mid confidence at 21-41 days', () => {
    const p = computeRaceProjection({
      performance: perf(25, 40),
      distanceMiles: 10,
      elevationFt: 0,
    })
    expect(p.confidence).toBe('med')
  })

  it('downgrades confidence when CTL stalled (seeded flat data)', () => {
    const stalled: PerformanceMetrics[] = []
    for (let i = 0; i < 25; i++) {
      stalled.push({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        ctl: 40,
        atl: 40,
        tsb: 0,
        acwr: 1,
      })
    }
    const p = computeRaceProjection({
      performance: stalled,
      distanceMiles: 10,
      elevationFt: 0,
    })
    expect(p.confidence).toBe('low')
  })
})
