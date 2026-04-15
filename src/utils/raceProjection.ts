import type { PerformanceMetrics } from '../types'

/**
 * Rough race time projection from training load trajectory.
 *
 * This is deliberately conservative — it gives a coach-useful ballpark, not a
 * prediction. The logic:
 *   - Estimate a baseline "fit pace" from CTL (fitness score):
 *       CTL ≈ 30  → ~12 min/mi on mixed trail
 *       CTL ≈ 50  → ~10:30 min/mi
 *       CTL ≈ 70  → ~9:30 min/mi
 *     (linear interp between, clamped outside)
 *   - Apply a VO2max bonus if available (scaled, small).
 *   - Apply a terrain/elevation penalty from race elevation (minutes per 1000ft).
 *   - Confidence reflects data completeness:
 *       high  — ≥42 days of performance history AND CTL trending stable/up
 *       med   — ≥21 days
 *       low   — <21 days or sparse data
 */

export interface RaceProjection {
  estimatedSeconds: number | null
  confidence: 'low' | 'med' | 'high'
  basis: string
}

interface Inputs {
  performance: PerformanceMetrics[]
  distanceMiles: number
  elevationFt: number
  vo2max?: number
}

function paceSecFromCTL(ctl: number): number {
  // Piecewise linear in min/mi then convert to sec/mi
  const anchors: [number, number][] = [
    [20, 13.0],
    [30, 12.0],
    [50, 10.5],
    [70, 9.5],
    [90, 8.75],
  ]
  if (ctl <= anchors[0][0]) return anchors[0][1] * 60
  if (ctl >= anchors[anchors.length - 1][0]) {
    return anchors[anchors.length - 1][1] * 60
  }
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x1, y1] = anchors[i]
    const [x2, y2] = anchors[i + 1]
    if (ctl >= x1 && ctl <= x2) {
      const t = (ctl - x1) / (x2 - x1)
      return (y1 + t * (y2 - y1)) * 60
    }
  }
  return anchors[anchors.length - 1][1] * 60
}

export function computeRaceProjection(inputs: Inputs): RaceProjection {
  const { performance, distanceMiles, elevationFt, vo2max } = inputs

  if (!performance || performance.length === 0 || !distanceMiles) {
    return {
      estimatedSeconds: null,
      confidence: 'low',
      basis: 'insufficient data — need more training history',
    }
  }

  const latest = performance[performance.length - 1]
  const basePaceSec = paceSecFromCTL(latest.ctl)

  // VO2max bonus: each point above 45 shaves ~1.2% off pace, capped at ~8%
  let vo2Adj = 1.0
  if (vo2max && vo2max > 0) {
    const delta = Math.max(-10, Math.min(15, vo2max - 45))
    vo2Adj = 1 - delta * 0.012
    vo2Adj = Math.max(0.92, Math.min(1.08, vo2Adj))
  }

  // Elevation penalty: ~10 seconds per mile per 1000ft across the course
  const elevPenaltyPerMile = (elevationFt / 1000) * 10

  const adjustedPaceSec = basePaceSec * vo2Adj + elevPenaltyPerMile
  const estimatedSeconds = Math.round(adjustedPaceSec * distanceMiles)

  // Confidence
  const history = performance.length
  let confidence: 'low' | 'med' | 'high' = 'low'
  if (history >= 42) confidence = 'high'
  else if (history >= 21) confidence = 'med'

  // Degrade confidence if CTL is still building rapidly (sparse data proxy)
  const earliest = performance[0]
  if (earliest && latest.ctl > 0 && earliest.ctl > 0) {
    const ratio = earliest.ctl / latest.ctl
    if (ratio > 0.95 && history < 30) {
      confidence = 'low'  // CTL barely moved → seeded, not real
    }
  }

  const basis = vo2max
    ? `CTL ${latest.ctl.toFixed(0)} + VO2max ${vo2max.toFixed(0)} · ${distanceMiles.toFixed(1)}mi · ${elevationFt}ft`
    : `CTL ${latest.ctl.toFixed(0)} · ${distanceMiles.toFixed(1)}mi · ${elevationFt}ft`

  return { estimatedSeconds, confidence, basis }
}
