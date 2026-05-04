/**
 * Per-exercise strength progression tracking.
 *
 * Aggregates `actual.strengthLog` across all training weeks for a given
 * exercise so the workout card can show "Last time: 20 lb × 8 (Wk 1) →
 * Try today: 22.5 lb × 8" and the AI Coach can comment on patterns.
 *
 * Pure functions only — no React, no localStorage. Tested directly.
 */

import type { TrainingWeek, StrengthSet } from '../types'
import { getExerciseGuide } from './exercises'

export interface ExerciseSession {
  /** YYYY-MM-DD — date of the actual workout. */
  date: string
  /** Week number from the training plan. */
  weekNum: number
  /** Day label (e.g. "Mon 4/27") for display. */
  dayLabel: string
  /** Sets logged at this session, in original order. */
  sets: StrengthSet[]
  /** Heaviest weight in lb across all sets in this session. 0 for bodyweight. */
  topWeightLb: number
  /** Total reps across all sets (volume proxy). */
  totalReps: number
}

export interface ExerciseProgression {
  /** Canonical name (matched to a guide when possible, else the user's name). */
  canonicalName: string
  /** Original/preferred display name (matches the GUIDES library when found). */
  displayName: string
  sessions: ExerciseSession[]
  /** First and last session for quick comparison. Empty arrays mean no history. */
  first?: ExerciseSession
  last?: ExerciseSession
  /** Peak weight observed in any session. */
  peakWeightLb: number
  /** Whether the exercise looks bodyweight (no weight ever recorded). */
  isBodyweight: boolean
}

export interface NextTargetSuggestion {
  /** Suggested top-set weight in lb. 0 means bodyweight. */
  weightLb: number
  /** Suggested reps per set. */
  reps: number
  /** Number of sets — usually unchanged from last session. */
  sets: number
  /** Short rationale shown alongside the target. */
  rationale: string
  /** Tier of confidence: 'progress' = ready to add load, 'hold' = repeat,
   *  'deload' = pull back, 'starting' = first session, no history yet. */
  tier: 'progress' | 'hold' | 'deload' | 'starting'
}

/**
 * Parse a weight string like "20 lb", "20 lbs", "22.5", "—", "BW", "0 lbs"
 * into a number of lb. Returns 0 for bodyweight or unrecognized input.
 */
