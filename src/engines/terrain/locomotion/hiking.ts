/**
 * Hiking Musculoskeletal Impact Multiplier (MIM) by grade.
 *
 * Walking energy from Minetti's walk polynomial divided by flat-running cost,
 * placing hiking on the same `1.0× = flat running` scale as the rest of the
 * MIM matrix and the cycling MIM module.
 *
 * Selected reference points (from `Hill_Running_Load_Multipliers_v1.1.xlsx`):
 *
 *   grade   walkMult (× flat run)
 *   -0.20    0.30    fast, controlled descent — the "free speed" for walkers
 *   -0.10    0.31    optimal walking descent (energy minimum)
 *    0.00    0.69    flat hiking — same as `costWalk(0) / costRun(0)`
 *    0.10    1.36    moderate climb
 *    0.20    2.19    very steep climb (hiking now cheaper than running)
 *    0.30    3.11    extreme climb
 *    0.45    4.89    near-scramble
 *
 * Above ~+20% grade walking is consistently more economical than running,
 * which is why elite skyrunners power-hike steep sections.
 *
 * @see `BA_Terrain_Descent_Engine_Spec_v1.0.docx` §5.1
 * @see `docs/research/Hill_Running_Load_Multipliers_v1.1.xlsx` → `Multipliers` sheet, column F (`walkMult`)
 */

import { costRun, costWalk } from './minetti'

const FLAT_RUN_COST = costRun(0)

/**
 * Hiking energy cost expressed as a multiplier of flat running.
 *
 * @param grade  signed decimal gradient (rise / run); e.g. 0.10 = +10%, -0.05 = -5%.
 *               Inputs outside [-0.45, +0.45] are clamped by the underlying
 *               Minetti walk polynomial.
 * @returns      multiplier in the same frame as `cyclingMIM` (1.0× = flat running).
 *               Range: ~0.30 (optimal descent) to ~4.9 (scramble).
 */
export function hikingMIM(grade: number): number {
  return costWalk(grade) / FLAT_RUN_COST
}
