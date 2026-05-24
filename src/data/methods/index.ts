/**
 * Canonical list of all training methods, in registry order.
 * Import this when you need the full library (e.g., for method selection
 * or rendering a method browser).
 */
import danielsMethod from './daniels.json'
import pfitzingerMethod from './pfitzinger.json'
import hansonsMethod from './hansons.json'
import higdonMethod from './higdon.json'
import gallowayMethod from './galloway.json'
import fitzgeraldMethod from './fitzgerald_8020.json'
import koopMethod from './koop.json'
import rocheMethod from './roche_swap.json'
import trainingPeaksMethod from './trainingpeaks.json'

import type { TrainingMethod } from '../../types/training-method'

export const ALL_METHODS: readonly TrainingMethod[] = [
  danielsMethod,
  pfitzingerMethod,
  hansonsMethod,
  higdonMethod,
  gallowayMethod,
  fitzgeraldMethod,
  koopMethod,
  rocheMethod,
  trainingPeaksMethod,
] as unknown as readonly TrainingMethod[]

export function getMethodById(id: string): TrainingMethod | undefined {
  return ALL_METHODS.find(m => m.id === id)
}

/** Method ids that are available for coaching context + the Methodology
 *  screen but are NOT offered in the onboarding top-3 recommender.
 *  TrainingPeaks is the seed-athlete default philosophy and a general
 *  periodization framework rather than a race-distance-specific pick. */
export const COACHING_ONLY_METHOD_IDS: ReadonlySet<string> = new Set(['trainingpeaks'])

/** Methods eligible for the onboarding recommender (excludes coaching-only). */
export const RECOMMENDABLE_METHODS: readonly TrainingMethod[] =
  ALL_METHODS.filter(m => !COACHING_ONLY_METHOD_IDS.has(m.id))
