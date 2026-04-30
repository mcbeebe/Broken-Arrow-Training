/**
 * Repeated-bout protection — the 14-day "bulletproofing" curve from
 * Hyldahl 2017 (PMID 27782911).
 *
 * After a hard eccentric bout, the muscle adapts. A second bout within
 * ~14 days produces less DOMS and less performance decrement. Effect
 * peaks around day 7 and decays linearly to zero at the window edges.
 *
 * Per-bout protection (triangular curve over [0, 14] days):
 *
 *   protectionFromBout = maxProtection × strength × max(0, 1 - |d - 7| / 7)
 *
 * where `strength = min(1, doseAU / referenceDose)` saturates the curve
 * for bouts at or above the reference dose.
 *
 * For a window of recent bouts, the engine reports the **maximum** of the
 * per-bout protections (not their sum) — Hyldahl 2017 finds protection
 * doesn't accumulate above the peak; the most recent qualifying stimulus
 * dominates.
 *
 * @see Hyldahl RD, Chen TC, Nosaka K (2017) "Mechanisms and Mediators of
 *      the Skeletal Muscle Repeated Bout Effect." Exerc Sport Sci Rev
 *      45(1):24-33. PMID 27782911.
 * @see `BA_Terrain_Descent_Engine_Spec_v1.0.docx` §6.2.2
 * @see `BA_Terrain_Descent_IT_Project_Plan_v1.0.md` §PR-10
 */

import type { EccentricBoutRecord, RepeatedBoutState } from '../../types'

/** Reference dose for `strength` saturation (T4). Anchored at spec §8.5's "≈110 AU" BA Skyrace dose; round number. */
export const REPEATED_BOUT_DEFAULT_REFERENCE_DOSE = 100
/** Maximum protection factor — Hyldahl 2017 mean reduction in DOMS. */
export const REPEATED_BOUT_DEFAULT_MAX_PROTECTION = 0.45

const PROTECTION_WINDOW_DAYS = 14
const PEAK_DAY = 7

export interface ProtectionFromBoutInput {
  bout: EccentricBoutRecord
  today: Date
  referenceDose?: number
  maxProtection?: number
}

export interface RepeatedBoutProtectionInput {
  today: Date
  bouts: readonly EccentricBoutRecord[]
  referenceDose?: number
  maxProtection?: number
}

/**
 * Snap a Date to UTC midnight (ms). Used so day-difference math is
 * insensitive to time-of-day and timezone.
 */
function snapToUTCDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** Integer days from `boutISO` (ISO date or datetime) to `today`. */
function daysBetween(boutISO: string, today: Date): number {
  const b = new Date(boutISO)
  return Math.round((snapToUTCDay(today) - snapToUTCDay(b)) / 86400000)
}

/**
 * Protection factor for a single bout, scaled by dose and weighted by
 * recency on the triangular [0, 14]-day curve. Returns 0 outside the
 * window or for future bouts.
 */
export function protectionFromBout(input: ProtectionFromBoutInput): number {
  const { bout, today } = input
  const referenceDose = input.referenceDose ?? REPEATED_BOUT_DEFAULT_REFERENCE_DOSE
  const maxProtection = input.maxProtection ?? REPEATED_BOUT_DEFAULT_MAX_PROTECTION

  const d = daysBetween(bout.date, today)
  if (d < 0 || d > PROTECTION_WINDOW_DAYS) return 0

  const strength = Math.min(1, bout.doseAU / referenceDose)
  const recency = Math.max(0, 1 - Math.abs(d - PEAK_DAY) / PEAK_DAY)
  return maxProtection * strength * recency
}

/**
 * Aggregate repeated-bout protection across a window of recent eccentric
 * bouts. Returns the **maximum** per-bout protection (not the sum) plus
 * the bout that produced it.
 */
export function repeatedBoutProtection(input: RepeatedBoutProtectionInput): RepeatedBoutState {
  const { today, bouts } = input
  const referenceDose = input.referenceDose ?? REPEATED_BOUT_DEFAULT_REFERENCE_DOSE
  const maxProtection = input.maxProtection ?? REPEATED_BOUT_DEFAULT_MAX_PROTECTION

  const recentBouts: EccentricBoutRecord[] = []
  let bestProtection = 0
  let bestBout: EccentricBoutRecord | undefined

  for (const bout of bouts) {
    const d = daysBetween(bout.date, today)
    if (d < 0 || d > PROTECTION_WINDOW_DAYS) continue
    recentBouts.push(bout)

    const p = protectionFromBout({ bout, today, referenceDose, maxProtection })
    if (p > bestProtection) {
      bestProtection = p
      bestBout = bout
    }
  }

  return {
    recentBouts,
    protectionFactor: bestProtection,
    peakAt: bestProtection > 0 ? bestBout?.date : undefined,
  }
}
