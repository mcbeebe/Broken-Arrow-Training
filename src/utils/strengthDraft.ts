import type { StrengthExerciseLog, StrengthSet, TrainingWeek } from '../types'
import type { StrengthExperience } from '../hooks/useOnboarding'
import type { StrengthCapacity } from '../engines/strength/benchmark'
import {
  buildProgression,
  normalizeExerciseName,
  type ExerciseProgression,
} from './strengthProgression'
import { getExerciseGuide, calibrateGuideWeight } from './exercises'

/** Athlete calibration context for cold-start ghost weights: lifting
 *  background (self-report) and the measured benchmark, when one exists. */
export interface StrengthCalibration {
  level?: StrengthExperience
  capacity?: StrengthCapacity | null
}

/**
 * A starting weight for an exercise the athlete has never logged —
 * the benchmark's measured prescription when it can speak for this lift,
 * else the guide's default scaled to their lifting background. Null for
 * bodyweight guides and unknown exercises.
 */
export function startingWeightFor(
  name: string,
  calib?: StrengthCalibration,
): { weight: string; source: 'benchmark' | 'guide' } | null {
  const guide = getExerciseGuide(name)
  if (!guide?.weight) return null
  const calibrated = calibrateGuideWeight(guide.weight, calib?.level, {
    capacity: calib?.capacity ?? null,
    exerciseName: name,
  })
  const fromBenchmark = /from your benchmark/i.test(calibrated)
  const m = calibrated.match(/(\d+(?:\.\d+)?)/)
  if (!m) return null // bodyweight prescription
  return { weight: `${m[1]} lb`, source: fromBenchmark ? 'benchmark' : 'guide' }
}

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
  calib?: StrengthCalibration,
): StrengthExerciseLog[] {
  return exercises.map(ex => {
    const last = progression.get(normalizeExerciseName(ex.name))?.last
    const lastSets = last?.sets ?? []
    // Cold start: no history of this exercise → borrow the benchmark /
    // calibrated guide weight so the athlete never faces a blank "—".
    const starting = lastSets.length === 0 ? startingWeightFor(ex.name, calib) : null
    return {
      ...ex,
      sets: ex.sets.map((s, i) => ({
        ...s,
        weight: s.weight
          || (lastSets[i] ?? lastSets[lastSets.length - 1])?.weight
          || starting?.weight
          || '',
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
 * A plan detail decomposed into what gets logged and what gets read.
 * The exercises are the work; the rest directive and the notes are
 * instructions the athlete follows, never rows in the log.
 */
export interface PlanPrescription {
  exercises: StrengthExerciseLog[]
  /** Rest the plan prescribes inside a circuit — "Rest 2 min between",
   *  "90 sec rest between stations". A bare "between" means between
   *  rounds: one timed break per lap of the circuit. */
  rest?: { sec: number; between: 'rounds' | 'stations' }
  /** Coaching lines ("Grip note: finish with 2× dead hang…", "Rest fully
   *  between tests") — surfaced to the athlete, not logged as exercises. */
  notes: string[]
}

const DURATION_RE = /(\d+(?:\.\d+)?)\s*(sec(?:ond)?s?|s|min(?:ute)?s?|m)\b/i
const REST_WORD_RE = /\b(?:rest|walk|recover)\b/i
const NOTE_RE = /^(?:[a-z-]+\s+){0,2}note\s*:/i

/**
 * Read a rest directive out of one plan part. Returns null when the part
 * is not about resting, or names no duration ("Rest fully between tests"
 * is a note, not a timer).
 */
export function parseRestDirective(part: string): NonNullable<PlanPrescription['rest']> | null {
  if (!REST_WORD_RE.test(part) || !/\bbetween\b/i.test(part)) return null
  const m = part.match(DURATION_RE)
  if (!m) return null
  const n = parseFloat(m[1])
  const sec = /^m/i.test(m[2]) ? Math.round(n * 60) : Math.round(n)
  if (!(sec > 0)) return null
  return { sec, between: /\b(?:stations?|exercises?|sets?|movements?)\b/i.test(part) ? 'stations' : 'rounds' }
}

/**
 * Parse a plan detail string into the prescription: exercises with sets
 * pre-filled, plus the rest directive and coaching notes that used to
 * land in the log as bogus "exercises" (field bug: a station circuit
 * whose detail ended "· Rest 2 min between · Grip note: …" logged those
 * two lines as Exercise 8 and Exercise 9, 3 × 10 each).
 * e.g., "Goblet squats 3×12 · Walking lunges 3×10/leg · Plank 3×45s"
 */
export function parsePlanPrescription(detail: string): PlanPrescription {
  const out: PlanPrescription = { exercises: [], notes: [] }
  if (!detail) return out

  // Split on common delimiters: " · ", " | ", or newlines
  const parts = detail.split(/\s*[·|]\s*|\n/).map(s => s.trim()).filter(Boolean)

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
      const rest = parseRestDirective(part)
      if (rest) {
        // First directive wins — a detail prescribes one rest scheme.
        if (!out.rest) out.rest = rest
        continue
      }
      if (NOTE_RE.test(part) || (REST_WORD_RE.test(part) && /\bbetween\b/i.test(part))) {
        out.notes.push(part)
        continue
      }
      // No sets pattern found — use the whole string as name
      name = part
    }

    const sets: StrengthSet[] = Array.from({ length: numSets }, () => ({
      reps,
      weight: '',
    }))

    out.exercises.push({ name, focus: detectFocus(name), sets })
  }

  return out
}

/**
 * The exercises a plan detail prescribes — parsePlanPrescription minus
 * the rest and notes. (Moved out of ManualLog so the exercise picker
 * shares it.)
 */
export function parsePlanExercises(detail: string): StrengthExerciseLog[] {
  return parsePlanPrescription(detail).exercises
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
  calib?: StrengthCalibration,
): StrengthExerciseLog {
  const last = progression.get(normalizeExerciseName(name))?.last
  const sets: StrengthSet[] = plannedSets?.length
    ? plannedSets
    : last && last.sets.length > 0
      ? last.sets.map(s => ({ reps: s.reps, weight: s.weight }))
      : Array.from({ length: 3 }, () => ({ reps: 10, weight: '' }))
  return ghostFillFromHistory([{ name, focus: detectFocus(name), sets }], progression, calib)[0]
}
