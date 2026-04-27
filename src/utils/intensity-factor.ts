/**
 * Resolve the Intensity Factor (IF) for an activity, with a documented
 * fallback chain when power data is missing.
 *
 * Priority order:
 *   1. Normalized power / FTP   (preferred — captures variable-effort load)
 *   2. Average power / FTP      (smooth-effort fallback)
 *   3. HR-reserve fHR           (no power meter — same formula as Banister
 *                                TRIMP's `(avgHR - rHR) / (mHR - rHR)`)
 *   4. null                     (no usable input)
 *
 * The HR-reserve proxy is calibrated by the Hill Running Load v1.1 research
 * summary: Z2 endurance riding sits at HR-reserve ≈ 0.7 (matching IF 0.7),
 * threshold ≈ 1.0, recovery spin ≈ 0.5. Returned IF is clamped to [0, 1.5]
 * to keep `cyclingMIM(IF)` inside its published domain.
 *
 * @see `docs/research/Hill_Running_Load_Research_Summary_v1.1.docx` §7
 * @see Banister EW (1991) TRIMP fHR formulation
 */

import { CYCLING_MIM_DOMAIN_MAX, CYCLING_MIM_DOMAIN_MIN } from '../engines/cycling/mim'
import type { IFSource } from '../types'

export interface IntensityFactorInputs {
  normalizedPower?: number | null
  avgPower?: number | null
  ftp?: number | null
  avgHR?: number | null
  restingHR?: number | null
  maxHR?: number | null
}

export interface IntensityFactorResult {
  value: number
  source: Extract<IFSource, 'power' | 'hr_reserve'>
}

const clampIF = (intensityFactor: number): number =>
  intensityFactor < CYCLING_MIM_DOMAIN_MIN
    ? CYCLING_MIM_DOMAIN_MIN
    : intensityFactor > CYCLING_MIM_DOMAIN_MAX
      ? CYCLING_MIM_DOMAIN_MAX
      : intensityFactor

const positive = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

/**
 * Pick the best-available Intensity Factor for an activity, falling back to
 * heart-rate reserve when no power data is present. Returns null when nothing
 * usable is supplied, in which case callers should keep the static MIM.
 */
export function computeIntensityFactor(
  inputs: IntensityFactorInputs,
): IntensityFactorResult | null {
  const { normalizedPower, avgPower, ftp, avgHR, restingHR, maxHR } = inputs

  if (positive(ftp)) {
    if (positive(normalizedPower)) {
      return { value: clampIF(normalizedPower / ftp), source: 'power' }
    }
    if (positive(avgPower)) {
      return { value: clampIF(avgPower / ftp), source: 'power' }
    }
  }

  if (positive(avgHR) && positive(restingHR) && positive(maxHR) && maxHR > restingHR) {
    const reserve = (avgHR - restingHR) / (maxHR - restingHR)
    return { value: clampIF(reserve), source: 'hr_reserve' }
  }

  return null
}
