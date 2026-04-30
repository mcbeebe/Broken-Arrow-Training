/**
 * Run-vs-hike gait classification per spec §6.1.3.
 *
 * Produces a per-segment {@link GaitDecision} from grade and (optionally)
 * cadence. Two independent signals:
 *
 *   - **recommendedGait** comes from grade alone. Anchored at `+20 %` —
 *     one xlsx step past the `+15 %` energy crossover (where Minetti's run
 *     and walk costs are equal), into the regime where the xlsx labels
 *     hiking unambiguously "more economical". Below `+20 %` the difference
 *     is small enough that running stays sensible; above it walking is
 *     clearly cheaper. Spec §6.1.3 cites Giovanelli 2016 (+28 %) for the
 *     behavioural threshold where recreational runners voluntarily switch;
 *     +20 % keeps us conservative on the recommendation side without
 *     firing on the indifference zone.
 *
 *   - **actualGait** comes from cadence. ≥160 spm is a strong run signal,
 *     <135 spm is a hike signal, the gap in between is left `'unknown'`
 *     so we don't fabricate certainty.
 *
 * Both signals together let downstream code (PR-15 briefing, PR-17
 * compliance score, PR-20 toast) detect mismatches like "you ran when the
 * grade said hike" or "you walked the flats when you should have run".
 *
 * @see `BA_Terrain_Descent_Engine_Spec_v1.0.docx` §6.1.3
 * @see `BA_Terrain_Descent_IT_Project_Plan_v1.0.md` §PR-06
 * @see `docs/research/Hill_Running_Load_Multipliers_v1.1.xlsx` Multipliers sheet, column G ("Recommended gait")
 */

import type { GaitDecision } from '../../../types'

/**
 * Grade at and above which `recommendedGait` flips to `'hike'`. Set one
 * step past the +15 % energy-indifference row in the xlsx Multipliers
 * sheet, into the +20 % "hike (more economical)" regime — conservative on
 * the run side, decisive once hiking is clearly cheaper.
 */
export const RUN_HIKE_CROSSOVER_GRADE = 0.2

/**
 * Cadence (steps/min) at and above which actualGait is `'run'`.
 * Below 135 the actualGait flips to `'hike'`. The 25-spm gap in between is
 * deliberately ambiguous so the engine doesn't classify on weak evidence.
 */
const RUN_CADENCE_FLOOR = 160
const HIKE_CADENCE_CEIL = 135

/**
 * Width of the linear confidence ramp around each cadence threshold. A
 * cadence 20 spm clear of the threshold reaches confidence 1.0; right at
 * the threshold the confidence is 0.6.
 */
const CADENCE_RAMP = 20
const BASE_CONFIDENCE = 0.6

/**
 * Classify gait for one segment from grade and (optionally) mean cadence.
 *
 * @param cadence  steps per minute, or `null` when no cadence stream is
 *                 available. `null` leaves `actualGait` as `'unknown'`.
 * @param grade    signed decimal gradient, e.g. `0.20` for +20 %.
 * @returns        a {@link GaitDecision} suitable for `TerrainSegment.gait`.
 */
export function inferGait(cadence: number | null, grade: number): GaitDecision {
  const recommendedGait: GaitDecision['recommendedGait'] =
    grade >= RUN_HIKE_CROSSOVER_GRADE ? 'hike' : 'run'

  let actualGait: GaitDecision['actualGait'] = 'unknown'
  let confidence = 0
  if (cadence != null) {
    if (cadence >= RUN_CADENCE_FLOOR) {
      actualGait = 'run'
      confidence = Math.min(1, (cadence - RUN_CADENCE_FLOOR) / CADENCE_RAMP + BASE_CONFIDENCE)
    } else if (cadence < HIKE_CADENCE_CEIL) {
      actualGait = 'hike'
      confidence = Math.min(1, (HIKE_CADENCE_CEIL - cadence) / CADENCE_RAMP + BASE_CONFIDENCE)
    }
    // 135 ≤ cadence < 160: ambiguous, leave 'unknown' with confidence 0.
  }

  return {
    recommendedGait,
    actualGait,
    cadenceSpm: cadence,
    confidence,
    reason: 'minetti-crossover',
  }
}
