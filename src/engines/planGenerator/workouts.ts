/**
 * Workout selection per day + concrete PlannedWorkout construction.
 *
 * - `pickWeeklyPattern`: find the weekly schedule for a phase that best
 *   matches the user's `trainingDaysPerWeek`. Honors `weekType: 'recovery'`
 *   for cutback weeks when available.
 * - `pickWorkoutForDay`: choose the workout template for a single schedule
 *   day, applying `minimumExperience` and `requiresBaseMileage` filters with
 *   a graceful easy-run fallback.
 * - `buildPlannedWorkout`: turn a template + resolved paces into the
 *   personalized, segment-flattened workout structure consumed by the UI.
 */
import type {
  TrainingMethod,
  Workout,
  WeeklyPattern,
  DaySchedule,
  WorkoutSegment,
  ExperienceLevel as MethodExperienceLevel,
} from '../../types/training-method'
import type {
  PlannedSegment,
  PlannedWorkout,
  ResolvedPaces,
} from './types'

const EXPERIENCE_ORDER: MethodExperienceLevel[] = [
  'beginner', 'recreational', 'intermediate', 'advanced', 'elite',
]

function expRank(level: MethodExperienceLevel): number {
  return EXPERIENCE_ORDER.indexOf(level)
}

/**
 * Pick the phase whose patterns we should borrow when the requested phase
 * declares none. Chooses the nearest phase (by `order`) that actually has
 * weekly patterns; ties prefer the LATER phase (more race-specific). Returns
 * null only when the method has no patterns at all.
 */
function nearestPhaseWithPatterns(method: TrainingMethod, phaseId: string): string | null {
  const phasesWithPatterns = method.phases
    .filter(ph => method.weeklyPatterns.some(p => p.phaseId === ph.id))
    .sort((a, b) => a.order - b.order)
  if (phasesWithPatterns.length === 0) return null

  const targetOrder = method.phases.find(p => p.id === phaseId)?.order
  if (targetOrder == null) return phasesWithPatterns[0].id

  return phasesWithPatterns.reduce((best, ph) => {
    const d = Math.abs(ph.order - targetOrder)
    const bd = Math.abs(best.order - targetOrder)
    // Closer wins; on a tie, prefer the later (higher-order) phase.
    if (d < bd || (d === bd && ph.order > best.order)) return ph
    return best
  }, phasesWithPatterns[0]).id
}

/**
 * Find the weekly pattern in `method.weeklyPatterns` whose `phaseId` matches
 * the current week's phase and whose `daysPerWeek` is closest to the user's
 * preference. For cutback weeks, prefer a pattern with `weekType: 'recovery'`.
 *
 * When the requested phase has no patterns of its own (common — many method
 * JSONs only author patterns for a subset of phases, leaving e.g. taper/peak
 * to inherit), we borrow the nearest phase's patterns rather than returning
 * null, which previously produced blank weeks with zero scheduled days.
 */
export function pickWeeklyPattern(
  method: TrainingMethod,
  phaseId: string,
  preferredDaysPerWeek: number,
  isCutback: boolean,
): WeeklyPattern | null {
  let inPhase = method.weeklyPatterns.filter(p => p.phaseId === phaseId)
  if (inPhase.length === 0) {
    const fallbackPhaseId = nearestPhaseWithPatterns(method, phaseId)
    if (fallbackPhaseId == null) return null
    inPhase = method.weeklyPatterns.filter(p => p.phaseId === fallbackPhaseId)
  }
  if (inPhase.length === 0) return null

  const candidates = isCutback
    ? (inPhase.filter(p => p.weekType === 'recovery').length > 0
        ? inPhase.filter(p => p.weekType === 'recovery')
        : inPhase)
    : (inPhase.filter(p => p.weekType === 'standard').length > 0
        ? inPhase.filter(p => p.weekType === 'standard')
        : inPhase)

  let best = candidates[0]
  let bestDelta = Math.abs(best.daysPerWeek - preferredDaysPerWeek)
  for (const p of candidates) {
    const d = Math.abs(p.daysPerWeek - preferredDaysPerWeek)
    if (d < bestDelta) {
      best = p
      bestDelta = d
    }
  }
  return best
}

