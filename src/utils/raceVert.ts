/**
 * Race vertical-gain helpers — the structured vert input the plan engine needs to
 * prescribe climbing + descending work (iRunFar roadmap R1). Prefers a structured
 * `elevationGainFt` (entered in onboarding); falls back to the free-text
 * `elevation` string (the existing readiness path) and then the race description.
 *
 * Tiers follow iRunFar's race classification ("Race-Specific Training"):
 *   Flat < 120 ft/mi · Mountainous 120–240 ft/mi · Colossal > 240 ft/mi.
 */
import type { RaceInfo } from '../types'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import { parseRaceElevationFt } from './raceReadiness'

const FT_PER_M = 3.28084

/**
 * Parse a total vertical-gain number from free text like "8,000 ft of climbing",
 * "+8000ft", or "2,400 m vert". Metres (when explicitly "m"/"meters" of
 * vert/gain/climb/ascent) are converted to feet; otherwise feet are assumed.
 * Returns 0 when no vertical-gain figure is present.
 */
export function parseVertFromText(text: string | null | undefined): number {
  if (!text) return 0
  // Metres first — only when paired with a vert/gain/climb word (avoid matching
  // distances like "100 m sprints").
  const m = text.match(/([\d,]+(?:\.\d+)?)\s*(?:m|meters?|metres?)\s*(?:of\s*)?(?:vert|gain|climb|ascen|elev)/i)
  if (m) {
    const n = parseFloat(m[1].replace(/,/g, ''))
    if (n > 0) return Math.round(n * FT_PER_M)
  }
  const f = text.match(/([\d,]+(?:\.\d+)?)\s*(?:\+\s*)?(?:ft|feet|foot)\b/i)
  if (f) {
    const n = parseFloat(f[1].replace(/,/g, ''))
    if (n > 0) return Math.round(n)
  }
  return 0
}

/**
 * Total race vertical gain in feet. Structured `elevationGainFt` wins; else parse
 * the `elevation` string; else parse the free-text description. 0 when unknown.
 */
export function raceVertGainFt(race: RaceInfo | null | undefined): number {
  if (!race) return 0
  if (typeof race.elevationGainFt === 'number' && race.elevationGainFt > 0) {
    return Math.round(race.elevationGainFt)
  }
  const fromElev = parseRaceElevationFt(race)
  if (fromElev > 0) return fromElev
  return parseVertFromText(race.description)
}

/** Race climb density in feet of gain per mile. 0 when distance/vert unknown. */
export function raceVertFtPerMile(race: RaceInfo | null | undefined): number {
  if (!race) return 0
  const miles = race.distanceMiles || 0
  if (miles <= 0) return 0
  return raceVertGainFt(race) / miles
}

export type VertTier = 'flat' | 'mountainous' | 'colossal'

/**
 * iRunFar race tier by ft/mi: Flat < 120, Mountainous 120–240, Colossal > 240.
 * (Note: vert *tracking* turns on at the lower 100 ft/mi `VERT_TRACKING_FT_PER_MI`
 * threshold; the tiers here drive the *prescription* mix.)
 */
export function vertTier(ftPerMile: number): VertTier {
  if (ftPerMile > 240) return 'colossal'
  if (ftPerMile >= 120) return 'mountainous'
  return 'flat'
}

/**
 * Resolve the structured vert (ft) from an onboarding config — the structured
 * field first, else parsed from the free-text race description. Used by the plan
 * builder to populate `RaceInfo`.
 */
export function configVertGainFt(config: OnboardingConfig): number {
  if (typeof config.elevationGainFt === 'number' && config.elevationGainFt > 0) {
    return Math.round(config.elevationGainFt)
  }
  return parseVertFromText(config.raceDescription)
}
