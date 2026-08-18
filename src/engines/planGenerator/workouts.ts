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
function nearestPhaseWithPatterns(
  method: TrainingMethod,
  phaseId: string,
  hasPatterns: (id: string) => boolean = id => method.weeklyPatterns.some(p => p.phaseId === id),
): string | null {
  const phasesWithPatterns = method.phases
    .filter(ph => hasPatterns(ph.id))
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
  raceDistance?: string,
): WeeklyPattern | null {
  // R4 — distance-variant patterns: a pattern listing `distances` is
  // authored for those races only (the intensity-forward 5K/10K weeks).
  // With a goal distance, matching variants WIN over distance-agnostic
  // patterns in the same phase; a pattern whose list excludes the goal
  // distance is never selected. Without a distance, only agnostic
  // patterns are considered (legacy callers keep legacy behavior).
  const forDistance = (ps: WeeklyPattern[]): WeeklyPattern[] => {
    if (!raceDistance) return ps.filter(p => !p.distances)
    const variants = ps.filter(p => p.distances?.includes(raceDistance))
    return variants.length > 0 ? variants : ps.filter(p => !p.distances)
  }
  const usable = (id: string) => forDistance(method.weeklyPatterns.filter(p => p.phaseId === id))
  // A phase whose only patterns are OTHER-distance variants counts as
  // having none for this race — the nearest phase with usable patterns is
  // borrowed instead (a marathon must never inherit the 5K rep week just
  // because Phase II authored nothing else).
  let inPhase = usable(phaseId)
  if (inPhase.length === 0) {
    const fallbackPhaseId = nearestPhaseWithPatterns(method, phaseId, id => usable(id).length > 0)
    if (fallbackPhaseId != null) inPhase = usable(fallbackPhaseId)
  }
  if (inPhase.length === 0) {
    // Last resort: no phase has a usable pattern for this distance —
    // borrow the nearest phase's patterns unfiltered rather than emit a
    // blank week.
    const anyPhaseId = nearestPhaseWithPatterns(method, phaseId)
    if (anyPhaseId == null) return null
    inPhase = method.weeklyPatterns.filter(p => p.phaseId === anyPhaseId)
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
/** Day categories whose preferred-workout alternates rotate week to week
 *  (see the rotation note inside pickWorkoutForDay). */
const ROTATING_CATEGORIES: ReadonlySet<string> = new Set([
  'tempo', 'cruise_intervals', 'vo2_intervals', 'speed_repetitions',
  'fartlek', 'progression',
])

export function pickWorkoutForDay(
  method: TrainingMethod,
  day: DaySchedule,
  userExperience: MethodExperienceLevel,
  currentWeekMileage: number,
  weekNumber?: number,
): { workout: Workout; substituted: boolean; reason?: string } | null {
  if (day.category === 'rest' || day.category === 'cross_training' || day.category === 'strength') {
    return null
  }

  const userRank = expRank(userExperience)
  const candidates = (day.preferredWorkoutIds ?? [])
    .map(id => method.workouts.find(w => w.id === id))
    .filter((w): w is Workout => !!w)

  // R2 — rotate through the day's ELIGIBLE preferred workouts by week so a
  // mileage plateau doesn't stamp out byte-identical weeks (the QA gate's
  // qa_duplicate_weeks: "repetition without progression is maintenance").
  // Only QUALITY slots rotate — that's where published methods vary the
  // session week to week. Hills alternates are terrain choices ("Climbing
  // Repeats OR Durability Hike (mountain)"), and easy/long/recovery days
  // are sized programmatically — for all of those, preferred order is
  // preference, and the author's first choice stands. Week 1 keeps the
  // first choice too; without a weekNumber the first eligible wins,
  // exactly as before.
  const eligible = candidates.filter(w => {
    const minExpOk = !w.minimumExperience || expRank(w.minimumExperience) <= userRank
    const baseMiOk = !w.requiresBaseMileage || currentWeekMileage >= w.requiresBaseMileage
    return minExpOk && baseMiOk
  })
  if (eligible.length > 0) {
    const rotates = ROTATING_CATEGORIES.has(day.category)
    const idx = rotates && weekNumber != null && eligible.length > 1
      ? (weekNumber - 1) % eligible.length
      : 0
    return { workout: eligible[idx], substituted: false }
  }

  // Fallback: try to find any workout matching the day's category that the
  // user is allowed to run, else any easy-run substitute. Two passes — a
  // same-category match must WIN over an easy run that merely appears
  // earlier in the method's workout array (a single find let higdon's
  // race_pace day resolve to "Easy" purely by ordering).
  const allowed = (w: Workout) => {
    const minExpOk = !w.minimumExperience || expRank(w.minimumExperience) <= userRank
    const baseMiOk = !w.requiresBaseMileage || currentWeekMileage >= w.requiresBaseMileage
    return minExpOk && baseMiOk
  }
  const fallback = method.workouts.find(w => allowed(w) && w.category === day.category)
    ?? method.workouts.find(w => allowed(w) && w.category === 'easy')
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
/** Minutes a segment occupies, including reps and timed recoveries.
 *  Returns null when the segment has no usable duration (distance-only). */
function segmentMinutes(seg: PlannedSegment): number | null {
  if (!seg.duration) return null
  const per = seg.duration.unit === 'sec' ? seg.duration.value / 60 : seg.duration.value
  const reps = seg.reps ?? 1
  let recovery = 0
  if (seg.reps && seg.recovery?.duration) {
    const rec = seg.recovery.duration
    recovery = (rec.unit === 'sec' ? rec.value / 60 : rec.value) * seg.reps
  }
  return per * reps + recovery
}

/**
 * Scale a workout's flexible steady segments so the step durations agree
 * with the session's computed time (P0.1 — the v1 plan shipped a header of
 * "42-50 min" over a step reading "150 min" because method-JSON template
 * durations were copied verbatim and never rescaled to the week's volume).
 *
 * Flexible = a main-set segment with a minute duration and no reps and no
 * distance (the steady "run below AeT" block). Warmups, cooldowns, and
 * interval structures keep their authored durations; the steady work
 * absorbs the difference. Also rewrites `approxDurationMinutes` so every
 * downstream consumer (UI header, PDF, Garmin push) sees one duration.
 * Returns the workout unchanged when there is nothing safe to scale.
 */
export function scaleWorkoutToTime(
  pw: PlannedWorkout,
  timeRange: { min: number; max: number },
): PlannedWorkout {
  const isFlexible = (s: PlannedSegment) =>
    s.role === 'main' && !!s.duration && s.duration.unit === 'min' && !s.reps && !s.distance
  const flexible = pw.segments.filter(isFlexible)
  if (flexible.length === 0) return pw

  const fixedMinutes = pw.segments
    .filter(s => !isFlexible(s))
    .reduce((sum, s) => sum + (segmentMinutes(s) ?? 0), 0)
  const flexTemplateTotal = flexible.reduce((sum, s) => sum + s.duration!.value, 0)

  const target = Math.round((timeRange.min + timeRange.max) / 2)
  // Each flexible segment keeps its share of the template's steady time,
  // floored at 5 min so a tiny week never produces a zero-length step.
  const flexTarget = Math.max(5 * flexible.length, target - fixedMinutes)

  const segments = pw.segments.map(s => {
    if (!isFlexible(s)) return s
    const share = s.duration!.value / flexTemplateTotal
    return {
      ...s,
      duration: { value: Math.max(5, Math.round(flexTarget * share)), unit: 'min' as const },
    }
  })
  return { ...pw, segments, approxDurationMinutes: timeRange }
}

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