export function parseWeightLb(weight: string | undefined | null): number {
  if (!weight) return 0
  const s = weight.toString().trim().toLowerCase()
  if (!s || s === '—' || s === '-' || s === 'bw' || s === 'bodyweight') return 0
  const m = s.match(/(\d+(?:\.\d+)?)/)
  if (!m) return 0
  const n = parseFloat(m[1])
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/**
 * Normalize an exercise name to a canonical key. Used to group sessions
 * across slightly different name variants (e.g. "Goblet Squat" vs
 * "Goblet Squats" vs "DB Goblet Squat").
 */
export function normalizeExerciseName(raw: string): string {
  // First try the exercise guide library — if a guide matches, use its
  // name as the canonical key. That handles aliases like "DB Squat" →
  // matched into the goblet squat / barbell squat guide.
  const guide = getExerciseGuide(raw)
  if (guide) return guide.name.toLowerCase()
  return raw
    .toLowerCase()
    .trim()
    .replace(/^(db|bb|kb|dumbbell|barbell|kettlebell)\s+/, '')
    .replace(/s$/, '')      // simple plural strip
    .replace(/\s+/g, ' ')
}

/**
 * Build the full per-exercise history across all weeks. Returns a Map
 * keyed by canonical name → progression. Sessions are sorted oldest to
 * newest within each entry.
 */
export function buildProgression(weeks: TrainingWeek[]): Map<string, ExerciseProgression> {
  const out = new Map<string, ExerciseProgression>()

  for (const week of weeks) {
    for (const day of week.days) {
      const log = day.actual?.strengthLog
      if (!log || log.length === 0) continue
      const date = day.actual?.startDate?.slice(0, 10) ?? ''
      if (!date) continue

      for (const ex of log) {
        if (!ex.sets || ex.sets.length === 0) continue
        const canonical = normalizeExerciseName(ex.name)
        const guide = getExerciseGuide(ex.name)
        const display = guide?.name ?? ex.name

        const topWeightLb = ex.sets.reduce((max, s) => Math.max(max, parseWeightLb(s.weight)), 0)
        const totalReps = ex.sets.reduce((sum, s) => sum + (s.reps || 0), 0)

        const session: ExerciseSession = {
          date,
          weekNum: week.num,
          dayLabel: day.day,
          sets: ex.sets,
          topWeightLb,
          totalReps,
        }

        const existing = out.get(canonical)
        if (existing) {
          existing.sessions.push(session)
          existing.peakWeightLb = Math.max(existing.peakWeightLb, topWeightLb)
          existing.isBodyweight = existing.isBodyweight && topWeightLb === 0
        } else {
          out.set(canonical, {
            canonicalName: canonical,
            displayName: display,
            sessions: [session],
            peakWeightLb: topWeightLb,
            isBodyweight: topWeightLb === 0,
          })
        }
      }
    }
  }

  // Sort each progression's sessions chronologically + populate first/last
  for (const prog of out.values()) {
    prog.sessions.sort((a, b) => a.date.localeCompare(b.date))
    prog.first = prog.sessions[0]
    prog.last = prog.sessions[prog.sessions.length - 1]
  }

  return out
}

/**
 * Look up the progression for a single exercise by name (any variant).
 * Returns null when the athlete hasn't logged this exercise before.
 */
export function getProgressionFor(
  weeks: TrainingWeek[],
  exerciseName: string,
): ExerciseProgression | null {
  const all = buildProgression(weeks)
  const canonical = normalizeExerciseName(exerciseName)
  return all.get(canonical) ?? null
}

const HIT_ALL_REPS_THRESHOLD = 0.95
const FAILED_REPS_THRESHOLD = 0.80
const WEIGHT_INCREMENT_PCT = 0.05      // +5% load when ready to progress
const MIN_WEIGHT_INCREMENT_LB = 2.5    // round to nearest 2.5 lb plate
const REP_INCREMENT = 1                // +1 rep when not ready for weight bump
const MAX_REPS_BEFORE_WEIGHT_BUMP = 12 // once you can do 12 clean reps, add load
const DELOAD_PCT = 0.90                // -10% on deload after a clear failure

/**
 * Suggest the next session's target based on the athlete's history with
 * this exercise plus the planned sets/reps for the upcoming session.
 *
 * Rules (linear progression with a soft plateau bump):
 *   • No history          → "starting": use planned sets/reps as-is
 *   • Last session hit ≥ 95% of planned reps:
 *       - If at planned reps × planned sets, weighted: add ~5% load
 *       - If still under MAX_REPS_BEFORE_WEIGHT_BUMP: add 1 rep
 *   • Last session hit 80–95%: hold (repeat last weight × reps)
 *   • Last session < 80%: deload to ~90% of last weight
 */
export function suggestNextTarget(
  progression: ExerciseProgression | null,
  plannedSets: number,
  plannedReps: number,
): NextTargetSuggestion {
  if (!progression || !progression.last) {
    return {
      weightLb: 0,
      reps: plannedReps,
      sets: plannedSets,
      rationale: 'First time — focus on form and pick a comfortable weight.',
      tier: 'starting',
    }
  }

  const last = progression.last
  const isBW = progression.isBodyweight

  // Did they hit all the planned reps?
  const lastTotalReps = last.totalReps
  const lastSetsCount = last.sets.length
  const lastTopWeight = last.topWeightLb
  const targetTotalReps = plannedSets * plannedReps
  const ratio = targetTotalReps > 0 ? lastTotalReps / targetTotalReps : 1

  const avgRepsPerSet = lastSetsCount > 0 ? lastTotalReps / lastSetsCount : 0

  // Failed clearly — pull back
  if (ratio < FAILED_REPS_THRESHOLD) {
    if (isBW) {
      const reps = Math.max(1, Math.round(avgRepsPerSet * 0.9))
      return {
        weightLb: 0,
        reps,
        sets: plannedSets,
        rationale: `Last session was tough (${lastTotalReps} of ${targetTotalReps} reps). Drop to ${reps}/set and rebuild form.`,
        tier: 'deload',
      }
    }
    const deloadWeight = roundToPlate(lastTopWeight * DELOAD_PCT)
    return {
      weightLb: deloadWeight,
      reps: plannedReps,
      sets: plannedSets,
      rationale: `Last session under-hit reps (${lastTotalReps}/${targetTotalReps}). Drop to ${deloadWeight} lb and dial in the form.`,
      tier: 'deload',
    }
  }

  // Hit most reps — hold and try again
  if (ratio < HIT_ALL_REPS_THRESHOLD) {
    return {
      weightLb: lastTopWeight,
      reps: plannedReps,
      sets: plannedSets,
      rationale: isBW
        ? `Repeat last session (${Math.round(avgRepsPerSet)}/set) — close to ready for the next step.`
        : `Repeat ${lastTopWeight} lb — close to clean reps, one more session at this load.`,
      tier: 'hold',
    }
  }

  // Hit all reps — progress
  if (isBW) {
    // For bodyweight: add a rep until you're well above planned, then suggest a harder variant in the rationale
    const nextReps = Math.round(avgRepsPerSet) + REP_INCREMENT
    const aboveCap = avgRepsPerSet >= MAX_REPS_BEFORE_WEIGHT_BUMP
    return {
      weightLb: 0,
      reps: nextReps,
      sets: plannedSets,
      rationale: aboveCap
        ? `Crushing it — ${Math.round(avgRepsPerSet)}/set is plenty. Try the harder alternate (see Alternates), or push to ${nextReps}/set.`
        : `Last hit ${Math.round(avgRepsPerSet)}/set clean. Try ${nextReps}/set today.`,
      tier: 'progress',
    }
  }

  // Weighted exercise — if at planned reps, add weight; otherwise keep adding reps
  if (avgRepsPerSet >= plannedReps) {
    const newWeight = roundToPlate(Math.max(lastTopWeight + MIN_WEIGHT_INCREMENT_LB, lastTopWeight * (1 + WEIGHT_INCREMENT_PCT)))
    return {
      weightLb: newWeight,
      reps: plannedReps,
      sets: plannedSets,
      rationale: `Hit ${plannedReps}×${plannedSets} clean at ${lastTopWeight} lb. Bump to ${newWeight} lb today.`,
      tier: 'progress',
    }
  }

  return {
    weightLb: lastTopWeight,
    reps: Math.min(MAX_REPS_BEFORE_WEIGHT_BUMP, Math.round(avgRepsPerSet) + REP_INCREMENT),
    sets: plannedSets,
    rationale: `Clean reps at ${lastTopWeight} lb — try one more rep per set today.`,
    tier: 'progress',
  }
}

function roundToPlate(weight: number): number {
  return Math.round(weight / MIN_WEIGHT_INCREMENT_LB) * MIN_WEIGHT_INCREMENT_LB
}

export interface ProjectionResult {
  /** Projected top weight in lb at the target week. 0 for bodyweight. */
  predictedWeightLb: number
  /** Projected average reps per set at the target week (for bodyweight). */
  predictedReps: number
  /** Plain-English confidence label — based on session count + trajectory shape. */
  confidence: 'low' | 'medium' | 'high'
  /** Method used: 'linear' = OLS regression, 'last-known' = held flat
   *  (only one session), 'flat' = held flat (no recent change). */
  method: 'linear' | 'last-known' | 'flat'
}

/**
 * Project an exercise's expected top set forward to a target week using
 * simple linear regression on (weekNum, topWeightLb) for weighted lifts
 * or (weekNum, avgRepsPerSet) for bodyweight. Confidence is heuristic
 * but communicates "do/don't trust this projection at face value."
 */
export function projectToWeek(
  progression: ExerciseProgression,
  targetWeekNum: number,
): ProjectionResult | null {
  const sessions = progression.sessions
  if (sessions.length === 0) return null
  const last = sessions[sessions.length - 1]

  // Single data point → can't fit a line, just hold last value
  if (sessions.length < 2) {
    return {
      predictedWeightLb: progression.isBodyweight ? 0 : last.topWeightLb,
      predictedReps: last.sets.length > 0 ? Math.round(last.totalReps / last.sets.length) : 0,
      confidence: 'low',
      method: 'last-known',
    }
  }

  // Project the right metric for the modality
  const xs = sessions.map(s => s.weekNum)
  const ys = progression.isBodyweight
    ? sessions.map(s => (s.sets.length > 0 ? s.totalReps / s.sets.length : 0))
    : sessions.map(s => s.topWeightLb)

  const slope = ols(xs, ys)
  if (slope === null) {
    return {
      predictedWeightLb: progression.isBodyweight ? 0 : last.topWeightLb,
      predictedReps: last.sets.length > 0 ? Math.round(last.totalReps / last.sets.length) : 0,
      confidence: 'low',
      method: 'flat',
    }
  }

  // y = a + b*x; predict at target week
  const meanX = avg(xs)
  const meanY = avg(ys)
  const intercept = meanY - slope * meanX
  const predictedY = intercept + slope * targetWeekNum

  // Confidence heuristic: more sessions + monotonic improvement = higher
  const monotonic = sessions.every((_s, i) => i === 0 || ys[i] >= ys[i - 1])
  const confidence: ProjectionResult['confidence'] =
    sessions.length >= 5 ? 'high' :
    sessions.length >= 3 ? (monotonic ? 'high' : 'medium') :
    monotonic ? 'medium' : 'low'

  if (progression.isBodyweight) {
    return {
      predictedWeightLb: 0,
      predictedReps: Math.max(0, Math.round(predictedY)),
      confidence,
      method: 'linear',
    }
  }
  return {
    predictedWeightLb: Math.max(0, Math.round((predictedY) / 2.5) * 2.5),
    predictedReps: last.sets.length > 0 ? Math.round(last.totalReps / last.sets.length) : 0,
    confidence,
    method: 'linear',
  }
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((s, x) => s + x, 0) / xs.length
}

function ols(xs: number[], ys: number[]): number | null {
  if (xs.length < 2 || xs.length !== ys.length) return null
  const meanX = avg(xs)
  const meanY = avg(ys)
  let num = 0
  let den = 0
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY)
    den += (xs[i] - meanX) ** 2
  }
  if (den === 0) return null  // all same x value
  return num / den
}

/** Format a session compactly: "20 lb × 8 (Wk 1)" or "× 12 (Wk 2)". */
export function formatSession(session: ExerciseSession): string {
  const reps = session.sets.length > 0
    ? `× ${Math.round(session.totalReps / session.sets.length)} × ${session.sets.length} sets`
    : ''
  const wt = session.topWeightLb > 0 ? `${session.topWeightLb} lb ` : ''
  return `${wt}${reps} (Wk ${session.weekNum})`.trim()
}
