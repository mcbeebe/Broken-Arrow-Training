/**
 * Running Musculoskeletal Impact Multiplier (MIM) by grade.
 *
 * Running energy cost from Minetti's run polynomial divided by flat-running
 * cost, placing graded running on the same `1.0× = flat running` scale as
 * `hikingMIM` and `cyclingMIM`. Same data table as `Hill_Running_Load_
 * Multipliers_v1.1.xlsx` (Run energy column).
 *
 * Selected reference points (matches the abbreviated table in the v1.1
 * research summary):
 *
 *   grade   runMult (× flat run)
 *   -0.30    0.68
 *   -0.20    0.50    optimal/economical descent
 *   -0.10    0.60
 *    0.00    1.00    flat running (the anchor)
 *   +0.05    1.30    gentle climb
 *   +0.10    1.66    moderate climb
 *   +0.15    2.06    steep climb (run/hike crossover)
 *   +0.20    2.50    very steep climb
 *   +0.30    3.49    extreme climb
 *   +0.45    5.40    scramble
 *
 * Above ~+15% grade hiking becomes more economical (see `hikingMIM`); the
 * caller should switch gait when computing per-segment cost.
 *
 * @see `BA_Terrain_Descent_Engine_Spec_v1.0.docx` §5.1
 * @see `docs/research/Hill_Running_Load_Multipliers_v1.1.xlsx` → Multipliers
 *      sheet, column E (`runMult`)
 */

import { costRun } from './minetti'

const FLAT_RUN_COST = costRun(0)

/**
 * Running energy cost expressed as a multiplier of flat running.
 *
 * @param grade  signed decimal gradient (rise / run); e.g. 0.10 = +10%, -0.05 = -5%.
 *               Inputs outside [-0.45, +0.45] are clamped by the underlying
 *               Minetti run polynomial.
 * @returns      multiplier in the same frame as `cyclingMIM` and `hikingMIM`
 *               (1.0× = flat running). Range: ~0.50 (optimal descent) to
 *               ~5.4 (scramble).
 */
export function runningMIM(grade: number): number {
  return costRun(grade) / FLAT_RUN_COST
}
