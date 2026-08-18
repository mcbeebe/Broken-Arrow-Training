/**
 * Plan-generator engine types — outputs are designed to ride alongside the
 * existing TrainingPlan / PlannedDay shape (no breaking changes), so the
 * existing UI keeps working and the structured PlannedWorkout can be
 * adopted incrementally.
 */
import type {
  CanonicalPaceZone,
  WorkoutCategory,
  DurationValue,
  DistanceValue,
  RecoveryType,
  AnchorType,
} from '../../types/training-method'

export type PaceTargetMode = 'hr' | 'pace' | 'rpe'

/**
 * Resolved targets for one canonical pace zone, personalized to the user.
 * At least one of (hr, pace, rpe) ranges is always populated; `preferredMode`
 * tells the UI which one is the strongest signal to display.
 */
export interface PaceTarget {
  zone: CanonicalPaceZone
  displayName: string
  abbreviation?: string
  hrBpmLow?: number
  hrBpmHigh?: number
  paceSecPerMileLow?: number
  paceSecPerMileHigh?: number
  rpeLow?: number
  rpeHigh?: number
  preferredMode: PaceTargetMode
  cue?: string
}

export interface AnchorState {
  /** The method's primary anchor type (lthr_bpm, vdot, etc.). */
  type: AnchorType
  /** Resolved numeric value when computable (e.g., estimated LTHR in bpm),
   * null when only descriptive RPE targets are available. */
  value: number | null
  /** Short note explaining how the anchor was derived — surfaced in UI tooltips. */
  sourceNote: string
}

export interface ResolvedPaces {
  byZone: Partial<Record<CanonicalPaceZone, PaceTarget>>
  anchor: AnchorState
}

export interface PlannedRecovery {
  type: RecoveryType
  duration?: DurationValue
  distance?: DistanceValue
}

export interface PlannedSegment {
  role: 'warmup' | 'main' | 'cooldown'
  description: string
  duration?: DurationValue
  distance?: DistanceValue
  paceZone?: CanonicalPaceZone
  paceTarget?: PaceTarget
  reps?: number
  recovery?: PlannedRecovery
  cue?: string
}

/**
 * Personalized workout — produced from a method's Workout template + the
 * user's resolved pace targets. Attached to a PlannedDay via
 * `plannedDay.plannedWorkout`.
 */
export interface PlannedWorkout {
  workoutId: string
  methodId: string
  name: string
  displayName?: string
  category: WorkoutCategory
  primaryZone: CanonicalPaceZone
  segments: PlannedSegment[]
  approxDurationMinutes: { min: number; max: number }
  approxDistanceMiles?: { min: number; max: number }
  purpose: string
  cues: string[]
  /** Engine-attached notes — e.g., "Substituted for X: below minimum experience". */
  notes?: string
}

/** Mileage figures (in miles) for one training week. */
export interface WeekMileage {
  weekIndex: number       // 0-based, 0 = first week of the plan
  weekNumber: number      // 1-based — what the UI shows
  /** Phase 2 (102-F2) — this week's secondary-long sizing factor, set when
   *  a multi-long week must shrink its extra long day(s) to keep the
   *  combined long-category share ≤65% of the week. Defaults to the
   *  standard B2B factor when absent. */
  secondaryLongFactor?: number
  totalMi: number
  longRunMi: number
  isCutback: boolean
  isTaper: boolean
  phaseId: string
}

/** One block of weeks belonging to a single phase. */
export interface PhaseBlock {
  phaseId: string
  startWeekIndex: number  // inclusive
  endWeekIndex: number    // inclusive
}
