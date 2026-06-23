/**
 * Per-activity eccentric dose, in arbitrary units (AU).
 *
 * The headline metric of the Descent-Load engine. Sums per-segment
 * eccentric work over an activity's descent segments, then divides by a
 * calibration constant so the magnitude lands in a spec-anchored range
 * (≈110 AU for a hard BA Skyrace 23K, spec §8.5).
 *
 * Per-segment formula:
 *   segmentDose = bucket × distanceM × paceFactor
 *   paceFactor  = clamp(paceMps / flatThresholdPaceMps, 0.6, 1.6)
 *
 * `bucket` is the discrete 1–5 score from {@link eccentricBucket} (PR-08);
 * pre-PR-08 segments fall back to deriving it from `meanGradePct`.
 *
 * The /250 calibration is a T4 heuristic — the absolute "AU" is
 * meaningful only relative to itself. Plan PR-09 wrote /1000 in the
 * pseudocode but its own AC2 expects ≈110 AU for the BA 23K, which is
 * inconsistent with /1000 (would produce ~25 AU). /250 reconciles.
 *
 * @see `BA_Terrain_Descent_Engine_Spec_v1.0.docx` §6.2.1, §8.5
 * @see `BA_Terrain_Descent_IT_Project_Plan_v1.0.md` §PR-09
 * @see Vernillo et al. 2017 (PMID 27392180) — eccentric dose framework
 */

import { eccentricBucket } from './eccentricBucket'
import type { EccentricDose, TerrainSegment } from '../../types'

/** Calibration constant: total dose ÷ this gives doseAU. */
export const ECCENTRIC_TRIMP_CALIBRATION = 250

/**
 * doseAU per metre of steep-descent vertical (grade ≤ −10 %), i.e. the
 * `EccentricResult.hardDescentVerticalMeters` field. The full
 * {@link eccentricTrimpForActivity} needs the raw `TerrainSegment[]`, which is
 * only in memory while the WorkoutModal stream is open; the per-activity
 * localStorage cache keeps just the summary. This single spec-anchored constant
 * recovers a doseAU from the one cached field that is unambiguously
 * DOMS-relevant — steep *descent* vertical (concentric climbs and flat road
 * running both yield 0, so dampening fires only on genuine quad loading).
 *
 * Anchor: a hard BA Skyrace 23K (≈110 doseAU, spec §8.5) carries on the order
 * of ~1.1 km of steep descent → ~0.1 AU/m. Approximate but monotonic in the
 * exact quantity that drives DOMS.
 */
export const DOSE_AU_PER_STEEP_DESCENT_M = 0.1

/**
 * Recover a canonical `doseAU` from cached steep-descent vertical metres when
 * the raw segments {@link eccentricTrimpForActivity} needs are gone. Returns 0
 * for non-positive input. See {@link DOSE_AU_PER_STEEP_DESCENT_M}.
 */
export function doseAUFromSteepDescent(hardDescentVerticalMeters: number): number {
  return hardDescentVerticalMeters > 0 ? hardDescentVerticalMeters * DOSE_AU_PER_STEEP_DESCENT_M : 0
}

const PACE_FACTOR_MIN = 0.6
const PACE_FACTOR_MAX = 1.6

export interface EccentricTrimpInput {
  /** Identifier passed straight through to the result. */
  readonly activityId: string
  /** Segments from {@link computeTerrainProfile}. */
  readonly segments: readonly TerrainSegment[]
  /** Athlete's flat-running threshold pace (m/s) — denominator of paceFactor. */
  readonly flatThresholdPaceMps: number
}

/**
 * Sum eccentric load across an activity's descent segments and report
 * the calibrated dose plus a per-bucket histogram.
 *
 * @throws if `flatThresholdPaceMps` is non-positive.
 */
export function eccentricTrimpForActivity(input: EccentricTrimpInput): EccentricDose {
  const { activityId, segments, flatThresholdPaceMps } = input

  if (!(flatThresholdPaceMps > 0)) {
    throw new Error(
      `eccentricTrimp: flatThresholdPaceMps must be > 0 (got ${flatThresholdPaceMps})`,
    )
  }

  let totalDose = 0
  let descentDistanceM = 0
  let weightedGradeSum = 0
  const bucketHistogram: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  }

  for (const seg of segments) {
    if (seg.meanGradePct >= 0) continue

    const bucket: 1 | 2 | 3 | 4 | 5 =
      seg.eccentricBucket ?? eccentricBucket(seg.meanGradePct / 100)

    // Skip near-flat segments (bucket 1 covers grades in (−2.5 %, +7.5 %]).
    // Without this gate, fp-noise grades from SG smoothing on a constant
    // altitude stream still register as tiny "descents" and contaminate
    // the dose for treadmill activities.
    if (bucket <= 1) continue

    const rawFactor = seg.paceMps / flatThresholdPaceMps
    const paceFactor =
      rawFactor < PACE_FACTOR_MIN
        ? PACE_FACTOR_MIN
        : rawFactor > PACE_FACTOR_MAX
          ? PACE_FACTOR_MAX
          : rawFactor

    totalDose += bucket * seg.distanceM * paceFactor
    bucketHistogram[bucket] += seg.distanceM
    descentDistanceM += seg.distanceM
    weightedGradeSum += seg.meanGradePct * seg.distanceM
  }

  const meanDescentGrade =
    descentDistanceM > 0 ? weightedGradeSum / descentDistanceM : 0

  return {
    activityId,
    doseAU: totalDose / ECCENTRIC_TRIMP_CALIBRATION,
    bucketHistogram,
    meanDescentGrade,
    descentDistanceM,
  }
}
