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

export interface ExtraDaysOptions {
  phaseId: string
  isTaper: boolean
  weekNumber: number
}

/**
 * Caps applied during supplemental-day injection. `maxExtras` is the upper
 * bound on the total number of injected (strength + cross) sessions for
 * the week — used by the generator to honor the user's
 * `trainingDaysPerWeek` as a TOTAL-days cap (running + strength + cross),
 * rather than the legacy behavior of treating it as running days only.
 *
 * When unset, behavior matches the historical "fill every rest day"
 * pattern, preserved for the seed-plan / legacy callers.
 */
export interface ExtraDaysCaps {
  maxExtras?: number
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

// Base routine the modal's parseRoutine() can read directly — each ` · `-
// separated item resolves to a guide entry in src/utils/exercises.ts.
const BASE_STRENGTH_ROUTINE = [
  'Goblet Squat 3×12',
  'Bulgarian Split Squat 3×10/leg',
  'RDL 3×10',
  'Step-Up 3×10/leg',
  'Calf Raise 3×15',
  'Plank 3×45s',
  'Dead Bug 3×10/side',
]

const TAPER_STRENGTH_ROUTINE = [
  'Goblet Squat 2×10',
  'Bulgarian Split Squat 2×8/leg',
  'Calf Raise 2×12',
  'Plank 2×30s',
]

// Bodyweight-only variants for athletes who selected no gym access. Keeps
// the same movement pattern (squat / hinge / single-leg / core) so the
// training stimulus is comparable, just unweighted.
const BASE_BODYWEIGHT_ROUTINE = [
  'Bodyweight Squat 3×20',
  'Bulgarian Split Squat 3×10/leg',
  'Single-Leg Glute Bridge 3×12/leg',
  'Step-Up 3×10/leg',
  'Calf Raise 3×20',
  'Plank 3×45s',
  'Dead Bug 3×10/side',
]

const TAPER_BODYWEIGHT_ROUTINE = [
  'Bodyweight Squat 2×15',
  'Bulgarian Split Squat 2×8/leg',
  'Calf Raise 2×15',
  'Plank 2×30s',
]

/**
 * Build the strength detail string. Tapers get a lighter, maintenance-only
 * routine to preserve neuromuscular connections without creating fatigue.
 * Substitutes a bodyweight-only variant when the athlete didn't select gym
 * access in onboarding — same movement pattern, no loaded equipment.
 */
export function buildStrengthDetail(
  opts: ExtraDaysOptions,
  config?: OnboardingConfig,
): string {
  const hasGym = !!config?.equipmentAccess?.includes('gym')
  const routine = opts.isTaper
    ? (hasGym ? TAPER_STRENGTH_ROUTINE : TAPER_BODYWEIGHT_ROUTINE)
    : (hasGym ? BASE_STRENGTH_ROUTINE : BASE_BODYWEIGHT_ROUTINE)
  return routine.join(' · ')
}

/**
 * Build a cross-training detail string for the chosen modality. Picks the
 * first modality the user selected (the modalities list is multi-select so
 * the first is a reasonable default; the user can re-order in onboarding).
 */
export function buildCrossDetail(
  mode: CrossTrainingMode,
  opts: ExtraDaysOptions,
): { workout: string; detail: string; time: string; zone: string } {
  const label = CROSS_MODE_LABEL[mode]
  const baseMin = CROSS_MODE_DEFAULT_DURATION[mode]
  const min = opts.isTaper ? Math.max(20, Math.round(baseMin * 0.6)) : baseMin
  const max = opts.isTaper ? Math.max(30, Math.round(baseMin * 0.8)) : Math.round(baseMin * 1.3)

  // Per-modality detail items — these double as drill-style checkoffs in the
  // ManualLog modal (parseDrillItems for cross days returns every `·`-item).
  const items: Record<CrossTrainingMode, string[]> = {
    cycling: [
      `${min} min easy spin · Z1-2`,
      'Cadence 85-95 rpm, low resistance',
      'Foam roll 5 min after',
    ],
    swimming: [
      `${min} min continuous swim · easy effort`,
      'Mix freestyle and kick sets',
      'Focus on long, relaxed strokes',
    ],
    rowing: [
      `${min} min steady erg · Z2`,
      'Drive with legs, finish with arms',
      'Stretch hip flexors 2 min/side after',
    ],
    hiking: [
      `${min}-${max} min uphill hike · steady Z2`,
      'Use poles if available — plant rhythm',
      'Power-hike posture: hands on thighs on steep bits',
    ],
    yoga: [
      `${min} min flow or restorative session`,
      'Focus on hips, hamstrings, calves',
      'Pigeon, runner\'s lunge, downward dog',
    ],
  }
  return {
    workout: `Cross-train · ${label}`,
    detail: items[mode].join(' · '),
    time: `${min}-${max} min`,
    zone: opts.isTaper ? 'Z1' : 'Z1-2',
  }
}

/**
 * Pick the Nth cross-training modality, rotating through the user's
 * selections so a 2x/week schedule gets two different modalities rather
 * than repeating the same one. Method-approved modalities are preferred
 * (first), then the rest of the user's list as fallback. Returns null
 * when nothing fits.
 */
export function pickCrossModeAt(
  index: number,
  config: OnboardingConfig,
  method: TrainingMethod,
): CrossTrainingMode | null {
  const list = config.crossTrainingModes
  if (!list || list.length === 0) return null
  const approved = new Set(method.crossTrainingRecommendation.approvedModalities)
  const ordered = [
    ...list.filter(m => approved.has(m)),
    ...list.filter(m => !approved.has(m)),
  ]
  return ordered[index % ordered.length]
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
  caps?: ExtraDaysCaps,
): PlannedDay[] {
  // Cross-training frequency: prefer the explicit per-week count when set;
  // fall back to the legacy "1 if any modalities selected" behavior so
  // existing configs (and seed fixtures) keep working without re-onboarding.
  const explicitCrossDays = config.crossTrainingDaysPerWeek
  const legacyCrossDays = (config.crossTrainingModes && config.crossTrainingModes.length > 0) ? 1 : 0
  const wantCrossDays = explicitCrossDays != null ? explicitCrossDays : legacyCrossDays
  const wantStrength = (config.strengthDaysPerWeek ?? 0) > 0
  if (wantCrossDays === 0 && !wantStrength) return days

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
  // Total cap on injected days. Allowed to be 0 (no injection).
  const maxExtras = caps?.maxExtras ?? Number.POSITIVE_INFINITY
  let injected = 0

  // Drop to 1 cross-training day during taper regardless of user preference
  // — the taper's whole purpose is reducing total load.
  const crossTarget = weekMileage.isTaper
    ? Math.min(1, wantCrossDays)
    : wantCrossDays

  let crossPlaced = 0
  while (crossPlaced < crossTarget && cursor < restIndices.length && injected < maxExtras) {
    const mode = pickCrossModeAt(crossPlaced, config, method)
    if (!mode) break
    const idx = restIndices[cursor++]
    const c = buildCrossDetail(mode, opts)
    next[idx] = {
      ...next[idx],
      type: 'cross',
      workout: c.workout,
      detail: c.detail,
      zone: c.zone,
      time: c.time,
      route: '',
    }
    crossPlaced += 1
    injected += 1
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
    while (placed < target && cursor < restIndices.length && injected < maxExtras) {
      const idx = restIndices[cursor++]
      next[idx] = {
        ...next[idx],
        type: 'strength',
        workout: 'Strength',
        detail: buildStrengthDetail(opts, config),
        zone: 'Z1',
        time: opts.isTaper ? '30 min' : '45-60 min',
        route: '',
      }
      placed += 1
      injected += 1
    }
  }

  return next
}
