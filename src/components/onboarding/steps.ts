/**
 * The onboarding step registry: which steps exist, what order they run in,
 * which ones an athlete actually sees, and what each is called on the wire.
 *
 * Extracted from Onboarding.tsx, where the visibility rules were interleaved
 * with 2700 lines of panels and could only be exercised by driving the whole
 * flow through the DOM. They are pure functions of the answers so far, so they
 * are testable directly — and they need to be: every rule below is age-, sex-
 * or mode-gated, and getting one wrong shows a woman in her forties a step
 * that does not apply to her, or hides one that does.
 */

// Step indices. STEP_RACE_DISTANCE is retired — distance is captured on
// the race step itself (a separate screen re-asking what the race name
// already said was redundant). The constant stays so old ids never shift.
export const STEP_RACE_TYPE = 0
export const STEP_RACE_NAME = 1
export const STEP_EXPERIENCE = 3
export const STEP_DETAIL = 4
export const STEP_DAYS = 5
export const STEP_VARIANT = 6
export const STEP_BASELINE = 7
export const STEP_EQUIPMENT = 8
export const STEP_STRENGTH = 9
export const STEP_SCHEDULE = 10
export const STEP_WEARABLE = 11
export const STEP_PROFILE = 12
export const STEP_REVIEW = 13
// General-fitness goal step (raceType === 'general' only). Kept out of the 0-13
// range so existing step IDs are untouched; order comes from ALL_STEPS, and all
// navigation/progress is index-based (visibleSteps.indexOf), not value-based.
export const STEP_GENERAL_GOAL = 14
export const STEP_GENERAL_CARDIO = 15
// Menopause context step — age-gated (>=38). Kept out of the 0-13 range like the
// general-fitness steps; order comes from ALL_STEPS. Placed after PROFILE (where
// age is entered) so the age gate has a value to read.
export const STEP_MENOPAUSE = 16
// G3 — the belief-building moment: a real week-1 preview generated from the
// answers so far, shown BEFORE the schedule/equipment/profile questions so
// the athlete sees value before they finish investing.
export const STEP_PREVIEW = 17
// Season-first onboarding (user-directed): upfront choice between one goal
// race and a season of races, then the multi-race builder for season mode.
export const STEP_GOAL_MODE = 18
export const STEP_SEASON_RACES = 19
// UI PR B (PRD-109) — the optional health & energy-availability screen.
// Placed after the menopause step (same "personal, skippable" register);
// wording ships from the reviewed screeningCopy registry.
export const STEP_HEALTH = 20

/**
 * G3 ordering (goal-first, preview mid-flow, prefs last):
 *   1. goal block — race type/name/distance (or general goal) + experience;
 *   2. fitness anchor (BASELINE) pulled forward so the preview is personal;
 *   3. PREVIEW — the live week-1 render, before 50% of questions are asked;
 *   4. plan-shaping answers that refine it (days/variant/equipment/strength/
 *      schedule/profile/menopause);
 *   5. display prefs that change no plan output (detail level, wearable) sit
 *      last, just ahead of review.
 * The golden ground-truth harness proves identical answers ⇒ identical final
 * plan regardless of this ordering (generation reads the finished config).
 */
export const ALL_STEPS = [
  STEP_GOAL_MODE, // the very first question: one race, a season, or no race
  STEP_RACE_TYPE,
  STEP_RACE_NAME,
  STEP_SEASON_RACES,
  STEP_GENERAL_GOAL,
  STEP_GENERAL_CARDIO,
  STEP_EXPERIENCE,
  STEP_BASELINE,
  STEP_PREVIEW,
  STEP_DAYS,
  STEP_VARIANT,
  STEP_EQUIPMENT,
  STEP_STRENGTH,
  STEP_SCHEDULE,
  STEP_PROFILE,
  STEP_MENOPAUSE,
  STEP_HEALTH,
  STEP_DETAIL,
  STEP_WEARABLE,
  STEP_REVIEW,
] as const

/** Stable, human-readable names for telemetry.
 *
 *  The step constants are numbers, and a raw `17` in an analytics rollup is
 *  unreadable and would silently change meaning if the constants were ever
 *  renumbered. These names are the wire format — treat them as an external
 *  contract and do not rename one without accepting that its history splits
 *  in two. A step missing from this map reports as `step_<n>` rather than
 *  throwing, because instrumentation must never break the flow. */
