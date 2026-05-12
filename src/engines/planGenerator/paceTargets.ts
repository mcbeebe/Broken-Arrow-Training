/**
 * Pace-target resolution — convert a TrainingMethod's pace zones into
 * concrete personalized targets (HR bpm bounds, RPE, optional pace bounds)
 * using the user's fitness inputs.
 *
 * Order of preference when picking each zone's targets:
 *   1. If the user supplied a recent race time → compute VDOT and emit
 *      concrete pace ranges in sec/mile (Daniels-style math; see vdot.ts).
 *   2. If the user supplied a self-reported easy pace → emit pace ranges
 *      derived from that easy pace as an anchor.
 *   3. Whenever the method's pace zone declares an hrRange, emit HR bpm
 *      bounds against the user's LTHR — using their reported LTHR if they
 *      gave one, otherwise estimating LTHR ≈ 0.92 × maxHR.
 *   4. Whenever the method's pace zone declares an rpeRange, copy those
 *      RPE bounds straight through (always available as the fallback).
 *
 * Every zone gets a PaceTarget. `preferredMode` tells the UI which mode
 * is the strongest signal for display (pace > hr > rpe).
 */
import type {
  TrainingMethod,
  AnchorType,
  CanonicalPaceZone,
  HrRange,
} from '../../types/training-method'
import type { OnboardingConfig, FitnessAnchor } from '../../hooks/useOnboarding'
import type { AnchorState, PaceTarget, ResolvedPaces, PaceTargetMode } from './types'
import {
  FITNESS_ANCHOR_DISTANCES,
  paceBoundsForZone,
  vdotFromRace,
  ZONE_INTENSITY,
} from './vdot'

const ESTIMATED_LTHR_PCT_OF_MAX = 0.92
const ESTIMATED_AET_PCT_OF_MAX = 0.78

function userMaxHR(config: OnboardingConfig): number {
  return config.maxHR ?? Math.max(120, 220 - (config.age ?? 30))
}

/**
 * Estimate the method's primary anchor value (numeric) from the user inputs
 * we have. Returns `value: null` when only descriptive targets are possible.
 *
 * Preference order:
 *   - User-supplied LTHR (config.fitnessAnchor.type === 'lthr') → use exactly
 *   - Race-time anchor → compute VDOT (and derive LTHR for HR-anchored methods)
 *   - Otherwise → estimate LTHR / AeT from maxHR
 */
export function resolveAnchor(method: TrainingMethod, config: OnboardingConfig): AnchorState {
  const maxHR = userMaxHR(config)
  const fa = config.fitnessAnchor

  // Direct LTHR — best case for HR-anchored methods.
  if (method.primaryAnchor === 'lthr_bpm') {
    if (fa?.type === 'lthr' && fa.bpm) {
      return {
        type: 'lthr_bpm',
        value: fa.bpm,
        sourceNote: `User-supplied LTHR: ${fa.bpm} bpm`,
      }
    }
    return {
      type: 'lthr_bpm',
      value: Math.round(maxHR * ESTIMATED_LTHR_PCT_OF_MAX),
      sourceNote: `Estimated LTHR = ${ESTIMATED_LTHR_PCT_OF_MAX} × maxHR (${maxHR})`,
    }
  }

  if (method.primaryAnchor === 'aet_bpm') {
    return {
      type: 'aet_bpm',
      value: Math.round(maxHR * ESTIMATED_AET_PCT_OF_MAX),
      sourceNote: `Estimated AeT = ${ESTIMATED_AET_PCT_OF_MAX} × maxHR (${maxHR})`,
    }
  }

  // VDOT / race-time / 5K-estimate / self-assessed.
  // If the user has a race time, we can compute concrete VDOT.
  const vdotFromAnchor = computeVdotIfPossible(fa)
  if (vdotFromAnchor != null && vdotFromAnchor > 0) {
    return {
      type: method.primaryAnchor,
      value: Math.round(vdotFromAnchor * 10) / 10,
      sourceNote: `VDOT derived from ${anchorLabel(fa!.type)} (${fa!.valueSeconds}s)`,
    }
  }

  return {
    type: method.primaryAnchor,
    value: null,
    sourceNote: 'No race result captured — using RPE + estimated HR targets',
  }
}

function anchorLabel(t: FitnessAnchor['type']): string {
  switch (t) {
    case 'race_5k': return 'recent 5K'
    case 'race_10k': return 'recent 10K'
    case 'race_hm': return 'recent half marathon'
    case 'race_marathon': return 'recent marathon'
    case 'easy_pace': return 'self-reported easy pace'
    case 'lthr': return 'LTHR'
    case 'none': return 'no anchor'
  }
}

function computeVdotIfPossible(fa: FitnessAnchor | undefined): number | null {
  if (!fa || !fa.valueSeconds) return null
  if (fa.type in FITNESS_ANCHOR_DISTANCES) {
    return vdotFromRace({
      distanceMiles: FITNESS_ANCHOR_DISTANCES[fa.type],
      timeSeconds: fa.valueSeconds,
    })
  }
  return null
}

/**
 * Map an hrRange (% of LTHR) onto bpm bounds using the resolved or estimated
 * LTHR. Always uses an LTHR-style anchor for the HR math (we approximate
 * LTHR from maxHR for AeT methods) — the per-zone JSON pcts are calibrated
 * around LTHR by convention.
 */
function hrRangeToBpm(
  hrRange: HrRange | undefined,
  lthrEstimateBpm: number,
): { low?: number; high?: number } {
  if (!hrRange) return {}
  const low = hrRange.minPctLthr != null ? Math.round(hrRange.minPctLthr * lthrEstimateBpm) : undefined
  const high = hrRange.maxPctLthr != null ? Math.round(hrRange.maxPctLthr * lthrEstimateBpm) : undefined
  return { low, high }
}

