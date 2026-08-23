import type { StrengthExerciseLog, StrengthSet, TrainingWeek } from '../types'
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

/** Keyword-based focus classification for an exercise name. */
export function detectFocus(name: string): StrengthExerciseLog['focus'] {
  const lower = name.toLowerCase()
  const lowerKeywords = ['squat', 'lunge', 'step-up', 'step up', 'rdl', 'deadlift', 'glute', 'calf', 'leg']
  const upperKeywords = ['press', 'bench', 'curl', 'row', 'pullup', 'push-up', 'pushup', 'shoulder', 'tricep', 'bicep']
  const coreKeywords = ['plank', 'crunch', 'ab ', 'core', 'dead bug', 'bird dog', 'pallof']
  if (lowerKeywords.some(k => lower.includes(k))) return 'lower'
  if (upperKeywords.some(k => lower.includes(k))) return 'upper'
  if (coreKeywords.some(k => lower.includes(k))) return 'core'
  return 'full'
}

/**
 * Parse a plan detail string into structured exercise entries.
 * e.g., "Goblet squats 3×12 · Walking lunges 3×10/leg · Plank 3×45s"
 * → array of StrengthExerciseLog with name, focus, and sets pre-filled.
 * (Moved out of ManualLog so the exercise picker shares it.)
 */
export function parsePlanExercises(detail: string): StrengthExerciseLog[] {
  if (!detail) return []

  // Split on common delimiters: " · ", " | ", or newlines
  const parts = detail.split(/\s*[·|]\s*|\n/).map(s => s.trim()).filter(Boolean)

  const exercises: StrengthExerciseLog[] = []
  for (const part of parts) {
    // Try to match "Exercise Name NxR" patterns like "3×12", "3x10", "3×45s"
    const setsMatch = part.match(/^(.+?)\s+(\d+)\s*[×xX]\s*(\d+)\s*(?:\/\w+)?(?:\s*\w+)?$/)

    let name: string
    let numSets = 3
    let reps = 10

    if (setsMatch) {
      name = setsMatch[1].trim()
      numSets = parseInt(setsMatch[2])
      reps = parseInt(setsMatch[3])
    } else {
      // No sets pattern found — use the whole string as name
      name = part
    }

    const sets: StrengthSet[] = Array.from({ length: numSets }, () => ({
      reps,
      weight: '',
    }))

    exercises.push({ name, focus: detectFocus(name), sets })
  }

  return exercises
}

/**
 * Draft a single exercise for the picker's one-tap add:
 *   - a planned prescription wins when given (reps from the plan);
 *   - else the athlete's last session of this exercise becomes the draft;
 *   - else a neutral 3 × 10 skeleton.
 * Always ghost-filled: weights borrowed from history, every row unchecked.
 */
export function draftExercise(
  name: string,
  progression: Map<string, ExerciseProgression>,
  plannedSets?: StrengthSet[],
): StrengthExerciseLog {
  const last = progression.get(normalizeExerciseName(name))?.last
  const sets: StrengthSet[] = plannedSets?.length
    ? plannedSets
    : last && last.sets.length > 0
      ? last.sets.map(s => ({ reps: s.reps, weight: s.weight }))
      : Array.from({ length: 3 }, () => ({ reps: 10, weight: '' }))
  return ghostFillFromHistory([{ name, focus: detectFocus(name), sets }], progression)[0]
}