export const STEP_NAMES: Readonly<Record<number, string>> = {
  [STEP_GOAL_MODE]: 'goal_mode',
  [STEP_RACE_TYPE]: 'race_type',
  [STEP_RACE_NAME]: 'race_name',
  [STEP_SEASON_RACES]: 'season_races',
  [STEP_GENERAL_GOAL]: 'general_goal',
  [STEP_GENERAL_CARDIO]: 'general_cardio',
  [STEP_EXPERIENCE]: 'experience',
  [STEP_BASELINE]: 'baseline',
  [STEP_PREVIEW]: 'preview',
  [STEP_DAYS]: 'days',
  [STEP_VARIANT]: 'variant',
  [STEP_EQUIPMENT]: 'equipment',
  [STEP_STRENGTH]: 'strength',
  [STEP_SCHEDULE]: 'schedule',
  [STEP_PROFILE]: 'profile',
  [STEP_MENOPAUSE]: 'menopause',
  [STEP_HEALTH]: 'health',
  [STEP_DETAIL]: 'detail',
  [STEP_WEARABLE]: 'wearable',
  [STEP_REVIEW]: 'review',
}

export function stepName(step: number): string {
  return STEP_NAMES[step] ?? `step_${step}`
}

/** Everything the visibility rules read. All of it is answers the athlete has
 *  already given, or state carried over from a previous plan. */
export interface StepVisibility {
  /** 'trail' | 'road' | 'hyrox' | 'general' — the general-goal steps mirror it. */
  raceType?: string | null
  /** 'race' | 'season' | 'general' — the goal-mode answer, always step 1. */
  goalMode?: string | null
  /** Raw age field from the profile step; unparseable reads as 0. */
  age?: string
  /** 'male' | 'female' | 'not_applicable' | 'prefer_not_to_say' | unset. */
  sex?: string | null
  /** An account holder redoing onboarding already told us who they are. */
  hasProfilePrefill?: boolean
  /** Experience level carried over from a previous config, if any. */
  previousExperienceLevel?: string | null
}

/**
 * The MENOPAUSE step's gate, called out because it is the subtlest one.
 *
 * Age-gated from 38, not 40: early perimenopause can begin in the late 30s,
 * so a 40-only gate missed it, and premenopausal women also benefit from
 * building bone ahead of the transition. It is also sex-gated — an explicit
 * 'male' answer skips it outright (it cannot apply), while 'female' / 'prefer
 * not to say' / unset keep the age default, since hiding it from someone who
 * declined to answer is the worse error. Anyone who still sees it can opt out
 * on the step itself, and the whole step is skippable.
 */
export function showsMenopauseStep(v: StepVisibility): boolean {
  return (parseInt(v.age ?? '') || 0) >= 38 && v.sex !== 'male'
}

/**
 * The steps this athlete actually sees, in flow order.
 *
 * Navigation and the progress bar are index-based (`visibleSteps.indexOf`),
 * never value-based, so a step dropping out here shifts nothing else.
 */
export function visibleSteps(v: StepVisibility): readonly number[] {
  // Race-distance step only shows for trail/road races (hyrox is a fixed format,
  // general fitness has no target distance). The general-goal step is the mirror
  // image — shown only for general fitness.
  const showsGoalStep = v.raceType === 'general'
  const menopause = showsMenopauseStep(v)
  return ALL_STEPS.filter(s => {
    if (s === STEP_GENERAL_GOAL) return showsGoalStep
    if (s === STEP_GENERAL_CARDIO) return showsGoalStep
    if (s === STEP_MENOPAUSE) return menopause
    // Account holders redoing onboarding never retype who they are.
    if (s === STEP_PROFILE) return !v.hasProfilePrefill
    // Experience carries over on a redo — confirmable on the baseline step.
    if (s === STEP_EXPERIENCE) return !v.previousExperienceLevel
    // Season-first: the goal-mode question is ALWAYS step 1. Choosing
    // general fitness there fixes raceType and skips the race-type step;
    // the multi-race builder shows only for a season.
    if (s === STEP_RACE_TYPE) return v.goalMode !== 'general'
    if (s === STEP_SEASON_RACES) return v.goalMode === 'season'
    return true
  })
}
