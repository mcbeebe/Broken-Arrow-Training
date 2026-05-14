/**
 * Outdoor → indoor workout equivalency map.
 *
 * When the weather forecast crosses the SWAP threshold (lightning,
 * extreme heat, heavy snow), the coach proposes an indoor alternative
 * that preserves the training stimulus. This module is the
 * single-source-of-truth that both the system prompt (via the
 * APP_KNOWLEDGE indoor-swap doctrine) and any future client-side
 * suggestion UI agree on.
 *
 * The shape mirrors a Coach proposal so the LLM can quote it directly
 * back into a proposal block.
 */

import type { WorkoutType } from '../types'

export interface IndoorSwapSuggestion {
  /** Workout type the swap should use. */
  type: WorkoutType
  /** Human-readable workout title for the swap. */
  workout: string
  /** Detail string — uses the same `Exercise · Exercise · …` format the
   *  existing WorkoutModal exercise parser expects. */
  detail: string
  /** Zone hint preserved from the outdoor session when relevant. */
  zone?: string
  /** Rationale clause the coach can incorporate verbatim into the
   *  proposal block's `rationale`. */
  rationale: string
}

/** Lookup an indoor equivalent for a planned outdoor workout. Returns
 *  null when no swap is applicable (rest / travel / strength stay as-is). */
export function suggestIndoorSwap(
  type: WorkoutType,
): IndoorSwapSuggestion | null {
  switch (type) {
    case 'long':
      return {
        type: 'cross',
        workout: 'Treadmill long run (indoor)',
        detail: 'Treadmill 60-90 min @ Z2 · Manual incline 1-3% to mimic trail cost · Foam roll 10 min',
        zone: 'Z2 (aerobic)',
        rationale: 'Severe outdoor weather forecast — keep the aerobic stimulus and time-on-feet by moving to treadmill.',
      }
    case 'run':
      return {
        type: 'cross',
        workout: 'Indoor easy session',
        detail: 'Elliptical or treadmill 40-50 min @ Z1-2 · Mobility 10 min',
        zone: 'Z1-2 (easy)',
        rationale: 'Severe outdoor weather forecast — preserve easy aerobic time without exposure.',
      }
    case 'quality':
      return {
        type: 'cross',
        workout: 'Treadmill intervals (indoor quality)',
        detail: 'Treadmill 5×3min @ Z4 effort w/ 2min jog recovery · WU 15min · CD 10min · Foam roll 10 min',
        zone: 'Z3-4 (intervals)',
        rationale: 'Severe outdoor weather forecast — keep the VO2 stimulus on the treadmill where pace control is consistent.',
      }
    case 'race':
      return {
        type: 'cross',
        workout: 'Pre-race shakeout (indoor)',
        detail: 'Treadmill or bike 25-30 min easy · Strides 4×20s · Mobility 10 min',
        zone: 'Z1 (recovery)',
        rationale: 'Severe outdoor weather forecast — protect the race; swap to short indoor shakeout.',
      }
    case 'cross':
      // Already indoor-friendly; suggest a default indoor alternative
      // (some cross-trains may be outdoors like trail hiking).
      return {
        type: 'cross',
        workout: 'Indoor cross-train',
        detail: 'Stationary bike or rower 45-60 min @ Z1-2 · Core 10 min',
        zone: 'Z1-2',
        rationale: 'Severe outdoor weather forecast — keep the volume indoors.',
      }
    case 'strength':
    case 'rest':
    case 'limited':
    case 'travel':
      // No outdoor exposure → no swap needed.
      return null
    default:
      return null
  }
}
