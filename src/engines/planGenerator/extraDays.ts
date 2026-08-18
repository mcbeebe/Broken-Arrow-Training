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
import { menopauseStrengthCue } from '../../utils/menopause'

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

export const CROSS_MODE_LABEL: Record<CrossTrainingMode, string> = {
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

// Routines the modal's parseRoutine() can read directly — each ` · `-
// separated item resolves to a guide entry in src/utils/exercises.ts.
//
// R1 — the routine now MATCHES the phase emphasis (audit finding C1: the
// header said "heavy maximal strength (4–6 reps, build toward a 4–5RM)"
// over a fixed 3×10-12 list, for every athlete including a 79-year-old
// novice). Schemes are selected by phase × strengthExperience × age; RM
// language is gone everywhere — load cues are reps-in-reserve (NSCA
// older-adult position stand, Fragala 2019; see
// engines/running/heuristics.ts STRENGTH_SCHEME_POLICY).

/** Technique-first foundation — novices of any age, and the safe default. */
const FOUNDATION_ROUTINE = [
  'Goblet Squat 3×12',
  'Bulgarian Split Squat 3×10/leg',
  'RDL 3×10',
  'Step-Up 3×10/leg',
  'Calf Raise 3×15',
  'Plank 3×45s',
  'Dead Bug 3×10/side',
]

/** Heavy strength (base phase, trained lifters): low reps, 2 in reserve. */
const HEAVY_ROUTINE = [
  'Goblet Squat 4×5',
  'RDL 4×5',
  'Bulgarian Split Squat 3×6/leg',
  'Calf Raise 3×10',
  'Plank 3×45s',
  'Dead Bug 3×10/side',
]

/** Strength-to-power transition: moderate loads, intent on the concentric. */
const TRANSITION_ROUTINE = [
  'Goblet Squat 3×8 — drive up fast',
  'RDL 3×8',
  'Step-Up 3×8/leg — explosive up',
  'Calf Raise 3×12',
  'Plank 3×45s',
  'Dead Bug 3×10/side',
]

/** Explosive power (peak/race prep): the exercises the old header promised
 *  but the list never contained. Light and fast, full recovery. */
const POWER_ROUTINE = [
  'Box Jump 3×5',
  'Jump Squat 3×6',
  'Med-Ball Slam 3×8',
  'Single-Leg Hop 2×6/leg',
  'Calf Raise 3×12',
  'Plank 3×45s',
]

/** Masters (70+): controlled tempo, balance, zero maximal loading. */
const MASTERS_ROUTINE = [
  'Sit-to-Stand Squat 2×8 — 3s lowering, controlled',
  'Step-Up 2×8/leg',
  'RDL 2×8 — light, own the hinge',
  'Calf Raise 2×12',
  'Single-Leg Balance 2×30s/side',
  'Plank 2×30s',
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
const FOUNDATION_BODYWEIGHT_ROUTINE = [
  'Bodyweight Squat 3×20',
  'Bulgarian Split Squat 3×10/leg',
  'Single-Leg Glute Bridge 3×12/leg',
  'Step-Up 3×10/leg',
  'Calf Raise 3×20',
  'Plank 3×45s',
  'Dead Bug 3×10/side',
]

/** Bodyweight heavy-analog: slow eccentrics + single-leg load. */
const HEAVY_BODYWEIGHT_ROUTINE = [
  'Bodyweight Squat 3×10 — 4s lowering',
  'Bulgarian Split Squat 3×8/leg — 3s lowering',
  'Single-Leg Glute Bridge 3×10/leg',
  'Calf Raise 3×12 — slow',
  'Plank 3×45s',
  'Dead Bug 3×10/side',
]

/** Bodyweight power variant. */
const POWER_BODYWEIGHT_ROUTINE = [
  'Jump Squat 3×6',
  'Pogo Hops 2×15',
  'Single-Leg Hop 2×6/leg',
  'Calf Raise 3×15',
  'Plank 3×45s',
]

/** Bodyweight masters variant (70+). */
const MASTERS_BODYWEIGHT_ROUTINE = [
  'Sit-to-Stand Squat 2×10 — 3s lowering',
  'Step-Up 2×8/leg',
  'Single-Leg Glute Bridge 2×10/leg',
  'Calf Raise 2×15',
  'Single-Leg Balance 2×30s/side',
  'Plank 2×30s',
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
/**
 * R8 — strength periodization emphasis by training phase: heavy maximal strength
 * in the base / off-season, an explosive-power emphasis as the race nears, and a
 * strength-to-power transition in between. Taper is maintenance-only. Matches the
 * fact-checked iRunFar/CSCS model (heavy → power → drop race week).
 */
type StrengthPhase = 'heavy' | 'transition' | 'power' | 'taper'

function strengthPhaseFor(phaseId: string, isTaper: boolean): StrengthPhase {
  if (isTaper) return 'taper'
  const id = phaseId.toLowerCase()
  if (/base|foundation|general|off.?season/.test(id)) return 'heavy'
  if (/peak|sharp|final|race|specific|special/.test(id)) return 'power'
  return 'transition'
}

/** Athlete tier for scheme selection. Seniors (70+) never load maximally
 *  (NSCA older-adult guidance); novices train technique-first at any age;
 *  'recreational' lifters get the moderate scheme where 'experienced' get
 *  the heavy one. */
function strengthTierFor(config?: OnboardingConfig): 'senior' | 'new' | 'recreational' | 'experienced' {
  if (config?.age != null && config.age >= 70) return 'senior'
  const exp = config?.strengthExperience
  if (exp === 'experienced') return 'experienced'
  if (exp === 'recreational') return 'recreational'
  return 'new'
}

/**
 * R8/R1 — phase emphasis, now guaranteed to describe the routine that
 * follows it. No RM language anywhere: load cues are reps-in-reserve.
 */
export function strengthPhaseEmphasis(
  phaseId: string,
  isTaper: boolean,
  config?: OnboardingConfig,
): string {
  const phase = strengthPhaseFor(phaseId, isTaper)
  const tier = strengthTierFor(config)
  if (phase === 'taper') return 'maintenance only — keep it light and sharp'
  if (tier === 'senior') {
    return 'masters strength — controlled tempo and balance; no maximal loading, stop 3+ reps short of failure'
  }
  if (tier === 'new') {
    return 'technique first — controlled reps, effort easy enough to keep every rep identical (RPE ≤6); add load only when form is boring'
  }
  if (phase === 'heavy') {
    return 'heavy strength (4–6 reps) — leave 2 reps in reserve, never grind'
  }
  if (phase === 'power') {
    return 'explosive power (jumps, med-ball, light & fast) — full recovery between sets; drop the heavy loads'
  }
  return 'strength-to-power transition (moderate loads, move the concentric with intent)'
}

/** The routine that matches the emphasis, per tier × phase × equipment. */
function strengthRoutineFor(phase: StrengthPhase, tier: ReturnType<typeof strengthTierFor>, hasGym: boolean): string[] {
  if (phase === 'taper') return hasGym ? TAPER_STRENGTH_ROUTINE : TAPER_BODYWEIGHT_ROUTINE
  if (tier === 'senior') return hasGym ? MASTERS_ROUTINE : MASTERS_BODYWEIGHT_ROUTINE
  if (tier === 'new') return hasGym ? FOUNDATION_ROUTINE : FOUNDATION_BODYWEIGHT_ROUTINE
  if (phase === 'power') return hasGym ? POWER_ROUTINE : POWER_BODYWEIGHT_ROUTINE
  if (phase === 'heavy') {
    if (tier === 'recreational') return hasGym ? TRANSITION_ROUTINE : HEAVY_BODYWEIGHT_ROUTINE
    return hasGym ? HEAVY_ROUTINE : HEAVY_BODYWEIGHT_ROUTINE
  }
  return hasGym ? TRANSITION_ROUTINE : FOUNDATION_BODYWEIGHT_ROUTINE
}

export function buildStrengthDetail(
  opts: ExtraDaysOptions,
  config?: OnboardingConfig,
): string {
  const hasGym = !!config?.equipmentAccess?.includes('gym')
  const phase = strengthPhaseFor(opts.phaseId, opts.isTaper)
  const tier = strengthTierFor(config)
  const routine = strengthRoutineFor(phase, tier, hasGym)
  // Emphasis leads the routine — and now actually describes it (R1).
  const emphasis = opts.isTaper ? [] : [`Emphasis: ${strengthPhaseEmphasis(opts.phaseId, false, config)}`]
  // Midlife (peri/menopause/postmenopause): append a heavy bone-loading
  // finisher to the standard routine — bone is the priority as estrogen drops.
  // Skipped on taper (maintenance only). Premenopause/none keep the base.
  const boneCue = opts.isTaper ? null : menopauseStrengthCue(config)
  const finisher = boneCue ? (hasGym ? boneCue.gymFinisher : boneCue.bodyweightFinisher) : []
  return [...emphasis, ...routine, ...finisher].join(' · ')
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

  // Strength target, computed up front so scarce-budget weeks can decide
  // placement order between both kinds.
  let strengthTarget = 0
  if (wantStrength) {
    const want = config.strengthDaysPerWeek ?? 0
    const bounds = method.strengthRecommendation.daysPerWeek
    const capped = Math.min(want, bounds.max)
    const taperPhaseId = (phase && phase.mileageBehavior === 'taper') ? phase.id : null
    const isTaperPhase = !!taperPhaseId && weekMileage.phaseId === taperPhaseId
    // Drop to 1 day during taper regardless of user pref — strength is
    // maintenance-only this phase per every method's philosophy.
    strengthTarget = isTaperPhase || weekMileage.isTaper ? Math.min(1, capped) : capped
  }

  const placeCross = () => {
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
  }

  const placeStrength = () => {
    let placed = 0
    while (placed < strengthTarget && cursor < restIndices.length && injected < maxExtras) {
      const idx = restIndices[cursor++]
      const boneFocus = !opts.isTaper && !!menopauseStrengthCue(config)
      next[idx] = {
        ...next[idx],
        type: 'strength',
        workout: boneFocus ? 'Strength + bone' : 'Strength',
        detail: buildStrengthDetail(opts, config),
        zone: 'Z1',
        time: opts.isTaper ? '30 min' : '45-60 min',
        route: '',
      }
      placed += 1
      injected += 1
    }
  }

  // When the athlete's total-day budget can't fit every requested extra,
  // whichever kind places first wins the scarce slot. Alternate the order
  // by week so both kinds still show up across the plan — a 5-day athlete
  // with strength + cycling selected sees cycling every other week instead
  // of never. Odd weeks keep the legacy cross-first order.
  const scarce = maxExtras < crossTarget + strengthTarget && crossTarget > 0 && strengthTarget > 0
  if (scarce && weekMileage.weekNumber % 2 === 0) {
    placeStrength()
    placeCross()
  } else {
    placeCross()
    placeStrength()
  }

  return next
}
