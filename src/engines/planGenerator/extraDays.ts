/**
 * Supplemental-day injection — strength and cross-training sessions selected
 * during onboarding aren't part of a method's running schedule, so the
 * generator slots them onto existing rest days. Pure helpers, no IO.
 *
 * Design choices:
 *   - Only rest days are replaced. We never displace running days; the running
 *     volume comes from the method's pattern and is what the mileage targets
 *     are calibrated against.
 *   - When the user asks for more strength + cross sessions than there are
 *     rest days, we cap silently. Future work could add "double days" but
 *     that's a separate scheduling decision.
 *   - Detail strings are written in the same `·`-separated format the existing
 *     UI / parsers expect (parseRoutine for strength, parseDrillItems for cross).
 */
import type { TrainingMethod, Phase } from '../../types/training-method'
import type { PlannedDay } from '../../types'
import type { OnboardingConfig, CrossTrainingMode } from '../../hooks/useOnboarding'
import { buildStrengthRoutineFor } from './strengthRoutine'

export interface ExtraDaysOptions {
  phaseId: string
  isTaper: boolean
  weekNumber: number
}

const CROSS_MODE_LABEL: Record<CrossTrainingMode, string> = {
  cycling: 'Cycling',
  swimming: 'Swimming',
  rowing: 'Rowing',
  hiking: 'Hiking',
  yoga: 'Yoga / mobility',
}

const CROSS_MODE_DEFAULT_DURATION: Record<CrossTrainingMode, number> = {
  cycling: 45,
  swimming: 30,
  rowing: 30,
  hiking: 60,
  yoga: 30,
}

/**
 * Build the strength detail string. Delegates to the parametric routine
 * builder, which picks exercises based on race profile, experience,
 * equipment, injury status, and phase.
 */
export function buildStrengthDetail(
  config: OnboardingConfig,
  method: TrainingMethod,
  opts: ExtraDaysOptions,
): string {
  return buildStrengthRoutineFor(method, config, {
    phaseId: opts.phaseId,
    isTaper: opts.isTaper,
    weekNumber: opts.weekNumber,
  })
}

type CrossPhase = 'base' | 'build' | 'peak' | 'taper'

function crossPhase(opts: ExtraDaysOptions): CrossPhase {
  if (opts.isTaper) return 'taper'
  const id = opts.phaseId.toLowerCase()
  if (id.includes('taper')) return 'taper'
  if (id.includes('peak') || id.includes('race')) return 'peak'
  if (id.includes('build') || id.includes('specific') || id.includes('lactate') || id.includes('threshold')) return 'build'
  return 'base'
}

/**
 * Build a cross-training detail string for the chosen modality, the
 * current phase, race profile, and injury status. Tailored items help
 * the athlete understand the intent of the session (durability work in
 * Base, race-specific durability in Peak, recovery in Taper).
 *
 * Items use the `·` separator so the ManualLog modal can list them as
 * drill-style checkoffs.
 */
export function buildCrossDetail(
  mode: CrossTrainingMode,
  config: OnboardingConfig,
  opts: ExtraDaysOptions,
): { workout: string; detail: string; time: string; zone: string } {
  const label = CROSS_MODE_LABEL[mode]
  const baseMin = CROSS_MODE_DEFAULT_DURATION[mode]
  const phase = crossPhase(opts)
  const injuryDownshift = config.injuryStatus === 'current'

  // Duration shifts by phase: longer in base/build for durability, shorter
  // in peak/taper to preserve race-day freshness. Injury caps the upper end.
  let min = baseMin
  let max = Math.round(baseMin * 1.3)
  if (phase === 'taper') { min = Math.max(20, Math.round(baseMin * 0.55)); max = Math.max(30, Math.round(baseMin * 0.75)) }
  else if (phase === 'peak') { min = Math.round(baseMin * 0.8); max = Math.round(baseMin * 1.0) }
  else if (phase === 'build') { min = baseMin; max = Math.round(baseMin * 1.4) }
  if (injuryDownshift) { min = Math.round(min * 0.7); max = Math.round(max * 0.8) }

  // Intensity zone shifts by phase. Trail/mountain athletes climbing on
  // hikes deserve a higher target (Z2-3 for power-hiking) during build/peak.
  const isMountain = config.raceType === 'trail' && config.raceDistance === 'mountain_ultra'
  let zone = 'Z1-2'
  if (phase === 'taper') zone = 'Z1'
  else if (phase === 'build' && mode === 'cycling') zone = 'Z2-3'
  else if (phase === 'build' && mode === 'rowing') zone = 'Z2-3'
  else if ((phase === 'build' || phase === 'peak') && mode === 'hiking' && isMountain) zone = 'Z2-3'

  // Per-(mode, phase) detail lines. Strings reference duration/zone above
  // so the modal stays in sync.
  const intent: Record<CrossPhase, string> = {
    base: 'aerobic durability',
    build: 'sustained Z2 with some pickups',
    peak: 'race-specific durability',
    taper: 'flush legs, stay loose',
  }

  const items: Record<CrossTrainingMode, string[]> = {
    cycling: [
      `${min} min ride · ${zone} · ${intent[phase]}`,
      phase === 'build' ? '3-5 × 5 min steady Z3 with full recovery between' : 'Cadence 85-95 rpm, low resistance',
      injuryDownshift ? 'Stop early if anything pinches — this is auxiliary work' : 'Foam roll 5 min after',
    ],
    swimming: [
      `${min} min swim · easy effort · ${intent[phase]}`,
      phase === 'build' ? 'Mix in a few 100m moderate pulls' : 'Mix freestyle and kick sets',
      'Focus on long, relaxed strokes',
    ],
    rowing: [
      `${min} min erg · ${zone} · ${intent[phase]}`,
      phase === 'build' ? '4 × 4 min moderate, 2 min recovery' : 'Drive with legs, finish with arms',
      'Stretch hip flexors 2 min/side after',
    ],
    hiking: [
      isMountain
        ? `${min}-${max} min uphill hike · ${zone} · pole-plant rhythm, race-specific climbing`
        : `${min}-${max} min hike · ${zone} · steady aerobic effort`,
      'Use poles if available — plant rhythm matches breathing',
      phase === 'peak' && isMountain
        ? 'Wear race shoes / pack you plan to race in — dress rehearsal'
        : 'Power-hike posture: hands on thighs on steep bits',
    ],
    yoga: [
      `${min} min ${phase === 'taper' || phase === 'peak' ? 'restorative' : 'flow'} session`,
      'Focus on hips, hamstrings, calves',
      injuryDownshift ? 'Skip any pose that aggravates the injury site' : "Pigeon, runner's lunge, downward dog",
    ],
  }
  return {
    workout: `Cross-train · ${label}`,
    detail: items[mode].join(' · '),
    time: `${min}-${max} min`,
    zone,
  }
}

