/**
 * Daniels VDOT math — convert a race-time anchor into a fitness number (VDOT)
 * and then into concrete pace targets per training zone.
 *
 * Formulas from Daniels' Running Formula (3rd ed., Tables 5.1-5.2):
 *
 *   v  = distance_meters / time_minutes                   // velocity (m/min)
 *   VO2 = -4.6 + 0.182258·v + 0.000104·v²                  // ml/kg/min
 *   %VO2max = 0.8
 *           + 0.1894393·exp(-0.012778·t)
 *           + 0.2989558·exp(-0.1932605·t)                  // t in min
 *   VDOT = VO2 / %VO2max
 *
 * Inverse: given a target VO2 (= zone fraction × VDOT), solve the quadratic
 * for v then express as seconds per mile. Reasonable VDOT range ≈ 30-85.
 *
 * Zone fractions follow Daniels' canonical Easy / Marathon / Threshold /
 * Interval / Repetition spread (E ≈ 65-79% VO2max, M ≈ 80%, T ≈ 88%,
 * I ≈ 97%, R ≈ 110% — R is faster than VDOT pace and we cap the formula
 * to keep the velocity solution real).
 */

import type { CanonicalPaceZone } from '../../types/training-method'

const METERS_PER_MILE = 1609.344

export interface RaceTimeInput {
  /** Distance in miles (e.g., 3.1 for 5K). */
  distanceMiles: number
  /** Total race time in seconds. */
  timeSeconds: number
}

/**
 * Fastest per-mile pace any human sustains (≈ mile world-record pace). A race
 * time implying anything faster is corrupt data, not a real performance.
 */
export const MIN_HUMAN_PACE_SEC_PER_MILE = 240 // 4:00 /mi

/**
 * Guard a race time (seconds) against the "2:30" mm:ss / h:mm:ss ambiguity.
 *
 * A 2 h 30 m half-marathon goal typed as "2:30" parses to 150 s (mm:ss), which
 * implies an ~11 sec/mile pace — impossible — and yields an absurd VDOT (~7600)
 * that poisons every derived pace ("0:17 /mi"). When the implied pace is faster
 * than any human, we re-read the value as if the user meant the next unit up
 * (mm:ss → h:mm, i.e. ×60) and use that when it lands in a runnable range.
 * Slow times are never altered (ultras are legitimately slow). Returns null
 * only when the value is impossible even after rescaling, so callers fall back
 * to RPE/HR instead of emitting garbage.
 */
export function sanitizeRaceTimeSeconds(
  seconds: number | undefined | null,
  distanceMiles: number,
): number | null {
  if (seconds == null || seconds <= 0 || distanceMiles <= 0) return null
  if (seconds / distanceMiles >= MIN_HUMAN_PACE_SEC_PER_MILE) return Math.round(seconds)
  const scaled = seconds * 60 // mm:ss → h:mm reinterpretation
  if (scaled / distanceMiles >= MIN_HUMAN_PACE_SEC_PER_MILE) return Math.round(scaled)
  return null
}

/** Compute VDOT from a single race performance. */
export function vdotFromRace(input: RaceTimeInput): number {
  const meters = input.distanceMiles * METERS_PER_MILE
  const minutes = input.timeSeconds / 60
  if (minutes <= 0 || meters <= 0) return 0
  const v = meters / minutes
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v
  const pctVO2max =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * minutes) +
    0.2989558 * Math.exp(-0.1932605 * minutes)
  if (pctVO2max <= 0) return 0
  return vo2 / pctVO2max
}

/**
 * Inverse: given a VDOT and a target intensity (as fraction of VDOT), solve
 * for the velocity v that produces VO2 = intensity × VDOT, then return
 * seconds per mile at that velocity.
 *
 * VO2(v) = -4.6 + 0.182258·v + 0.000104·v² = intensity × VDOT
 * Quadratic: 0.000104·v² + 0.182258·v − (4.6 + intensity·VDOT) = 0
 */
export function paceSecPerMileFromVdot(vdot: number, intensity: number): number {
  const targetVO2 = intensity * vdot
  const a = 0.000104
  const b = 0.182258
  const c = -(4.6 + targetVO2)
  const disc = b * b - 4 * a * c
  if (disc < 0) return Infinity
  const v = (-b + Math.sqrt(disc)) / (2 * a)
  if (v <= 0) return Infinity
  // seconds per mile = (1609 m/mile) / (v m/min) * 60 s/min
  return Math.round((METERS_PER_MILE / v) * 60)
}

/**
 * Canonical zone intensities (fraction of VDOT) used to convert VDOT into
 * concrete per-zone paces. Numbers follow Daniels' published table values
 * for the midpoint of each zone.
 */
export const ZONE_INTENSITY: Partial<Record<CanonicalPaceZone, { low: number; high: number }>> = {
  recovery:           { low: 0.55, high: 0.65 },
  easy:               { low: 0.65, high: 0.79 },
  aerobic_threshold:  { low: 0.74, high: 0.84 },
  marathon_pace:      { low: 0.79, high: 0.84 },
  lactate_threshold:  { low: 0.86, high: 0.92 },
  critical_velocity:  { low: 0.92, high: 0.96 },
  vo2max:             { low: 0.95, high: 1.00 },
  speed:              { low: 1.05, high: 1.10 },
  race_pace:          { low: 0.85, high: 0.95 },
}

export interface VdotPaceBounds {
  /** Slower end (sec/mile) — corresponds to the lower intensity bound. */
  paceSecPerMileLow: number
  /** Faster end (sec/mile) — corresponds to the upper intensity bound. */
  paceSecPerMileHigh: number
}

/**
 * Derive a per-zone pace range from VDOT. Returns null when the zone has
 * no canonical intensity mapping (we only emit concrete paces for the
 * zones we have good data for).
 */
export function paceBoundsForZone(vdot: number, zone: CanonicalPaceZone): VdotPaceBounds | null {
  const intensity = ZONE_INTENSITY[zone]
  if (!intensity) return null
  // Higher intensity → faster pace → smaller seconds-per-mile.
  // So `paceSecPerMileLow` (the slow end) uses the LOW intensity,
  // `paceSecPerMileHigh` (the fast end) uses the HIGH intensity.
  const slow = paceSecPerMileFromVdot(vdot, intensity.low)
  const fast = paceSecPerMileFromVdot(vdot, intensity.high)
  return {
    paceSecPerMileLow: Math.max(slow, fast),
    paceSecPerMileHigh: Math.min(slow, fast),
  }
}

/** Distance lookup for the race-anchor types declared in OnboardingConfig. */
export const FITNESS_ANCHOR_DISTANCES: Record<string, number> = {
  race_5k: 3.10686,
  race_10k: 6.21371,
  race_hm: 13.10937,
  race_marathon: 26.21875,
}