function pickPreferredMode(t: {
  hrBpmLow?: number
  paceSecPerMileLow?: number
  rpeLow?: number
}): PaceTargetMode {
  if (t.paceSecPerMileLow != null) return 'pace'
  if (t.hrBpmLow != null) return 'hr'
  return 'rpe'
}

function lthrForHrMath(anchor: AnchorState, config: OnboardingConfig): number {
  // If the user gave an exact LTHR, use it for HR math.
  if (config.fitnessAnchor?.type === 'lthr' && config.fitnessAnchor.bpm) {
    return config.fitnessAnchor.bpm
  }
  if (anchor.type === 'lthr_bpm' && anchor.value != null) {
    return anchor.value
  }
  return Math.round(userMaxHR(config) * ESTIMATED_LTHR_PCT_OF_MAX)
}

/**
 * Derive a per-zone pace range using a self-reported easy pace as anchor.
 * We treat the user's easy_pace as the SLOW end of the `easy` zone and
 * scale other zones by the canonical intensity ratios (relative to easy
 * intensity). This is rough but better than RPE-only when no race time
 * exists.
 */
function paceBoundsFromEasyPace(
  easyPaceSecPerMile: number,
  zone: CanonicalPaceZone,
): { low: number; high: number } | null {
  const intensity = ZONE_INTENSITY[zone]
  const easy = ZONE_INTENSITY.easy
  if (!intensity || !easy) return null
  // Pace scales inversely with intensity. Use the easy zone's midpoint as
  // the reference: pace_zone / pace_easy ≈ intensity_easy / intensity_zone.
  const easyMid = (easy.low + easy.high) / 2
  const slow = easyPaceSecPerMile * (easyMid / intensity.low)
  const fast = easyPaceSecPerMile * (easyMid / intensity.high)
  return {
    low: Math.round(Math.max(slow, fast)),
    high: Math.round(Math.min(slow, fast)),
  }
}

/**
 * Build per-zone PaceTargets for a method given user inputs. Always returns
 * something for every declared pace zone — even when only descriptive RPE
 * targets are computable.
 */
export function resolvePaces(method: TrainingMethod, config: OnboardingConfig): ResolvedPaces {
  const anchor = resolveAnchor(method, config)
  const lthrBpm = lthrForHrMath(anchor, config)
  const fa = config.fitnessAnchor

  // Concrete VDOT for pace math, if we can get one. Anchors that already
  // resolved to a VDOT value (race-time methods) live in anchor.value;
  // for HR/AeT-anchored methods, we still try VDOT from the user's race
  // time so pace numbers can land on the JSON's pace zones.
  const vdot = (anchor.type === 'lthr_bpm' || anchor.type === 'aet_bpm')
    ? computeVdotIfPossible(fa)
    : (anchor.value ?? null)

  const easyPaceSecPerMile =
    fa?.type === 'easy_pace' && fa.valueSeconds ? fa.valueSeconds : null

  const byZone: Partial<Record<CanonicalPaceZone, PaceTarget>> = {}
  for (const z of method.paceZones) {
    const { low: hrLow, high: hrHigh } = hrRangeToBpm(z.hrRange, lthrBpm)
    const target: PaceTarget = {
      zone: z.canonical,
      displayName: z.displayName,
      abbreviation: z.abbreviation,
      hrBpmLow: hrLow,
      hrBpmHigh: hrHigh,
      rpeLow: z.rpeRange?.min,
      rpeHigh: z.rpeRange?.max,
      preferredMode: 'rpe',
      cue: z.rpeRange?.description,
    }

    // Concrete pace: prefer VDOT-derived, else easy-pace-derived.
    if (vdot != null && vdot > 0) {
      const bounds = paceBoundsForZone(vdot, z.canonical)
      if (bounds) {
        target.paceSecPerMileLow = bounds.paceSecPerMileLow
        target.paceSecPerMileHigh = bounds.paceSecPerMileHigh
      }
    } else if (easyPaceSecPerMile != null) {
      const bounds = paceBoundsFromEasyPace(easyPaceSecPerMile, z.canonical)
      if (bounds) {
        target.paceSecPerMileLow = bounds.low
        target.paceSecPerMileHigh = bounds.high
      }
    }

    target.preferredMode = pickPreferredMode(target)
    byZone[z.canonical] = target
  }

  return { byZone, anchor }
}

function formatPaceSec(secPerMile: number): string {
  const m = Math.floor(secPerMile / 60)
  const s = Math.round(secPerMile % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Tiny helper for the orchestrator: rendering legacy PlannedDay.zone strings
 * from a resolved PaceTarget — e.g. "E pace · 8:35-9:15 /mi · 130-148 bpm".
 */
export function formatZoneString(t: PaceTarget): string {
  const parts: string[] = [t.displayName]
  if (t.paceSecPerMileLow != null && t.paceSecPerMileHigh != null) {
    parts.push(`${formatPaceSec(t.paceSecPerMileHigh)}-${formatPaceSec(t.paceSecPerMileLow)} /mi`)
  }
  if (t.hrBpmLow != null && t.hrBpmHigh != null) {
    parts.push(`${t.hrBpmLow}-${t.hrBpmHigh} bpm`)
  } else if (t.paceSecPerMileLow == null && t.rpeLow != null && t.rpeHigh != null) {
    parts.push(`RPE ${t.rpeLow}-${t.rpeHigh}`)
  }
  return parts.join(' · ')
}

// Re-export the AnchorType for tests / callers that don't want to reach into
// the training-method types directly.
export type { AnchorType }
