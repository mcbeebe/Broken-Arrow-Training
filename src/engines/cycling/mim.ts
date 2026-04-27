/**
 * Cycling Musculoskeletal Impact Multiplier (MIM).
 *
 * Cost model:  MIM(IF) = a + b · IF²
 * Default:     a = 0.4, b = 0.4 — calibrated so that easy spinning ≈ 0.5×,
 *              steady Z2 ≈ 0.6×, threshold ≈ 0.8×, sprints ≈ 1.0×.
 * Frame:       1.0× = the musculoskeletal load of running on the flat.
 * Domain:      IF ∈ [0, 1.5] (clamped). Most road riding sits in [0.5, 1.1].
 *
 * Derivation: knee-joint compression in cycling rises linearly with power
 * output (D'Lima 2013, Ericson & Nisell 1986/87). At typical Z2 power the
 * tibiofemoral peak is ≈1.2× bodyweight, vs ≈2.5× BW for running's vGRF
 * peak (Nilsson & Thorstensson 1989). The IF² scaling captures the fact
 * that joint load tracks normalized power, not heart rate or duration.
 *
 * Coefficient values come from `docs/research/Hill_Running_Load_Multipliers_v1.1.xlsx`
 * → `Cycling MIM` sheet, cells J3 and J4. The fixture
 * `src/__tests__/__fixtures__/cycling-mim.json` pins the published intensity
 * zones (recovery 0.55 → sprint 1.20) so the formula can be validated.
 *
 * @see D'Lima DD et al. (2013) "Loading of the knee joint during ergometer cycling: telemetric in vivo data." J Orthop Sports Phys Ther 43(1): 32-40. PMID 23346556.
 * @see Ericson MO, Nisell R. (1986) "Tibiofemoral joint forces during ergometer cycling." Am J Sports Med 14(4): 285-290. PMID 3728780.
 * @see Ericson MO, Nisell R. (1987) "Patellofemoral joint forces during ergometric cycling." Phys Ther 67(9): 1365-1369. PMID 3628491.
 * @see Nilsson J, Thorstensson A. (1989) "Ground reaction forces at different speeds of human walking and running." Acta Physiol Scand 136: 217-227.
 * @see BA_Terrain_Descent_Engine_Spec_v1.0.docx §5.1
 */

import { tier, type TieredValue } from '../evidence'

const CITATION_DLIMA = "D'Lima 2013 PMID 23346556"
const URL_DLIMA = 'https://pubmed.ncbi.nlm.nih.gov/23346556/'
const CITATION_ERICSON = 'Ericson & Nisell 1986/87 PMID 3728780/3628491'

export const CYCLING_MIM_DOMAIN_MIN = 0
export const CYCLING_MIM_DOMAIN_MAX = 1.5

export type CyclingMIMCoeffKey = 'a' | 'b'

export const CYCLING_MIM_COEFFS: Record<CyclingMIMCoeffKey, TieredValue<number>> = {
  a: tier(0.4, 'T2', CITATION_DLIMA, URL_DLIMA),
  b: tier(0.4, 'T2', CITATION_ERICSON),
}

const clampIF = (intensityFactor: number): number =>
  intensityFactor < CYCLING_MIM_DOMAIN_MIN
    ? CYCLING_MIM_DOMAIN_MIN
    : intensityFactor > CYCLING_MIM_DOMAIN_MAX
      ? CYCLING_MIM_DOMAIN_MAX
      : intensityFactor

/**
 * Cycling musculoskeletal impact multiplier as a function of Intensity Factor.
 *
 * @param intensityFactor  IF = NormalizedPower / FTP. For HR-based proxies,
 *                         use heart-rate reserve `(avgHR - rHR) / (mHR - rHR)`.
 *                         Inputs outside [0, 1.5] are clamped to the domain.
 * @returns                MIM in the same frame as flat running (1.0×).
 *                         Range: ~0.4 (true recovery) to ~1.0 (max sprint).
 */
export function cyclingMIM(intensityFactor: number): number {
  const if_ = clampIF(intensityFactor)
  return CYCLING_MIM_COEFFS.a.value + CYCLING_MIM_COEFFS.b.value * if_ * if_
}
