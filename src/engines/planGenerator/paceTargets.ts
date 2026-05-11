/**
 * Pace-target resolution — convert a TrainingMethod's pace zones into
 * concrete personalized targets (HR bpm bounds, RPE, optional pace bounds)
 * using the user's anchor inputs (maxHR, age, etc.).
 *
 * Onboarding currently only collects maxHR + age, so we estimate the
 * anchor each method needs:
 *   - lthr_bpm: LTHR ≈ maxHR × 0.92  (commonly used field estimate)
 *   - aet_bpm:  AeT  ≈ maxHR × 0.78  (rough; method-specific better in time)
 *   - vdot / estimated_5k_time / recent_race_time / self_assessed_pace:
 *     no race result is captured today, so we leave the numeric anchor null
 *     and rely on the method's rpeRange + hrRange to fill the targets.
 *
 * Even when the anchor is null, almost every method JSON declares an
 * hrRange (% of LTHR) on each pace zone, so we still produce HR bpm bounds
 * using the estimated LTHR. RPE bounds always come straight from the JSON.
 */
import type {
  TrainingMethod,
  AnchorType,
  CanonicalPaceZone,
  HrRange,
} from '../../types/training-method'
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import type { AnchorState, PaceTarget, ResolvedPaces, PaceTargetMode } from './types'

const ESTIMATED_LTHR_PCT_OF_MAX = 0.92
const ESTIMATED_AET_PCT_OF_MAX = 0.78

function userMaxHR(config: OnboardingConfig): number {
  return config.maxHR ?? Math.max(120, 220 - (config.age ?? 30))
}

/**
 * Estimate the method's primary anchor value (numeric) from the user inputs
 * we have. Returns `value: null` when only descriptive targets are possible
 * (no race-time captured anywhere in onboarding yet).
 */
export function resolveAnchor(method: TrainingMethod, config: OnboardingConfig): AnchorState {
  const maxHR = userMaxHR(config)
  switch (method.primaryAnchor) {
    case 'lthr_bpm':
      return {
        type: 'lthr_bpm',
        value: Math.round(maxHR * ESTIMATED_LTHR_PCT_OF_MAX),
        sourceNote: `Estimated LTHR = ${ESTIMATED_LTHR_PCT_OF_MAX} × maxHR (${maxHR})`,
      }
    case 'aet_bpm':
      return {
        type: 'aet_bpm',
        value: Math.round(maxHR * ESTIMATED_AET_PCT_OF_MAX),
        sourceNote: `Estimated AeT = ${ESTIMATED_AET_PCT_OF_MAX} × maxHR (${maxHR})`,
      }
    case 'recent_race_time':
    case 'estimated_5k_time':
    case 'vdot':
    case 'self_assessed_pace':
    case 'none':
      // No race result is captured by onboarding yet — fall back to RPE/HR.
      return {
        type: method.primaryAnchor,
        value: null,
        sourceNote: 'No race result captured — using RPE + estimated HR targets',
      }
  }
}

/**
 * Map an hrRange (% of LTHR) onto bpm bounds using the resolved or estimated
 * LTHR. Always uses an LTHR-style anchor even for AeT methods (we approximate
 * LTHR from maxHR for the bpm math) — the per-zone JSON pcts are calibrated
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

/**
 * Build per-zone PaceTargets for a method given user inputs. Always returns
 * something for every declared pace zone — even when only descriptive RPE
 * targets are computable.
 */
export function resolvePaces(method: TrainingMethod, config: OnboardingConfig): ResolvedPaces {
  const anchor = resolveAnchor(method, config)
  const lthrForHrMath = anchor.type === 'lthr_bpm' && anchor.value != null
    ? anchor.value
    : Math.round(userMaxHR(config) * ESTIMATED_LTHR_PCT_OF_MAX)

  const byZone: Partial<Record<CanonicalPaceZone, PaceTarget>> = {}
  for (const z of method.paceZones) {
    const { low: hrLow, high: hrHigh } = hrRangeToBpm(z.hrRange, lthrForHrMath)
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
    target.preferredMode = pickPreferredMode(target)
    byZone[z.canonical] = target
  }

  return { byZone, anchor }
}

/**
 * Tiny helper for the orchestrator: rendering legacy PlannedDay.zone strings
 * from a resolved PaceTarget — e.g. "Z2 Easy (130-148 bpm)".
 */
export function formatZoneString(t: PaceTarget): string {
  const parts: string[] = [t.displayName]
  if (t.hrBpmLow != null && t.hrBpmHigh != null) {
    parts.push(`${t.hrBpmLow}-${t.hrBpmHigh} bpm`)
  } else if (t.rpeLow != null && t.rpeHigh != null) {
    parts.push(`RPE ${t.rpeLow}-${t.rpeHigh}`)
  }
  return parts.join(' · ')
}

// Re-export the AnchorType for tests / callers that don't want to reach into
// the training-method types directly.
export type { AnchorType }
