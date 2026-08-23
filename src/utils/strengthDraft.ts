import type { StrengthExerciseLog, TrainingWeek } from '../types'
import {
  buildProgression,
  normalizeExerciseName,
  type ExerciseProgression,
} from './strengthProgression'

/**
 * Drafting helpers for the strength set editor — "the prescription is the
 * draft". Pure functions, no React: kept out of the component file so the
 * live-session player (Phase 2) and tests share them directly.
 */

/**
 * Ghost-fill a prescription: reps stay as the plan wrote them, weight is
 * borrowed from the athlete's last performed session of the same exercise
 * (positional, falling back to that session's last set), and every row
 * starts UNCHECKED. Editing or checking a row is what turns it real.
 */
export function ghostFillFromHistory(
  exercises: StrengthExerciseLog[],
  progression: Map<string, ExerciseProgression>,
): StrengthExerciseLog[] {
  return exercises.map(ex => {
    const last = progression.get(normalizeExerciseName(ex.name))?.last
    const lastSets = last?.sets ?? []
    return {
      ...ex,
      sets: ex.sets.map((s, i) => ({
        ...s,
        weight: s.weight || (lastSets[i] ?? lastSets[lastSets.length - 1])?.weight || '',
        done: false as const,
      })),
    }
  })
}

/** Build the progression map for the editor from full plan history. */
export function progressionFromWeeks(weeks: TrainingWeek[] | undefined): Map<string, ExerciseProgression> {
  return weeks && weeks.length > 0 ? buildProgression(weeks) : new Map()
}

/** One line summarizing the last session, e.g. "20 lb × 12, 12, 12" or
 *  "BW × 15, 15, 12". Uses performed sets only (buildProgression already
 *  filtered skips and warm-ups). */
export function lastSessionSummary(prog: ExerciseProgression | undefined): string | null {
  const last = prog?.last
  if (!last || last.sets.length === 0) return null
  const reps = last.sets.map(s => s.reps || 0).join(', ')
  return last.topWeightLb > 0 ? `${last.topWeightLb} lb × ${reps}` : `BW × ${reps}`
}
