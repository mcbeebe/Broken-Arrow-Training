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
import { inferGait } from './gait'
import { savitzkyGolay } from './smoothing'
import type {
  GradeBand,
  TerrainProfile,
  TerrainSegment,
} from '../../../types'

const SMOOTHING_WINDOW = 15 // ~15 s at 1 Hz Strava cadence
const SMOOTHING_ORDER = 3
const DEFAULT_BUCKET_SECONDS = 5 // spec §6.1.1

/**
 * Integrate the Minetti energy multiplier over a smoothed altitude /
 * cumulative-distance pair. Shared by `computeWholeActivityGAP` (PR-04) and
 * `computeTerrainProfile` (PR-05) so the two functions cannot drift.
 */
function integrateGAPLoop(
  smoothedAlt: readonly number[],
  distance: readonly number[],
): number {
  const flatCost = costRun(0)
  let totalEqDist = 0
  for (let i = 0; i + 1 < distance.length; i++) {
    const dDist = distance[i + 1] - distance[i]
    if (dDist <= 0) continue
    const grade = (smoothedAlt[i + 1] - smoothedAlt[i]) / dDist
    totalEqDist += dDist * (costRun(grade) / flatCost)
  }
  return totalEqDist
}

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

  const totalEqDist = integrateGAPLoop(smoothedAlt, distance)

  if (totalEqDist <= 0) {
    throw new Error('GAP: equivalent flat distance is zero (no positive-distance segments)')
  }

  const gapSecondsPerKm = (totalSeconds / totalEqDist) * 1000

  return {
    equivalentFlatDistanceM: totalEqDist,
    gapSecondsPerKm,
  }
}

// --- Segment-level Terrain Profile (PR-05) ------------------------------

export interface TerrainProfileInput {
  /** Altitude samples in metres, time-aligned with `distance` and `time`. */
  readonly altitude: readonly number[]
  /** Cumulative distance samples in metres, time-aligned with `altitude` and `time`. */
  readonly distance: readonly number[]
  /** Time samples in seconds (monotonically increasing), time-aligned with the above. */
  readonly time: readonly number[]
  /** Optional cadence stream (steps/min), time-aligned with the others.
   *  When provided, each segment receives a `gait.actualGait` reading. */
  readonly cadence?: readonly number[]
  /** Bucket size in seconds. Default 5 (spec §6.1.1). */
  readonly bucketSeconds?: number
}

/**
 * Eight grade bands tiling the Minetti domain end-to-end. Boundaries are
 * lower-inclusive / upper-exclusive except the topmost band, which is
 * inclusive on both ends so a +45 % sample is captured.
 */
const GRADE_BAND_TEMPLATE: ReadonlyArray<Omit<GradeBand, 'distanceM'>> = [
  { lowerPct: -45, upperPct: -25, label: 'Steep descent' },
  { lowerPct: -25, upperPct: -15, label: 'Moderate descent' },
  { lowerPct: -15, upperPct: -5, label: 'Gentle descent' },
  { lowerPct: -5, upperPct: 0, label: 'Flat-down' },
  { lowerPct: 0, upperPct: 5, label: 'Flat-up' },
  { lowerPct: 5, upperPct: 15, label: 'Gentle climb' },
  { lowerPct: 15, upperPct: 25, label: 'Moderate climb' },
  { lowerPct: 25, upperPct: 45, label: 'Steep climb' },
]

/** Mean of `arr[startIdx..endIdx]` (inclusive endpoints). Skips NaN. */
function meanOver(arr: readonly number[], startIdx: number, endIdx: number): number | null {
  let sum = 0
  let count = 0
  for (let i = startIdx; i <= endIdx; i++) {
    const v = arr[i]
    if (Number.isFinite(v)) {
      sum += v
      count++
    }
  }
  return count > 0 ? sum / count : null
}

function bandIndexFor(gradePct: number): number {
  // Clamp into the polynomial domain so out-of-range samples still bucket.
  const g = gradePct < -45 ? -45 : gradePct > 45 ? 45 : gradePct
  for (let i = 0; i < GRADE_BAND_TEMPLATE.length; i++) {
    const band = GRADE_BAND_TEMPLATE[i]
    const isLast = i === GRADE_BAND_TEMPLATE.length - 1
    const inRange = isLast
      ? g >= band.lowerPct && g <= band.upperPct
      : g >= band.lowerPct && g < band.upperPct
    if (inRange) return i
  }
  return GRADE_BAND_TEMPLATE.length - 1
}

