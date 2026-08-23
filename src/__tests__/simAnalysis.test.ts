/**
 * Simulation-split analysis (Phase 3b) — share-based targets from the
 * session's own total (no configured finish time exists to compare
 * against), and the weak-station callout in time lost.
 */
import { describe, it, expect } from 'vitest'
import { analyzeSimSplits, type StationSplit } from '../utils/simAnalysis'

function halfSim(overrides: Partial<Record<string, number>> = {}): StationSplit[] {
  // A balanced half sim: runs ~5 min, stations near their expected weights.
  const sec = {
    run1: 300, ski: 255, run2: 300, push: 180, run3: 300, pull: 240, run4: 300, bbj: 300,
    ...overrides,
  }
  return [
    { label: 'Run 1 — 1 km', kind: 'run', sec: sec.run1 },
    { label: 'SkiErg — 1000 m', kind: 'station', sec: sec.ski },
    { label: 'Run 2 — 1 km', kind: 'run', sec: sec.run2 },
    { label: 'Sled push — 50 m @ 152 kg', kind: 'station', sec: sec.push },
    { label: 'Run 3 — 1 km', kind: 'run', sec: sec.run3 },
    { label: 'Sled pull — 50 m @ 103 kg', kind: 'station', sec: sec.pull },
    { label: 'Run 4 — 1 km', kind: 'run', sec: sec.run4 },
    { label: 'Burpee broad jumps — 80 m', kind: 'station', sec: sec.bbj },
  ]
}

describe('analyzeSimSplits', () => {
  it('a balanced sim gets targets on every segment and no weak-station callout', () => {
    const a = analyzeSimSplits(halfSim())
    expect(a.isSimulation).toBe(true)
    expect(a.totalSec).toBe(2175)
    expect(a.rows).toHaveLength(8)
    expect(a.rows.every(r => r.expectedSec != null && r.deltaSec != null)).toBe(true)
    // Deltas sum to ~0 — the shape is fitted to the session's own total.
    const sum = a.rows.reduce((n, r) => n + (r.deltaSec ?? 0), 0)
    expect(Math.abs(sum)).toBeLessThanOrEqual(4) // rounding only
    expect(a.weakStation).toBeNull()
  })

  it('a blown-up station becomes THE weak station, in time lost', () => {
    // Sled pull takes 6 minutes instead of ~4 — everything else on shape.
    const a = analyzeSimSplits(halfSim({ pull: 360 }))
    expect(a.weakStation).not.toBeNull()
    expect(a.weakStation!.label.startsWith('Sled pull')).toBe(true)
    // Generator/onboarding vocabulary, ready for config.weakStation.
    expect(a.weakStation!.reweightName).toBe('Sled Pull')
    expect(a.weakStation!.lostSec).toBeGreaterThanOrEqual(60)
  })

  it('slow RUNS never trigger the station callout', () => {
    const a = analyzeSimSplits(halfSim({ run1: 500, run2: 500, run3: 500, run4: 500 }))
    // Stations all come in under their (now larger) expected shares.
    expect(a.weakStation).toBeNull()
  })

  it('station-only circuits list splits without targets or callouts', () => {
    const a = analyzeSimSplits([
      { label: 'SkiErg — round 1', kind: 'station', sec: 64 },
      { label: 'Wall balls — round 1', kind: 'station', sec: 58 },
    ])
    expect(a.isSimulation).toBe(false)
    expect(a.rows.every(r => r.expectedSec == null)).toBe(true)
    expect(a.weakStation).toBeNull()
  })

  it('roxzone segments are listed but carry no target and never distort the shape', () => {
    const splits = [...halfSim(), { label: 'Roxzone 1', kind: 'roxzone' as const, sec: 45 }]
    const a = analyzeSimSplits(splits)
    const rox = a.rows.find(r => r.kind === 'roxzone')!
    expect(rox.sec).toBe(45)
    expect(rox.expectedSec).toBeUndefined()
    expect(a.weakStation).toBeNull()
  })
})
