/**
 * Additive grade-aware multiplier on top of an athlete's base MIM
 * coefficient. Composes with the static `MIM_MATRIX` in
 * `src/utils/trimp.ts` (preserved verbatim) — non-running sports are
 * unaffected and existing callers continue to receive the same MIM until
 * they opt into {@link mimEffective}.
 *
 * The modifier weights distance fraction at three coarse grade bands:
 *
 *     gradeModifier = wClimb × 1.40 + wDescent × 1.60 + wFlat × 1.00
 *
 * - **Climb** (≥ +5 % grade): 1.40× MSK load — concentric quad-driven work
 * - **Descent** (≤ −5 % grade): 1.60× MSK load — eccentric braking damage
 * - **Flat** (between): 1.00× — baseline
 *
 * The 1.40 / 1.60 anchors are first-principles (T3) MSK-composition
 * estimates: descent eccentric load is consistently higher than climb
 * concentric load per Vernillo 2017. Calibration becomes per-athlete
 * once the Bayesian rebuild lands in PR-S5+.
 *
 * @see BA_Terrain_Descent_Engine_Spec_v1.0.docx §6.3
 * @see BA_Terrain_Descent_IT_Project_Plan_v1.0.md §PR-14
 */

import { tier, type TieredValue } from '../evidence'
import type { GradeModifier, SportType, TerrainProfile } from '../../types'

/** SportType values that should receive the grade-aware modifier. */
export const RUNNING_SPORTS: ReadonlySet<SportType> = new Set<SportType>([
  'running',
  'trail_running',
  'running_steep',
  'hiking',
  'hiking_steep',
])

/** Multiplier on the climb-distance fraction (≥ +5 % grade). */
export const CLIMB_MSK_MULT: TieredValue<number> = tier(
  1.4,
  'T3',
  'first-principles MSK composition (concentric quad load)',
)

/** Multiplier on the descent-distance fraction (≤ −5 % grade). */
export const DESCENT_MSK_MULT: TieredValue<number> = tier(
  1.6,
  'T3',
  'first-principles MSK composition (eccentric braking load); Vernillo 2017 anchor',
)

const CLIMB_THRESHOLD_PCT = 5
const DESCENT_THRESHOLD_PCT = -5

/**
 * Compute the distance-weighted MIM grade modifier for an activity's
 * {@link TerrainProfile}. Returns 1 (no modification) for empty or
 * missing-distance profiles.
 *
 * @returns a {@link GradeModifier} (number) typically in [1.0, ~1.6].
 */
export function gradeModifier(profile: TerrainProfile): GradeModifier {
  const total = profile.segments.reduce((s, x) => s + x.distanceM, 0)
  if (total === 0) return 1

  let climbDist = 0
  let descentDist = 0
  for (const seg of profile.segments) {
    if (seg.meanGradePct >= CLIMB_THRESHOLD_PCT) climbDist += seg.distanceM
    else if (seg.meanGradePct <= DESCENT_THRESHOLD_PCT) descentDist += seg.distanceM
  }
  const flatDist = total - climbDist - descentDist
  const wClimb = climbDist / total
  const wDescent = descentDist / total
  const wFlat = flatDist / total

  return wClimb * CLIMB_MSK_MULT.value + wDescent * DESCENT_MSK_MULT.value + wFlat * 1.0
}

/**
 * Compose the grade modifier with a base multiplier. Non-running sports
 * (or activities with no terrain profile) pass `baseMultiplier` through
 * unchanged so existing callers see no behavior change.
 *
 * @param sportType        the activity's sport type
 * @param profile          terrain profile when available; otherwise undefined
 * @param baseMultiplier   athlete's base MIM coefficient for the sport
 *                         (typically `getSportMultiplier(sportType, athleteId)`
 *                         from `src/utils/trimp.ts`)
 */
export function mimEffective(
  sportType: SportType,
  profile: TerrainProfile | undefined,
  baseMultiplier: number,
): number {
  if (!RUNNING_SPORTS.has(sportType) || !profile) return baseMultiplier
  return baseMultiplier * gradeModifier(profile)
}