/**
 * Choose the running workout for a schedule day. Applies experience floors
 * and base-mileage requirements; on failure, substitutes the method's
 * lowest-experience easy run (first workout in category 'easy').
 *
 * Returns null for non-running categories ('rest', 'cross_training', 'strength').
 */
export function pickWorkoutForDay(
  method: TrainingMethod,
  day: DaySchedule,
  userExperience: MethodExperienceLevel,
  currentWeekMileage: number,
): { workout: Workout; substituted: boolean; reason?: string } | null {
  if (day.category === 'rest' || day.category === 'cross_training' || day.category === 'strength') {
    return null
  }

  const userRank = expRank(userExperience)
  const candidates = (day.preferredWorkoutIds ?? [])
    .map(id => method.workouts.find(w => w.id === id))
    .filter((w): w is Workout => !!w)

  for (const w of candidates) {
    const minExpOk = !w.minimumExperience || expRank(w.minimumExperience) <= userRank
    const baseMiOk = !w.requiresBaseMileage || currentWeekMileage >= w.requiresBaseMileage
    if (minExpOk && baseMiOk) {
      return { workout: w, substituted: false }
    }
  }

  // Fallback: try to find any workout matching the day's category that the
  // user is allowed to run, else any easy-run substitute.
  const fallback = method.workouts.find(w => {
    const minExpOk = !w.minimumExperience || expRank(w.minimumExperience) <= userRank
    const baseMiOk = !w.requiresBaseMileage || currentWeekMileage >= w.requiresBaseMileage
    return minExpOk && baseMiOk && (w.category === day.category || w.category === 'easy')
  })
  if (fallback) {
    return {
      workout: fallback,
      substituted: true,
      reason: `Substituted ${fallback.id} — preferred workout not yet appropriate for your level / mileage.`,
    }
  }
  // Last-resort: return the first workout — better than crashing
  return { workout: method.workouts[0], substituted: true, reason: 'Substituted to default easy run.' }
}

function attachTarget(seg: WorkoutSegment, paces: ResolvedPaces): PlannedSegment['paceTarget'] | undefined {
  if (!seg.paceZone) return undefined
  return paces.byZone[seg.paceZone]
}

function toPlannedSegment(
  role: PlannedSegment['role'],
  seg: WorkoutSegment,
  paces: ResolvedPaces,
): PlannedSegment {
  return {
    role,
    description: seg.description,
    duration: seg.duration,
    distance: seg.distance,
    paceZone: seg.paceZone,
    paceTarget: attachTarget(seg, paces),
    reps: seg.reps,
    recovery: seg.recovery,
    cue: seg.cue,
  }
}

/**
 * Render a personalized PlannedWorkout from a method's Workout template and
 * resolved pace targets. Segments are flattened in order: warmup → mainSet → cooldown.
 */
export function buildPlannedWorkout(
  method: TrainingMethod,
  workout: Workout,
  paces: ResolvedPaces,
  notes?: string,
): PlannedWorkout {
  const segments: PlannedSegment[] = []
  if (workout.structure.warmup) segments.push(toPlannedSegment('warmup', workout.structure.warmup, paces))
  for (const s of workout.structure.mainSet) segments.push(toPlannedSegment('main', s, paces))
  if (workout.structure.cooldown) segments.push(toPlannedSegment('cooldown', workout.structure.cooldown, paces))

  return {
    workoutId: workout.id,
    methodId: method.id,
    name: workout.name,
    displayName: workout.displayName,
    category: workout.category,
    primaryZone: workout.primaryZone,
    segments,
    approxDurationMinutes: workout.approxDurationMinutes,
    approxDistanceMiles: workout.approxDistanceMiles,
    purpose: workout.purpose,
    cues: workout.cues ?? [],
    notes,
  }
}
