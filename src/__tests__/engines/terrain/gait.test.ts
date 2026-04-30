// PLAN-vs-CODE drift (PR-06, BA_Terrain_Descent_IT_Project_Plan_v1.0.md §PR-06):
//
// 1. Simplified signature: `inferGait(cadence, grade)` instead of the plan's
//    `inferGait(cadence, grade, runMult, walkMult)`. With a single grade
//    threshold, the multiplier params are dead weight.
// 2. Threshold value: +20 % (one xlsx step past the +15 % energy-
//    indifference label, into the regime the xlsx flags as "hike (more
//    economical)") rather than the plan's "+28 % Giovanelli". +28 %
//    describes a behavioural threshold; +15 % is the indifference point;
//    +20 % is the conservative recommendation point — running stays
//    sensible up to indifference, hiking is firm advice past it.
// 3. Plan's example formula `(grade > 0 && walkMult < runMult)` is
//    internally broken: walkMult < runMult is true at every grade ≥ 0 per
//    the v1.1 xlsx, which would make every positive grade `'hike'` and
//    contradict the plan's own `+10 %` example test (which expects
//    `'run'`). The grade-threshold formula matches every documented test.
// 4. AC3 (`segments with grade ≥ +28 % must be 'hike'`) is satisfied
//    trivially by the +20 % threshold (≥+28 % ⇒ ≥+20 %).

import { describe, it, expect } from 'vitest'

import { inferGait, RUN_HIKE_CROSSOVER_GRADE } from '../../../engines/terrain/locomotion/gait'
import { computeTerrainProfile } from '../../../engines/terrain/locomotion/gap'
import type { GaitDecision } from '../../../types'

describe('inferGait (PR-06)', () => {
  describe('AC1: recommendedGait based on grade threshold', () => {
    it('grade ≥ +20 % returns "hike"', () => {
      expect(inferGait(170, 0.2).recommendedGait).toBe('hike')
      expect(inferGait(170, 0.28).recommendedGait).toBe('hike')
      expect(inferGait(170, 0.4).recommendedGait).toBe('hike')
    })

    it('grade < +20 % returns "run" (including the +15 % energy crossover)', () => {
      expect(inferGait(170, 0.19).recommendedGait).toBe('run')
      expect(inferGait(170, 0.15).recommendedGait).toBe('run')
      expect(inferGait(170, 0.1).recommendedGait).toBe('run')
      expect(inferGait(170, 0.05).recommendedGait).toBe('run')
      expect(inferGait(170, 0.0).recommendedGait).toBe('run')
      expect(inferGait(170, -0.05).recommendedGait).toBe('run')
      expect(inferGait(170, -0.2).recommendedGait).toBe('run')
    })

    it('the crossover constant is exposed and equals 0.20', () => {
      expect(RUN_HIKE_CROSSOVER_GRADE).toBe(0.2)
    })
  })

  describe('AC2: actualGait inferred from cadence', () => {
    it('cadence ≥ 160 → actualGait "run", confidence ≥ 0.6', () => {
      const decision = inferGait(170, 0.05)
      expect(decision.actualGait).toBe('run')
      expect(decision.confidence).toBeGreaterThanOrEqual(0.6)
    })

    it('cadence at the run boundary (160) → "run", confidence ≈ 0.6', () => {
      const decision = inferGait(160, 0.05)
      expect(decision.actualGait).toBe('run')
      expect(decision.confidence).toBeCloseTo(0.6, 6)
    })

    it('cadence < 135 → actualGait "hike", confidence ≥ 0.6', () => {
      const decision = inferGait(110, 0.10)
      expect(decision.actualGait).toBe('hike')
      expect(decision.confidence).toBeGreaterThanOrEqual(0.6)
    })

    it('cadence in [135, 160) → "unknown", confidence 0', () => {
      const d145 = inferGait(145, 0.05)
      expect(d145.actualGait).toBe('unknown')
      expect(d145.confidence).toBe(0)
      const d135 = inferGait(135, 0.05)
      expect(d135.actualGait).toBe('unknown')
      expect(d135.confidence).toBe(0)
      const d159 = inferGait(159, 0.05)
      expect(d159.actualGait).toBe('unknown')
      expect(d159.confidence).toBe(0)
    })

    it('null cadence → "unknown", confidence 0', () => {
      const d = inferGait(null, 0.05)
      expect(d.actualGait).toBe('unknown')
      expect(d.confidence).toBe(0)
    })

    it('cadence well above 160 caps confidence at 1', () => {
      const d = inferGait(200, 0.05)
      expect(d.actualGait).toBe('run')
      expect(d.confidence).toBe(1)
    })

    it('cadence well below 135 caps confidence at 1', () => {
      const d = inferGait(100, 0.05)
      expect(d.actualGait).toBe('hike')
      expect(d.confidence).toBe(1)
    })
  })

  describe('GaitDecision shape', () => {
    it('returns the spec\'d fields with cadenceSpm threaded through', () => {
      const d: GaitDecision = inferGait(170, 0.20)
      expect(d.recommendedGait).toBe('hike')
      expect(d.actualGait).toBe('run')
      expect(d.cadenceSpm).toBe(170)
      expect(d.confidence).toBeGreaterThan(0)
      expect(d.reason).toBe('minetti-crossover')
    })

    it('cadenceSpm is null when no cadence provided', () => {
      const d = inferGait(null, 0.0)
      expect(d.cadenceSpm).toBeNull()
    })
  })

  describe('cadence vs gait disagreement (compliance signal for PR-17)', () => {
    it('high cadence on a steep climb: actualGait "run" but recommendedGait "hike"', () => {
      const d = inferGait(180, 0.30)
      expect(d.recommendedGait).toBe('hike')
      expect(d.actualGait).toBe('run')
      // The compliance flag itself isn't computed here (PR-17), but the
      // raw signals must allow it to be derived.
      expect(d.actualGait !== d.recommendedGait).toBe(true)
    })

    it('low cadence on flat ground: actualGait "hike" but recommendedGait "run"', () => {
      const d = inferGait(110, 0.0)
      expect(d.recommendedGait).toBe('run')
      expect(d.actualGait).toBe('hike')
      expect(d.actualGait !== d.recommendedGait).toBe(true)
    })
  })
})

