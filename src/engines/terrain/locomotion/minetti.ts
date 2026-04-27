/**
 * Minetti 2002 5th-order polynomial coefficients for the metabolic cost
 * of running and walking on graded terrain.
 *
 * Cost model:  C(g) = c0 + c1·g + c2·g² + c3·g³ + c4·g⁴ + c5·g⁵
 * Units:       J · kg⁻¹ · m⁻¹  (energy per kg of body mass per metre travelled)
 * Domain:      g ∈ [-0.45, +0.45]  (Minetti's published gradient range)
 *
 * Coefficient values are the canonical run + walk fits from
 * `docs/research/Hill_Running_Load_Multipliers_v1.1.xlsx` and reproduce the
 * fixture sample points in `src/__tests__/__fixtures__/hill-running-multipliers.json`
 * within ±0.005 J/kg/m.
 *
 * @see Minetti AE et al. (2002) "Energy cost of walking and running at extreme uphill and downhill slopes." J Appl Physiol 93(3):1039-46. PMID 12183501.
 * @see BA_Terrain_Descent_Engine_Spec_v1.0.docx §5.1
 * @see BA_Terrain_Descent_IT_Project_Plan_v1.0.md §PR-03
 */

import { tier, type TieredValue } from '../../evidence'

const CITATION = 'Minetti 2002 PMID 12183501'
const URL = 'https://pubmed.ncbi.nlm.nih.gov/12183501/'

export const MINETTI_DOMAIN_MIN = -0.45
export const MINETTI_DOMAIN_MAX = 0.45

export type RunCoeffKey = 'a0' | 'a1' | 'a2' | 'a3' | 'a4' | 'a5'
export type WalkCoeffKey = 'b0' | 'b1' | 'b2' | 'b3' | 'b4' | 'b5'

export const MINETTI_RUN_COEFFS: Record<RunCoeffKey, TieredValue<number>> = {
  a0: tier(3.6, 'T1', CITATION, URL),
  a1: tier(19.5, 'T1', CITATION, URL),
  a2: tier(46.3, 'T1', CITATION, URL),
  a3: tier(-43.3, 'T1', CITATION, URL),
  a4: tier(-30.4, 'T1', CITATION, URL),
  a5: tier(155.4, 'T1', CITATION, URL),
}

export const MINETTI_WALK_COEFFS: Record<WalkCoeffKey, TieredValue<number>> = {
  b0: tier(2.5, 'T1', CITATION, URL),
  b1: tier(19.6, 'T1', CITATION, URL),
  b2: tier(51.9, 'T1', CITATION, URL),
  b3: tier(-76.8, 'T1', CITATION, URL),
  b4: tier(-58.7, 'T1', CITATION, URL),
  b5: tier(280.5, 'T1', CITATION, URL),
}

const clampGrade = (g: number): number =>
  g < MINETTI_DOMAIN_MIN ? MINETTI_DOMAIN_MIN : g > MINETTI_DOMAIN_MAX ? MINETTI_DOMAIN_MAX : g

const evalPoly = (c: readonly number[], g: number): number => {
  const x = clampGrade(g)
  // Horner's method, low-to-high: ((((c5·x + c4)·x + c3)·x + c2)·x + c1)·x + c0
  let acc = c[5]
  acc = acc * x + c[4]
  acc = acc * x + c[3]
  acc = acc * x + c[2]
  acc = acc * x + c[1]
  acc = acc * x + c[0]
  return acc
}

const RUN_VALUES = [
  MINETTI_RUN_COEFFS.a0.value,
  MINETTI_RUN_COEFFS.a1.value,
  MINETTI_RUN_COEFFS.a2.value,
  MINETTI_RUN_COEFFS.a3.value,
  MINETTI_RUN_COEFFS.a4.value,
  MINETTI_RUN_COEFFS.a5.value,
] as const

const WALK_VALUES = [
  MINETTI_WALK_COEFFS.b0.value,
  MINETTI_WALK_COEFFS.b1.value,
  MINETTI_WALK_COEFFS.b2.value,
  MINETTI_WALK_COEFFS.b3.value,
  MINETTI_WALK_COEFFS.b4.value,
  MINETTI_WALK_COEFFS.b5.value,
] as const

/**
 * Metabolic cost of running at the given gradient (J/kg/m).
 *
 * @param grade  signed decimal gradient (rise / run); e.g. 0.10 = +10%, -0.05 = -5%.
 *               Inputs outside [-0.45, +0.45] are clamped to the polynomial's valid domain.
 * @returns      energy cost in joules per kilogram of body mass per metre travelled.
 */
export function costRun(grade: number): number {
  return evalPoly(RUN_VALUES, grade)
}

/**
 * Metabolic cost of walking at the given gradient (J/kg/m).
 *
 * @param grade  signed decimal gradient. Clamped to [-0.45, +0.45] (Minetti's domain).
 * @returns      energy cost in joules per kilogram of body mass per metre travelled.
 */
export function costWalk(grade: number): number {
  return evalPoly(WALK_VALUES, grade)
}
