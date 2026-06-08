// General Fitness — goal presets and weekly pillar templates.
//
// The General Fitness path runs ONE 4-pillar engine (aerobic Zone 2 · VO2max
// intervals · strength · mobility). A goal preset re-weights those pillars by
// choosing how the week's training days are allocated across them. Grounded in
// docs/research/General_Fitness_Training_Evidence_Foundation_v1.1 — see
// docs/GENERAL_FITNESS_ENGINE_DESIGN.md §5 (preset dials).
//
// Verification status of the underlying evidence: Stay Healthy + Lose Fat are
// adversarially verified; Build Muscle + Build Endurance are extracted from
// primary meta-analyses, pending verification (shipped per the design decision).

import type { GeneralGoal, ExperienceLevel } from '../../hooks/useOnboarding'

/** A single training day's pillar role. Mobility is embedded in every session's
 *  warm-up rather than being its own day. */
export type PillarRole = 'strength' | 'zone2' | 'vo2max' | 'long' | 'cross'

export interface GoalPreset {
  id: GeneralGoal
  label: string
  /** One-line emphasis shown in the plan's weekly focus. */
  emphasis: string
  /** Strength dosing for this goal (sets/reps text surfaced in coaching prose). */
  strengthSets: string
  strengthReps: string
  /** Numeric dosing for the concrete per-exercise list (sets × rep target).
   *  Kept separate from the prose above because `strengthReps` carries caveats
   *  ("1–3 reps in reserve", "heavy, for economy") that can't go in a `3×10`
   *  cell. Time-based moves (carries, planks) ignore the rep target. */
  strengthSetsN: number
  strengthRepTarget: number
  /** Aerobic volume bias — scales Zone-2 / long-session minutes. */
  cardioBias: 'low' | 'normal' | 'high'
  /** Goal-specific coaching note appended to the weekly focus. */
  note: string
}

export const GOAL_PRESETS: Record<GeneralGoal, GoalPreset> = {
  stay_healthy: {
    id: 'stay_healthy',
    label: 'Stay Healthy & Fit',
    emphasis: 'Balanced cardio, strength, and mobility',
    strengthSets: '2–3 sets',
    strengthReps: '8–12 reps',
    strengthSetsN: 3,
    strengthRepTarget: 10,
    cardioBias: 'normal',
    note: 'Hit the health floor: 150+ min cardio and 2 strength days a week.',
  },
  lose_fat: {
    id: 'lose_fat',
    label: 'Lose Fat',
    emphasis: 'Cardio volume up, strength to spare lean mass',
    strengthSets: '3 sets',
    strengthReps: '8–12 reps',
    strengthSetsN: 3,
    strengthRepTarget: 10,
    cardioBias: 'high',
    note: 'Diet drives the deficit — training preserves muscle. Keep ~8,500 steps/day.',
  },
  build_muscle: {
    id: 'build_muscle',
    label: 'Build Muscle',
    emphasis: 'Strength-focused, higher lifting volume',
    strengthSets: '3–4 sets',
    strengthReps: '6–12 reps, 1–3 reps in reserve',
    strengthSetsN: 4,
    strengthRepTarget: 10,
    cardioBias: 'low',
    note: 'Train each muscle ~2×/week; cardio kept light so it doesn’t blunt gains.',
  },
  build_endurance: {
    id: 'build_endurance',
    label: 'Build Endurance',
    emphasis: 'Aerobic volume and intervals, strength to support',
    strengthSets: '3–4 sets',
    strengthReps: '4–6 reps (heavy, for economy)',
    strengthSetsN: 3,
    strengthRepTarget: 6,
    cardioBias: 'high',
    note: 'Most volume easy (~80/20). One weekly threshold/interval accent.',
  },
}

// Explicit weekly pillar templates per (goal × training-days/week), like the
// Hyrox generator's rolesByDays. Authored rather than computed so the weekly
// shape per goal is reviewable at a glance. Each array length == days/week; the
// remaining 7 - N calendar days are rest. One 'long' per week anchors to the
// athlete's preferred long day. Strength floor honors the ≥2 days/week health
// guideline for every goal except Build Endurance (research: strength held near
// the floor, 1–2×/week, for running/cycling economy).
const TEMPLATES: Record<GeneralGoal, Record<3 | 4 | 5 | 6, PillarRole[]>> = {
  stay_healthy: {
    3: ['strength', 'long', 'strength'],
    4: ['strength', 'zone2', 'vo2max', 'strength'],
    5: ['strength', 'zone2', 'vo2max', 'strength', 'long'],
    6: ['strength', 'zone2', 'vo2max', 'strength', 'long', 'zone2'],
  },
  lose_fat: {
    3: ['strength', 'vo2max', 'strength'],
    4: ['strength', 'vo2max', 'zone2', 'strength'],
    5: ['strength', 'vo2max', 'zone2', 'strength', 'long'],
    6: ['strength', 'vo2max', 'zone2', 'strength', 'vo2max', 'long'],
  },
  build_muscle: {
    3: ['strength', 'strength', 'zone2'],
    4: ['strength', 'strength', 'zone2', 'strength'],
    5: ['strength', 'strength', 'zone2', 'strength', 'strength'],
    6: ['strength', 'strength', 'zone2', 'strength', 'strength', 'vo2max'],
  },
  build_endurance: {
    3: ['vo2max', 'strength', 'long'],
    4: ['zone2', 'vo2max', 'strength', 'long'],
    5: ['zone2', 'vo2max', 'zone2', 'strength', 'long'],
    6: ['zone2', 'vo2max', 'zone2', 'strength', 'long', 'strength'],
  },
}

/** The ordered pillar roles for a week, given the goal and training days/week.
 *  Days/week is clamped to the supported 3–6 range. */
export function weeklyRoles(goal: GeneralGoal, daysPerWeek: number): PillarRole[] {
  const days = Math.min(6, Math.max(3, daysPerWeek)) as 3 | 4 | 5 | 6
  return TEMPLATES[goal][days]
}

/** Per-experience scaling for session minutes and the strength prescription
 *  caveat. Newer trainees get shorter sessions and a simpler loading cue. */
export interface ExperienceScale {
  /** Multiplier on base cardio/strength minutes. */
  durationFactor: number
  /** Loading guidance appended to strength detail. */
  loadingCue: string
}

export function experienceScale(level: ExperienceLevel): ExperienceScale {
  switch (level) {
    case 'first_timer':
    case 'beginner':
      return { durationFactor: 0.8, loadingCue: 'Leave 2–3 reps in reserve; add load only once form is clean.' }
    case 'intermediate':
      return { durationFactor: 1.0, loadingCue: 'Progress load when you can complete all sets at the top of the rep range.' }
    case 'advanced':
    case 'elite':
      return { durationFactor: 1.1, loadingCue: 'Autoregulate by RPE; push close to failure on the last set.' }
  }
}
