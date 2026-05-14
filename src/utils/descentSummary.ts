import type { CachedEccentric } from './runEccentric'

/**
 * Customer-language summary of an activity's descent damage.
 *
 * Translates the engine's 1–5 eccentric score + descent-bucket distances
 * (computed by `src/engines/descent/eccentric.ts`, cached in
 * `src/utils/runEccentric.ts`) into a single severity tier and a
 * one-sentence narrative the athlete can read in two seconds.
 *
 * We do *not* surface the AU dose, the protection factor, or the 1–5
 * scale — those live in the engine; the card lives in the customer's
 * vocabulary.
 */

export type DescentSeverity = 'none' | 'mild' | 'moderate' | 'severe'

export interface DescentSummary {
  severity: DescentSeverity
  /** Number of fire emojis to render (0–4). */
  fireCount: number
  headline: string
  /** Forecast narrative for the next few days. */
  forecast: string
  /** Meters of distance in the steep-descent bucket — used by tests + tooltips. */
  severeMeters: number
}

const NONE: DescentSummary = {
  severity: 'none',
  fireCount: 0,
  headline: 'No descent damage today.',
  forecast: 'Quads should feel normal tomorrow.',
  severeMeters: 0,
}

export function summariseDescent(eccentric: CachedEccentric | null): DescentSummary {
  if (!eccentric) return NONE
  const avg = eccentric.averageScore
  const severe = eccentric.buckets.severe
  const moderate = eccentric.buckets.moderate
  if (avg < 1.2 && severe < 100) return NONE

  if (avg >= 3.0 || severe >= 1500) {
    return {
      severity: 'severe',
      fireCount: 4,
      headline: 'That descent will wreck your quads.',
      forecast: 'Peak soreness in 24–48h, lingering 3–5 days. We\'ve eased your next two runs.',
      severeMeters: severe,
    }
  }
  if (avg >= 2.3 || severe >= 700) {
    return {
      severity: 'severe',
      fireCount: 3,
      headline: 'Big descent — your quads will feel it tomorrow.',
      forecast: 'Peak soreness 24–48h from now. Tomorrow\'s run is eased ~20%.',
      severeMeters: severe,
    }
  }
  if (avg >= 1.8 || severe >= 300 || moderate >= 1500) {
    return {
      severity: 'moderate',
      fireCount: 2,
      headline: 'Moderate descent damage.',
      forecast: 'Expect some quad soreness 24–48h from now. Plan unchanged.',
      severeMeters: severe,
    }
  }
  return {
    severity: 'mild',
    fireCount: 1,
    headline: 'A little descent damage.',
    forecast: 'Quads may feel mildly stiff tomorrow. Easy on day-1, normal day-2.',
    severeMeters: severe,
  }
}