/**
 * Compute the per-activity {@link TerrainProfile} from raw streams.
 *
 * Buckets the activity into fixed-length time windows (default 5 s per
 * spec §6.1.1) and emits one {@link TerrainSegment} per bucket plus an
 * 8-band grade histogram. Vertical gain and loss are accumulated from the
 * smoothed altitude stream.
 *
 * @throws if the three streams have different lengths, fewer than two
 *         samples, or `bucketSeconds` is not strictly positive.
 */
export function computeTerrainProfile(input: TerrainProfileInput): TerrainProfile {
  const { altitude, distance, time, cadence } = input
  const bucketSeconds = input.bucketSeconds ?? DEFAULT_BUCKET_SECONDS

  if (altitude.length !== distance.length || altitude.length !== time.length) {
    throw new Error(
      `TerrainProfile: stream length mismatch (altitude=${altitude.length}, ` +
        `distance=${distance.length}, time=${time.length})`,
    )
  }
  if (cadence !== undefined && cadence.length !== altitude.length) {
    throw new Error(
      `TerrainProfile: cadence stream length mismatch ` +
        `(cadence=${cadence.length}, altitude=${altitude.length})`,
    )
  }
  if (altitude.length < 2) {
    throw new Error(`TerrainProfile: need at least 2 samples (got ${altitude.length})`)
  }
  if (!(bucketSeconds > 0)) {
    throw new Error(`TerrainProfile: bucketSeconds must be > 0 (got ${bucketSeconds})`)
  }

  const n = altitude.length
  const smoothedAlt =
    n >= SMOOTHING_WINDOW
      ? savitzkyGolay(altitude, SMOOTHING_WINDOW, SMOOTHING_ORDER)
      : Array.from(altitude)

  // Vertical gain / loss from the smoothed altitude stream.
  let verticalGainM = 0
  let verticalLossM = 0
  for (let i = 1; i < n; i++) {
    const dh = smoothedAlt[i] - smoothedAlt[i - 1]
    if (dh > 0) verticalGainM += dh
    else if (dh < 0) verticalLossM += -dh
  }

  // Bucket samples into fixed-time windows.
  const segments: TerrainSegment[] = []
  let bucketStart = 0
  for (let i = 1; i < n; i++) {
    const elapsed = time[i] - time[bucketStart]
    const isLast = i === n - 1
    if (elapsed >= bucketSeconds || isLast) {
      const startSec = time[bucketStart]
      const endSec = time[i]
      const segDistance = distance[i] - distance[bucketStart]
      if (segDistance > 0 && endSec > startSec) {
        const segAlt = smoothedAlt[i] - smoothedAlt[bucketStart]
        const meanGrade = segAlt / segDistance
        const runMult = costRun(meanGrade) / costRun(0)
        const meanCadence = cadence !== undefined ? meanOver(cadence, bucketStart, i) : null
        segments.push({
          startSec,
          endSec,
          distanceM: segDistance,
          meanGradePct: meanGrade * 100,
          runMultiplier: runMult,
          paceMps: segDistance / (endSec - startSec),
          cadenceSpm: meanCadence ?? undefined,
          gait: inferGait(meanCadence, meanGrade),
        })
      }
      bucketStart = i
    }
  }

  // Grade histogram: 8 bands, distance-summed.
  const bandDistances = new Array<number>(GRADE_BAND_TEMPLATE.length).fill(0)
  for (const seg of segments) {
    bandDistances[bandIndexFor(seg.meanGradePct)] += seg.distanceM
  }
  const gradeHistogramBands: GradeBand[] = GRADE_BAND_TEMPLATE.map((b, i) => ({
    ...b,
    distanceM: bandDistances[i],
  }))

  // Whole-activity GAP — shared with PR-04 via `integrateGAPLoop`.
  const totalEqDist = integrateGAPLoop(smoothedAlt, distance)
  if (totalEqDist <= 0) {
    throw new Error('TerrainProfile: equivalent flat distance is zero')
  }

  const totalSeconds = time[n - 1] - time[0]
  if (!(totalSeconds > 0)) {
    throw new Error(`TerrainProfile: total elapsed time must be > 0 (got ${totalSeconds})`)
  }
  const gapSecondsPerKm = (totalSeconds / totalEqDist) * 1000

  return {
    equivalentFlatDistanceM: totalEqDist,
    gapSecondsPerKm,
    segments,
    verticalGainM,
    verticalLossM,
    gradeHistogramBands,
  }
}