describe('computeTerrainProfile populates segment.gait (PR-06 wiring)', () => {
  // BA Skyrace 23K segments — same fixture as PR-05 with the loop-closure
  // adjustment. Drives both gait classification and ensuring AC3 holds.
  interface RawSegment {
    label: string
    distanceM: number
    grade: number
  }
  const BA_SEGMENTS: readonly RawSegment[] = [
    { label: 'Valley start to KT-22 base', distanceM: 2000, grade: 0.05 },
    { label: 'KT-22 climb', distanceM: 2500, grade: 0.22 },
    { label: 'KT-22 descent', distanceM: 1000, grade: -0.18 },
    { label: 'Stairway approach', distanceM: 1500, grade: 0.15 },
    { label: 'Stairway to Heaven ladder', distanceM: 300, grade: 0.4 },
    { label: 'Headwall traverse', distanceM: 1000, grade: 0.05 },
    { label: 'Granite Chief descent', distanceM: 2500, grade: -0.2 },
    { label: 'Mid-course rolling', distanceM: 4000, grade: 0.03 },
    { label: 'Final climb', distanceM: 3000, grade: 0.12 },
    { label: 'Final descent to village', distanceM: 3900, grade: -0.16 },
  ] as const

  function buildStream(segments: readonly RawSegment[], totalSeconds: number) {
    const totalDistance = segments.reduce((s, x) => s + x.distanceM, 0)
    const speed = totalDistance / totalSeconds
    const time: number[] = [0]
    const distance: number[] = [0]
    const altitude: number[] = [0]
    let segIdx = 0
    let segDistanceCovered = 0
    for (let s = 1; s <= totalSeconds; s++) {
      const seg = segments[segIdx]
      time.push(s)
      distance.push(distance[s - 1] + speed)
      altitude.push(altitude[s - 1] + speed * seg.grade)
      segDistanceCovered += speed
      if (segDistanceCovered >= seg.distanceM && segIdx < segments.length - 1) {
        segIdx++
        segDistanceCovered = 0
      }
    }
    return { altitude, distance, time }
  }

  const stream = buildStream(BA_SEGMENTS, 9000)

  it('every segment carries a gait field', () => {
    const profile = computeTerrainProfile({ ...stream })
    for (const seg of profile.segments) {
      expect(seg.gait).toBeDefined()
      expect(['run', 'hike']).toContain(seg.gait!.recommendedGait)
    }
  })

  it('AC3: every segment with meanGradePct ≥ +28% has gait.recommendedGait === "hike"', () => {
    const profile = computeTerrainProfile({ ...stream })
    for (const seg of profile.segments) {
      if (seg.meanGradePct >= 28) {
        expect(seg.gait!.recommendedGait).toBe('hike')
      }
    }
  })

  it('every segment with meanGradePct ≥ +20 % (the configured threshold) is hike', () => {
    const profile = computeTerrainProfile({ ...stream })
    for (const seg of profile.segments) {
      if (seg.meanGradePct >= 20) {
        expect(seg.gait!.recommendedGait).toBe('hike')
      }
    }
  })

  it('segments below +20 % (descents, flats, sub-threshold climbs) are recommended as "run"', () => {
    const profile = computeTerrainProfile({ ...stream })
    for (const seg of profile.segments) {
      if (seg.meanGradePct < 20) {
        expect(seg.gait!.recommendedGait).toBe('run')
      }
    }
  })

  it('without a cadence stream, every segment\'s actualGait is "unknown" (confidence 0)', () => {
    const profile = computeTerrainProfile({ ...stream })
    for (const seg of profile.segments) {
      expect(seg.gait!.actualGait).toBe('unknown')
      expect(seg.gait!.confidence).toBe(0)
      expect(seg.gait!.cadenceSpm).toBeNull()
    }
  })

  it('with a constant 170 spm cadence stream, every segment\'s actualGait is "run"', () => {
    const cadence = stream.time.map(() => 170)
    const profile = computeTerrainProfile({ ...stream, cadence })
    for (const seg of profile.segments.slice(0, 100)) {
      expect(seg.gait!.actualGait).toBe('run')
      expect(seg.gait!.cadenceSpm).toBeCloseTo(170, 6)
      expect(seg.gait!.confidence).toBeGreaterThanOrEqual(0.6)
    }
  })

  it('with a constant 110 spm cadence stream, every segment\'s actualGait is "hike"', () => {
    const cadence = stream.time.map(() => 110)
    const profile = computeTerrainProfile({ ...stream, cadence })
    for (const seg of profile.segments.slice(0, 100)) {
      expect(seg.gait!.actualGait).toBe('hike')
    }
  })

  it('throws when cadence stream length disagrees with altitude length', () => {
    const cadence = [170, 170, 170] // wrong length
    expect(() => computeTerrainProfile({ ...stream, cadence })).toThrow(/length/i)
  })
})
