/**
 * The onboarding config an uploaded plan is saved as (initiative 004, PR 5).
 *
 * The athlete's current config is the base: who they are, their heart rate,
 * health answers and gear still describe them, and the screens they have
 * already seen stay seen. What described the *old* plan is cleared: its race
 * distance, vert and goal time would label an uploaded 10K "Marathon", and its
 * method and reshapes belong to a plan that no longer exists.
 *
 * `IMPORT_FIELD_RULES` names a rule for every field of `OnboardingConfig`, so
 * a field added later fails the type check until someone decides what an
 * upload does with it.
 */

import type { OnboardingConfig } from '../../hooks/useOnboarding'
import { addDays, daysBetween, mondayOnOrBefore } from '../planDates'
import type { ImportedPlanV1 } from './types'

export type FieldRule = 'keep' | 'clear' | 'set'

export const IMPORT_FIELD_RULES: Record<keyof OnboardingConfig, FieldRule> = {
  // ── Set from the review screen and the plan ──
  raceType: 'set',
  raceName: 'set',
  raceDate: 'set',
  planStartPinnedIso: 'set',
  importedPlan: 'set',
  // ── The old plan's race and method: wrong for the uploaded plan ──
  raceDistance: 'clear',
  raceDistanceMiles: 'clear',
  elevationGainFt: 'clear',
  raceDescription: 'clear',
  athleteGoal: 'clear',
  goalRaceTimeSeconds: 'clear',
  selectedMethodId: 'clear',
  weekReshapes: 'clear',
  planStartDate: 'clear',
  // ── The athlete: unchanged by which plan they follow ──
  athleteName: 'keep',
  age: 'keep',
  sex: 'keep',
  maxHR: 'keep',
  ftpWatts: 'keep',
  fitnessAnchor: 'keep',
  testedLthrBpm: 'keep',
  currentWeeklyMileage: 'keep',
  experienceLevel: 'keep',
  wearable: 'keep',
  injuryStatus: 'keep',
  injuryArea: 'keep',
  injuryTimeframe: 'keep',
  injuryNote: 'keep',
  menopauseStatus: 'keep',
  menopauseSymptoms: 'keep',
  menopauseNote: 'keep',
  healthScreen: 'keep',
  typicalTrainingTempF: 'keep',
  detailLevel: 'keep',
  strengthExperience: 'keep',
  equipmentAccess: 'keep',
  strengthDaysPerWeek: 'keep',
  crossTrainingModes: 'keep',
  crossTrainingDaysPerWeek: 'keep',
  preferredTrainingTimes: 'keep',
  scheduleConstraintsNote: 'keep',
  // Read only by generated plans (all gated off on an uploaded one); kept
  // so a later redo starts from the athlete's own answers.
  trainingDaysPerWeek: 'keep',
  longRunDay: 'keep',
  weekShape: 'keep',
  weakStation: 'keep',
  hyroxDivision: 'keep',
  skiErg1kSeconds: 'keep',
  row1kSeconds: 'keep',
  generalGoal: 'keep',
  cardioModality: 'keep',
  // The season: off for an uploaded plan and kept as it is. App.tsx doesn't
  // re-seed the calendar while the plan is uploaded, and a restore writes
  // back the calendar its backup holds.
  goalMode: 'keep',
  raceKinds: 'keep',
  anchorIsPrimary: 'keep',
  additionalRaces: 'keep',
  // Screens already seen stay seen; `save()` stamps completedAt.
  completedAt: 'keep',
  primerSeenAt: 'keep',
  zonesPrimerSeenAt: 'keep',
  connectStepSeenAt: 'keep',
  valuePropsSeenAt: 'keep',
  welcomeLetterSeenAt: 'keep',
}

/** What the athlete confirmed on the review screen. */
export interface ImportChoices {
  /** Any date in week 1; snapped to its Monday. */
  startIso: string
  /** '' when the plan has no race. */
  raceName: string
  /** ISO date, or '' when there is none. */
  raceDate: string
}

/**
 * The config to save for an uploaded plan, built from the athlete's current
 * one by `IMPORT_FIELD_RULES`.
 */
export function buildImportedConfig(
  base: OnboardingConfig,
  plan: ImportedPlanV1,
  choices: ImportChoices,
): OnboardingConfig {
  const next: Partial<OnboardingConfig> = { ...base }
  for (const [field, rule] of Object.entries(IMPORT_FIELD_RULES) as [keyof OnboardingConfig, FieldRule][]) {
    if (rule === 'clear') delete next[field]
  }
  return {
    ...(next as OnboardingConfig),
    raceType: plan.sport,
    raceName: choices.raceName.trim(),
    raceDate: /^\d{4}-\d{2}-\d{2}$/.test(choices.raceDate) ? choices.raceDate : '',
    planStartPinnedIso: mondayOnOrBefore(choices.startIso),
    importedPlan: plan,
  }
}

/**
 * Week 1's Monday when the athlete says they are already on week `n`:
 * this week is week `n`. `n` is clamped to the plan's length.
 */
export function startForWeek(n: number, weekCount: number, todayIso: string): string {
  const week = Math.min(Math.max(1, Math.round(n) || 1), Math.max(1, weekCount))
  return addDays(mondayOnOrBefore(todayIso), -7 * (week - 1))
}

/**
 * The start the review screen offers first:
 * 1. the start the plan printed, unless the plan would already be over;
 * 2. else, counted back from a race date the plan printed that is still
 *    ahead, so the race falls in the last week;
 * 3. else this week's Monday.
 * Dates come from the plan only, never from the athlete's old race.
 */
export function defaultStart(
  suggestions: { startDate?: string; raceDate?: string },
  weekCount: number,
  todayIso: string,
): string {
  const weeks = Math.max(1, weekCount)
  if (suggestions.startDate) {
    const start = mondayOnOrBefore(suggestions.startDate)
    if (addDays(start, weeks * 7 - 1) >= todayIso) return start
  }
  if (suggestions.raceDate && suggestions.raceDate >= todayIso) {
    return addDays(mondayOnOrBefore(suggestions.raceDate), -7 * (weeks - 1))
  }
  return mondayOnOrBefore(todayIso)
}

/**
 * Where a date falls in the plan: its week number, or whether it's before
 * the plan starts or after it ends. Strict, unlike `weekNumContaining`, which
 * clamps a date outside the plan to its first or last week.
 */
export function weekOfDate(
  iso: string,
  startIso: string,
  weekCount: number,
): { week: number } | 'before' | 'after' {
  const start = mondayOnOrBefore(startIso)
  const offset = daysBetween(start, iso)
  if (offset < 0) return 'before'
  const week = Math.floor(offset / 7) + 1
  return week > weekCount ? 'after' : { week }
}
