/**
 * Shared heart-rate helpers — one source of truth across all plan engines.
 *
 * Before this, maxHR was computed four different ways: the method engine used
 * `220 − age` floored at 120, while the Hyrox and General-Fitness engines used
 * `220 − age` with no floor — so the same athlete could get different zones by
 * path. We now route everything through `computeMaxHR`, which also upgrades the
 * estimate from the crude 220−age to the Tanaka formula (more accurate, esp. for
 * masters athletes).
 */
import type { OnboardingConfig } from '../hooks/useOnboarding'

/** Lower bound for an estimated maxHR — guards absent / nonsensical age input. */
export const MAX_HR_FLOOR = 120

/**
 * Estimated maximum heart rate (bpm). Prefers a value the athlete actually
 * entered/measured; otherwise the Tanaka et al. (2001) regression
 * `208 − 0.7 × age`, which tracks measured maxHR far better than `220 − age`
 * (which systematically under-estimates for older athletes). Floored so a
 * missing or absurd age never yields a dangerously low ceiling.
 */
export function computeMaxHR(config: Pick<OnboardingConfig, 'maxHR' | 'age'>): number {
  if (config.maxHR && config.maxHR > 0) return config.maxHR
  const age = config.age ?? 30
  return Math.max(MAX_HR_FLOOR, Math.round(208 - 0.7 * age))
}
