/**
 * Whole-activity Grade-Adjusted Pace (GAP).
 *
 * Computes the equivalent flat-running distance and pace that produce the
 * same metabolic cost as the actual graded effort. Lays the math groundwork
 * for segment-level GAP (PR-05) and per-segment terrain profiling.
 *
 * @see Minetti AE et al. (2002) PMID 12183501 — cost-of-locomotion polynomial.
 * @see BA_Terrain_Descent_Engine_Spec_v1.0.docx §5.1, §8.5
 * @see BA_Terrain_Descent_IT_Project_Plan_v1.0.md §PR-04
 */

import { costRun } from './minetti'
import { savitzkyGolay } from './smoothing'

const SMOOTHING_WINDOW = 15 // ~15 s at 1 Hz Strava cadence
const SMOOTHING_ORDER = 3

export interface GAPInput {
  /** Altitude samples in metres, time-aligned with `distance`. */
  readonly altitude: readonly number[]
  /** Cumulative distance samples in metres, time-aligned with `altitude`. */
  readonly distance: readonly number[]
  /** Total elapsed (or moving) time of the activity in seconds. */
  readonly totalSeconds: number
}

export interface GAPResult {
  /** Equivalent flat-running distance (metres) for the same metabolic cost. */
  readonly equivalentFlatDistanceM: number
  /** Grade-adjusted pace expressed as seconds per kilometre of equivalent flat distance. */
  readonly gapSecondsPerKm: number
}

/**
 * Compute whole-activity GAP from raw altitude + distance streams.
 *
 * @throws if the two streams have different lengths, fewer than two samples,
 *         or `totalSeconds` is not strictly positive.
 */
export function computeWholeActivityGAP(input: GAPInput): GAPResult {
  const { altitude, distance, totalSeconds } = input

  if (altitude.length !== distance.length) {
    throw new Error(
      `GAP: stream length mismatch (altitude=${altitude.length}, distance=${distance.length})`,
    )
  }
  if (altitude.length < 2) {
    throw new Error(`GAP: need at least 2 samples (got ${altitude.length})`)
  }
  if (!(totalSeconds > 0)) {
    throw new Error(`GAP: totalSeconds must be > 0 (got ${totalSeconds})`)
  }

  const smoothedAlt =
    altitude.length >= SMOOTHING_WINDOW
      ? savitzkyGolay(altitude, SMOOTHING_WINDOW, SMOOTHING_ORDER)
      : Array.from(altitude)

  const flatCost = costRun(0)
  let totalEqDist = 0
  for (let i = 0; i + 1 < distance.length; i++) {
    const dDist = distance[i + 1] - distance[i]
    if (dDist <= 0) continue
    const grade = (smoothedAlt[i + 1] - smoothedAlt[i]) / dDist
    totalEqDist += dDist * (costRun(grade) / flatCost)
  }

  if (totalEqDist <= 0) {
    throw new Error('GAP: equivalent flat distance is zero (no positive-distance segments)')
  }

  const gapSecondsPerKm = (totalSeconds / totalEqDist) * 1000

  return {
    equivalentFlatDistanceM: totalEqDist,
    gapSecondsPerKm,
  }
}
