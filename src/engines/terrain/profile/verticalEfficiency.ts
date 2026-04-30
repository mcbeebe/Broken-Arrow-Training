/**
 * Vertical Efficiency (VE) at LT1 — a longitudinal climbing-fitness metric.
 *
 * "VE = vertical metres ascended per minute, on segments where the athlete
 * is both climbing (≥ +5 % grade) and at aerobic threshold (HR within
 * ±5 bpm of LT1)" per spec §6.1.2.
 *
 * Two athletes with the same GAP can have very different VE if one is more
 * economical on the climb itself (Hoogkamer 2014). Surfaces as a 12-week
 * trend in PR-18; for now we just emit one number per activity.
 *
 * @see `BA_Terrain_Descent_Engine_Spec_v1.0.docx` §6.1.2
 * @see `BA_Terrain_Descent_IT_Project_Plan_v1.0.md` §PR-07
 * @see Hoogkamer W et al. (2014). "The biomechanics of competitive male runners in three marathon racing shoes." J Appl Physiol.
 */

import type { TerrainSegment } from '../../../types'

/** Climb gate per spec §6.1.2 — segments below this grade are excluded. */
const CLIMB_GATE_GRADE_PCT = 5
/** HR window around LT1 (in bpm) — symmetric, inclusive on both sides. */
const LT1_BAND_BPM = 5
/** Minimum qualifying segment time below which VE is too noisy to report. */
const MIN_QUALIFYING_SECONDS = 60

export interface VEInput {
  /** Segments from {@link computeTerrainProfile}. */
  readonly segments: readonly TerrainSegment[]
  /** Raw HR stream (bpm), time-aligned with `time`. */
  readonly hr: readonly number[]
  /** Raw time stream (seconds, monotonically increasing). */
  readonly time: readonly number[]
  /** Athlete's aerobic threshold heart rate (bpm). */
  readonly lt1Bpm: number
}

/**
 * Compute Vertical Efficiency (m/min at LT1) for one activity.
 *
 * @returns the VE in metres per minute, or `null` when there are fewer than
 *          {@link MIN_QUALIFYING_SECONDS} seconds of qualifying segment
 *          time. Never throws on insufficient data — that's a `null`
 *          signal, not an error.
 * @throws  if `hr.length !== time.length` or `lt1Bpm` is non-positive.
 */
export function computeVE(input: VEInput): number | null {
  const { segments, hr, time, lt1Bpm } = input

  if (hr.length !== time.length) {
    throw new Error(
      `VE: hr stream length (${hr.length}) must equal time stream length (${time.length})`,
    )
  }
  if (!(lt1Bpm > 0)) {
    throw new Error(`VE: lt1Bpm must be > 0 (got ${lt1Bpm})`)
  }
  if (segments.length === 0) return null

  const lo = lt1Bpm - LT1_BAND_BPM
  const hi = lt1Bpm + LT1_BAND_BPM

  // Walk segments and the HR/time stream together. Both are monotonic in
  // time, so we never re-scan an HR sample.
  let totalVerticalM = 0
  let totalQualifyingSeconds = 0
  let hrIdx = 0

  for (const seg of segments) {
    if (seg.meanGradePct < CLIMB_GATE_GRADE_PCT) continue

    // Advance hrIdx to the first sample inside the segment.
    while (hrIdx < time.length && time[hrIdx] < seg.startSec) hrIdx++

    let sum = 0
    let count = 0
    let i = hrIdx
    while (i < time.length && time[i] < seg.endSec) {
      const v = hr[i]
      if (Number.isFinite(v)) {
        sum += v
        count++
      }
      i++
    }
    if (count === 0) continue

    const meanHR = sum / count
    if (meanHR < lo || meanHR > hi) continue

    const elapsed = seg.endSec - seg.startSec
    if (elapsed <= 0) continue

    const verticalM = (seg.meanGradePct / 100) * seg.distanceM
    totalVerticalM += verticalM
    totalQualifyingSeconds += elapsed
  }

  if (totalQualifyingSeconds < MIN_QUALIFYING_SECONDS) return null

  const minutes = totalQualifyingSeconds / 60
  return totalVerticalM / minutes
}