/**
 * Pick a cross-training modality from the user's onboarding selection. Honors
 * the method's approved modalities (e.g. Koop endorses hiking + cycling).
 * Returns null when nothing fits.
 */
export function pickCrossMode(
  config: OnboardingConfig,
  method: TrainingMethod,
): CrossTrainingMode | null {
  if (!config.crossTrainingModes || config.crossTrainingModes.length === 0) return null
  const approved = new Set(method.crossTrainingRecommendation.approvedModalities)
  const approvedSelection = config.crossTrainingModes.find(m => approved.has(m))
  return approvedSelection ?? config.crossTrainingModes[0]
}

/**
 * Replace rest-day entries in `days` with strength and cross-training
 * sessions per the onboarding config. Mutates a shallow copy and returns it;
 * never reorders or removes non-rest days.
 *
 * Order of placement:
 *   - One cross-training session per week (if requested) → first rest day.
 *   - Strength sessions (capped at remaining rest days) → next rest days.
 */
export function injectExtraDays(
  days: PlannedDay[],
  config: OnboardingConfig,
  method: TrainingMethod,
  phase: Phase | undefined,
  weekMileage: { isTaper: boolean; phaseId: string; weekNumber: number },
): PlannedDay[] {
  const wantCross = !!config.crossTrainingModes && config.crossTrainingModes.length > 0
  const wantStrength = (config.strengthDaysPerWeek ?? 0) > 0
  if (!wantCross && !wantStrength) return days

  const opts: ExtraDaysOptions = {
    phaseId: weekMileage.phaseId,
    isTaper: weekMileage.isTaper,
    weekNumber: weekMileage.weekNumber,
  }

  const next = [...days]
  const restIndices = next
    .map((d, i) => (d.type === 'rest' ? i : -1))
    .filter(i => i >= 0)
  let cursor = 0

  if (wantCross) {
    const mode = pickCrossMode(config, method)
    if (mode && restIndices.length > cursor) {
      const idx = restIndices[cursor++]
      const c = buildCrossDetail(mode, config, opts)
      next[idx] = {
        ...next[idx],
        type: 'cross',
        workout: c.workout,
        detail: c.detail,
        zone: c.zone,
        time: c.time,
        route: '',
      }
    }
  }

  if (wantStrength) {
    const want = config.strengthDaysPerWeek ?? 0
    const bounds = method.strengthRecommendation.daysPerWeek
    const capped = Math.min(want, bounds.max)
    const taperPhaseId = (phase && phase.mileageBehavior === 'taper') ? phase.id : null
    const isTaperPhase = !!taperPhaseId && weekMileage.phaseId === taperPhaseId
    // Drop to 1 day during taper regardless of user pref — strength is
    // maintenance-only this phase per every method's philosophy.
    const target = isTaperPhase || weekMileage.isTaper ? Math.min(1, capped) : capped

    let placed = 0
    while (placed < target && cursor < restIndices.length) {
      const idx = restIndices[cursor++]
      next[idx] = {
        ...next[idx],
        type: 'strength',
        workout: 'Strength',
        detail: buildStrengthDetail(config, method, opts),
        zone: 'Z1',
        time: opts.isTaper ? '30 min' : '45-60 min',
        route: '',
      }
      placed += 1
    }
  }

  return next
}
