/**
 * The platform-neutral structured-workout intermediate (locked decision
 * D5, docs/gap-closure-build-plan.md §1): ONE step model that every watch
 * platform renders from. Garmin renders it today (garminWorkout.ts maps
 * these types 1:1 — they are aliases, so payloads are bit-identical to
 * the pre-refactor ones); Apple WorkoutKit composes `CustomWorkout` from
 * the same shapes when the iOS target lands (external gates: iOS 17+,
 * macOS build, TestFlight review). A third platform is a renderer, not a
 * rewrite.
 *
 * Vocabulary:
 *  - sport buckets: run-family gets full structured fidelity; strength
 *    and cross degrade to timed steps on platforms that can't do reps;
 *  - end conditions: `time` (seconds) · `distance` (meters) ·
 *    `lap.button` (until the athlete presses lap);
 *  - targets: `pace` (sec/meter low/high) · `heart.rate` (bpm low/high)
 *    · `open` (free effort);
 *  - repeat groups: `count` rounds of nested steps.
 */

export type StructuredSport = 'running' | 'cycling' | 'strength' | 'cardio'

export type StructuredStepType = 'warmup' | 'interval' | 'recovery' | 'cooldown'

export type StructuredEndConditionType = 'time' | 'distance' | 'lap.button'

export type StructuredTargetType = 'pace' | 'heart.rate' | 'open'

export interface StructuredEndCondition {
  type: StructuredEndConditionType
  value?: number
}

export interface StructuredTarget {
  type: StructuredTargetType
  low?: number
  high?: number
}

export interface StructuredStep {
  stepType: StructuredStepType
  endCondition: StructuredEndCondition
  target: StructuredTarget
  description?: string
  /** When present, this step is a repeat group: `count` rounds of `steps`. */
  repeat?: { count: number; steps: StructuredStep[] }
}

export interface StructuredWorkout {
  name: string
  sport: StructuredSport
  /** ISO date (YYYY-MM-DD) to schedule the workout on. */
  scheduleDate?: string
  estimatedDurationSecs?: number
  steps: StructuredStep[]
}
