import type { ActualWorkout, StrengthExerciseLog } from '../types'
import { getExerciseGuide } from './exercises'

/**
 * The live-session engine — Phase 2 of the strength-logging overhaul.
 *
 * A pure state machine over plain data: every transition takes `now`
 * (epoch ms) as an argument and derives all timing from stored
 * timestamps, never from running counters. That is the iOS-PWA
 * discipline from the roadmap: Safari throttles background JS, so a
 * ticking interval drifts or dies — wall-clock math on wake does not.
 * The React shell (useLiveSession) only re-renders on a heartbeat and
 * binds these transitions to Date.now().
 *
 * Crash-proofness: the whole state serializes to localStorage after
 * every transition (see draft helpers). Killing the PWA mid-set and
 * reopening resumes exactly where the athlete was; a rest that expired
 * while the app was dead shows as expired, not frozen.
 */

export interface LiveCursor {
  exIdx: number
  setIdx: number
}

export type LivePhase = 'exercise' | 'rest' | 'finished'

/** The plan's own rest prescription. In round traversal the boundary
 *  matters (between rounds, or after every station); in straight sets
 *  it is simply the rest after every set. */
export interface PlannedRest {
  sec: number
  between: 'rounds' | 'stations'
}

export interface LiveSessionMeta {
  dayLabel: string
  dayIso?: string
  traversal?: 'exercise' | 'round'
  sim?: boolean
  title?: string
  plannedRest?: PlannedRest
}

export interface LiveSessionState {
  /** Draft-format version — bump on breaking shape changes so an old
   *  draft is discarded instead of misread. */
  v: 1
  /** How the cursor walks the work. 'exercise' (default): all sets of an
   *  exercise, then the next exercise — the straight-sets gym flow.
   *  'round': every station once per round, then the next round — the
   *  Hyrox station-circuit flow (set index IS the round index). */
  traversal?: 'exercise' | 'round'
  /** Race-simulation session (Phase 3b): alternating run + station
   *  segments. Changes how the finished workout is written — segment
   *  splits instead of a strength log. */
  sim?: boolean
  /** Display title for sim sessions ('Race simulation', 'Half simulation'). */
  title?: string
  /** Rest the plan prescribes. Straight sets: replaces the guide's
   *  default after every set. Circuits: a timed rest screen between
   *  rounds or after every station; absent → stations flow straight
   *  into each other. */
  plannedRest?: PlannedRest
  dayLabel: string
  /** ISO date the session logs against (YYYY-MM-DD), when known. */
  dayIso?: string
  startedAt: number
  exercises: StrengthExerciseLog[]
  cursor: LiveCursor
  phase: LivePhase
  /** Set while phase === 'rest'. */
  restStartedAt?: number
  restPlannedSec?: number
  /** When the current work segment (set/station) went live — feeds the
   *  per-set timeSec recorded on log, and the circuit face's count-up. */
  segmentStartedAt?: number
  /** Pause bookkeeping: when pausedAt is set the clock is stopped, and
   *  pausedTotalMs accumulates completed pauses. */
  pausedAt: number | null
  pausedTotalMs: number
}

// ─── Construction ──────────────────────────────────────────────

export function startSession(
  exercises: StrengthExerciseLog[],
  meta: LiveSessionMeta,
  now: number,
): LiveSessionState {
  return {
    v: 1,
    traversal: meta.traversal,
    sim: meta.sim,
    title: meta.title,
    plannedRest: meta.plannedRest && meta.plannedRest.sec > 0 ? meta.plannedRest : undefined,
    dayLabel: meta.dayLabel,
    dayIso: meta.dayIso,
    startedAt: now,
    exercises,
    cursor: { exIdx: 0, setIdx: 0 },
    phase: exercises.length > 0 ? 'exercise' : 'finished',
    segmentStartedAt: now,
    pausedAt: null,
    pausedTotalMs: 0,
  }
}

// ─── Derived timing ────────────────────────────────────────────

/** Session clock in whole seconds, paused time excluded. */
export function elapsedSec(s: LiveSessionState, now: number): number {
  const end = s.pausedAt ?? now
  return Math.max(0, Math.floor((end - s.startedAt - s.pausedTotalMs) / 1000))
}

/** Seconds of rest remaining; 0 when expired or not resting. A rest that
 *  ran out while the app was dead correctly reads 0 on resume. */
export function restRemainingSec(s: LiveSessionState, now: number): number {
  if (s.phase !== 'rest' || s.restStartedAt == null || s.restPlannedSec == null) return 0
  const end = s.pausedAt ?? now
  // Clamp: a display clock up to 1s behind the transition timestamp must
  // never show more than the planned rest.
  const gone = Math.max(0, Math.floor((end - s.restStartedAt) / 1000))
  return Math.max(0, s.restPlannedSec - gone)
}

/** Seconds the current work segment (set/station) has been live. */
export function segmentElapsedSec(s: LiveSessionState, now: number): number {
  if (s.segmentStartedAt == null || s.phase !== 'exercise') return 0
  const end = s.pausedAt ?? now
  return Math.max(0, Math.floor((end - s.segmentStartedAt) / 1000))
}

/** Parse a guide's rest prescription ("60 sec between sets", "2 min
 *  between rounds") into seconds. Default 60 when absent/unparseable. */
export function restSecondsFor(exerciseName: string): number {
  const rest = getExerciseGuide(exerciseName)?.rest
  if (!rest) return 60
  const m = rest.match(/(\d+(?:\.\d+)?)\s*(sec|s\b|min|m\b)/i)
  if (!m) return 60
  const n = parseFloat(m[1])
  return /min|m/i.test(m[2]) ? Math.round(n * 60) : Math.round(n)
}

// ─── Transitions (all pure) ────────────────────────────────────

function withSet(
  s: LiveSessionState,
  exIdx: number,
  setIdx: number,
  patch: Partial<StrengthExerciseLog['sets'][number]>,
): LiveSessionState {
  return {
    ...s,
    exercises: s.exercises.map((ex, i) =>
      i === exIdx
        ? { ...ex, sets: ex.sets.map((set, j) => (j === setIdx ? { ...set, ...patch } : set)) }
        : ex,
    ),
  }
}

/** Edit the current (or any) set's numbers mid-session. */
export function updateSet(
  s: LiveSessionState,
  exIdx: number,
  setIdx: number,
  patch: Partial<StrengthExerciseLog['sets'][number]>,
): LiveSessionState {
  return withSet(s, exIdx, setIdx, patch)
}

/** The next cursor position after the given one, or null at the end. */
export function nextCursor(s: LiveSessionState, from: LiveCursor): LiveCursor | null {
  if (s.traversal === 'round') {
    // Round-major: every remaining station in THIS round, then the next
    // round. Ragged circuits (stations with fewer sets) drop out of the
    // rounds they don't prescribe.
    for (let i = from.exIdx + 1; i < s.exercises.length; i++) {
      if (s.exercises[i].sets.length > from.setIdx) return { exIdx: i, setIdx: from.setIdx }
    }
    const nextRound = from.setIdx + 1
    for (let i = 0; i < s.exercises.length; i++) {
      if (s.exercises[i].sets.length > nextRound) return { exIdx: i, setIdx: nextRound }
    }
    return null
  }
  const ex = s.exercises[from.exIdx]
  if (ex && from.setIdx + 1 < ex.sets.length) return { exIdx: from.exIdx, setIdx: from.setIdx + 1 }
  for (let i = from.exIdx + 1; i < s.exercises.length; i++) {
    if (s.exercises[i].sets.length > 0) return { exIdx: i, setIdx: 0 }
  }
  return null
}

/** True when the cursor's next advance crosses into a new exercise. */
export function isLastSetOfExercise(s: LiveSessionState): boolean {
  const ex = s.exercises[s.cursor.exIdx]
  return !ex || s.cursor.setIdx + 1 >= ex.sets.length
}

/**
 * The smart-action press on an exercise screen: mark the current set
 * done and enter rest (the plan's prescription when it gave one, else
 * the exercise guide's).
 * On the session's final set there is no rest — the session finishes.
 */
export function logCurrentSet(s: LiveSessionState, now: number): LiveSessionState {
  if (s.phase !== 'exercise') return s
  const { exIdx, setIdx } = s.cursor
  const timeSec = s.segmentStartedAt != null && s.pausedAt == null
    ? Math.max(0, Math.round((now - s.segmentStartedAt) / 1000))
    : undefined
  const marked = withSet(s, exIdx, setIdx, { done: true, ...(timeSec != null ? { timeSec } : {}) })
  const next = nextCursor(marked, s.cursor)
  if (!next) return { ...marked, phase: 'finished' }
  if (s.traversal === 'round') {
    // A prescribed rest ("Rest 2 min between" / "90 sec rest between
    // stations") is a timed rest screen on that boundary. Otherwise
    // stations flow straight into each other — recovery is the walk to
    // the next station.
    const rest = s.plannedRest
    const crossesRound = next.setIdx > setIdx
    if (rest && (rest.between === 'stations' || crossesRound)) {
      return { ...marked, phase: 'rest', restStartedAt: now, restPlannedSec: rest.sec }
    }
    return { ...marked, cursor: next, phase: 'exercise', segmentStartedAt: now }
  }
  return {
    ...marked,
    phase: 'rest',
    restStartedAt: now,
    restPlannedSec: s.plannedRest?.sec ?? restSecondsFor(marked.exercises[exIdx].name),
  }
}

/** Leave rest and stand on the next set (rest expired, or skipped). */
export function startNextSet(s: LiveSessionState, now: number): LiveSessionState {
  if (s.phase !== 'rest') return s
  const next = nextCursor(s, s.cursor)
  if (!next) return { ...s, phase: 'finished', restStartedAt: undefined, restPlannedSec: undefined }
  return { ...s, phase: 'exercise', cursor: next, restStartedAt: undefined, restPlannedSec: undefined, segmentStartedAt: now }
}

export function extendRest(s: LiveSessionState, addSec: number): LiveSessionState {
  if (s.phase !== 'rest' || s.restPlannedSec == null) return s
  return { ...s, restPlannedSec: s.restPlannedSec + addSec }
}

/** Skip the current set without doing it — honest data: it stays
 *  done:false in the log. Advances like a completed set, minus rest. */
export function skipCurrentSet(s: LiveSessionState, now: number): LiveSessionState {
  if (s.phase !== 'exercise') return s
  const marked = withSet(s, s.cursor.exIdx, s.cursor.setIdx, { done: false })
  const next = nextCursor(marked, s.cursor)
  if (!next) return { ...marked, phase: 'finished' }
  return { ...marked, cursor: next, phase: 'exercise', segmentStartedAt: now }
}

/**
 * Add an exercise mid-session — the pivot when the sleds are taken: it
 * slots in right after the exercise the athlete is on, so it is "up
 * next" rather than buried at the end. Every set starts unchecked.
 *
 * Round traversal keeps its invariant (set index IS the round index):
 * the new station gets one set per round, and the rounds already behind
 * the cursor stay unchecked — honest data, it was not done in those
 * rounds. During the rest that closes a round the pick joins the round
 * about to start (first station), not the one just finished — otherwise
 * it would play as a tail of the old round and earn a second rest.
 * The cursor's exercise never changes, so the current set/rest stays
 * exactly where it was.
 */
export function addExercise(s: LiveSessionState, exercise: StrengthExerciseLog): LiveSessionState {
  if (s.phase === 'finished' || !exercise.name.trim()) return s
  let sets = exercise.sets.map(set => ({ ...set, done: false as const }))
  if (s.traversal === 'round') {
    const rounds = Math.max(s.exercises.reduce((m, ex) => Math.max(m, ex.sets.length), 0), s.cursor.setIdx + 1)
    // One set per round. Sitting right after the cursor, the new station
    // is next up in the CURRENT round (whether the athlete is on a
    // station or resting after one); the rounds already behind stay
    // unchecked, which the log reads as skipped.
    const template = sets[0] ?? { reps: 1, weight: '' }
    sets = Array.from({ length: rounds }, (_, r) => ({
      ...(sets[r] ?? template),
      done: false as const,
    }))
  }
  if (sets.length === 0) return s
  let at = Math.min(s.cursor.exIdx + 1, s.exercises.length)
  let cursor = s.cursor
  if (s.traversal === 'round' && s.phase === 'rest') {
    const next = nextCursor(s, s.cursor)
    if (next && next.setIdx > s.cursor.setIdx) {
      at = next.exIdx
      if (at <= cursor.exIdx) cursor = { ...cursor, exIdx: cursor.exIdx + 1 }
    }
  }
  const exercises = [...s.exercises.slice(0, at), { ...exercise, sets }, ...s.exercises.slice(at)]
  return { ...s, exercises, cursor }
}

/**
 * Another lap of the circuit. The draft is one pass because that is what
 * the plan wrote; an athlete who goes again adds the round here, live,
 * and every station grows one unchecked set (its last prescription
 * repeated) so the round-major cursor simply finds it.
 */
export function addRound(s: LiveSessionState): LiveSessionState {
  if (s.phase === 'finished' || s.traversal !== 'round' || s.sim) return s
  return {
    ...s,
    exercises: s.exercises.map(ex => {
      const last = ex.sets[ex.sets.length - 1]
      if (!last) return ex
      return { ...ex, sets: [...ex.sets, { reps: last.reps, weight: last.weight, done: false as const }] }
    }),
  }
}

export function pause(s: LiveSessionState, now: number): LiveSessionState {
  if (s.pausedAt != null || s.phase === 'finished') return s
  return { ...s, pausedAt: now }
}

export function resume(s: LiveSessionState, now: number): LiveSessionState {
  if (s.pausedAt == null) return s
  const pausedMs = Math.max(0, now - s.pausedAt)
  return {
    ...s,
    pausedAt: null,
    pausedTotalMs: s.pausedTotalMs + pausedMs,
    // Rest and the running segment are their own clocks — shift both
    // anchors so the pause consumed neither.
    restStartedAt: s.restStartedAt != null ? s.restStartedAt + pausedMs : undefined,
    segmentStartedAt: s.segmentStartedAt != null ? s.segmentStartedAt + pausedMs : undefined,
  }
}

/** End the session early from any phase (the "End session" control). */
export function endSession(s: LiveSessionState): LiveSessionState {
  return { ...s, phase: 'finished', restStartedAt: undefined, restPlannedSec: undefined }
}

// ─── Finishing ─────────────────────────────────────────────────

/**
 * The per-segment splits a round-major session recorded: one entry per
 * PERFORMED set with a time, in traversal order. Multi-round circuits
 * stamp the round on the label; a simulation's single round keeps the
 * segment names clean.
 */
export function collectStationSplits(s: LiveSessionState): NonNullable<ActualWorkout['stationSplits']> {
  const out: NonNullable<ActualWorkout['stationSplits']> = []
  const rounds = s.exercises.reduce((m, ex) => Math.max(m, ex.sets.length), 0)
  for (let r = 0; r < rounds; r++) {
    for (const ex of s.exercises) {
      const set = ex.sets[r]
      if (!set || set.done === false || set.timeSec == null) continue
      out.push({
        label: rounds > 1 ? `${ex.name} — round ${r + 1}` : ex.name,
        kind: /^run\b/i.test(ex.name) ? 'run' : 'station',
        sec: set.timeSec,
      })
    }
  }
  return out
}

/** A HYROX run leg is 1 km. */
const RUN_LEG_MILES = 0.621371

/**
 * Turn a finished session into an ordinary ActualWorkout — downstream
 * (grading, coach, sync, progression) cannot tell it from a manual log.
 * Exercises with no name are dropped, same as ManualLog's save.
 *
 * Simulations write differently: segment splits instead of a strength
 * log (a 1-set-per-station record would pollute lift progression), a
 * generic 'workout' type so the session never counts as lifting volume,
 * and distance credited from the run legs actually completed.
 */
export function toActualWorkout(s: LiveSessionState, now: number): ActualWorkout {
  const seconds = elapsedSec(s, now)
  const splits = s.traversal === 'round' ? collectStationSplits(s) : []
  const base = {
    stravaId: now,
    source: 'manual' as const,
    distance: 0,
    movingTime: seconds,
    elapsedTime: seconds,
    elevationGain: 0,
    startDate: s.dayIso ? `${s.dayIso}T08:00:00` : new Date(s.startedAt).toISOString(),
    ...(splits.length > 0 ? { stationSplits: splits } : {}),
  }
  if (s.sim) {
    const runsDone = splits.filter(x => x.kind === 'run').length
    return {
      ...base,
      type: 'workout',
      name: `${s.title ?? 'Race simulation'} — ${s.dayLabel}`,
      distance: Math.round(runsDone * RUN_LEG_MILES * 100) / 100,
    }
  }
  return {
    ...base,
    type: 'strength_training',
    name: `Strength — ${s.dayLabel}`,
    strengthLog: s.exercises.filter(ex => ex.name.trim().length > 0),
  }
}

// ─── Draft persistence ─────────────────────────────────────────

const DRAFT_KEY = 'ba_live_session_draft'

function draftKey(athleteId?: string): string {
  return athleteId ? `${DRAFT_KEY}_${athleteId}` : DRAFT_KEY
}

export function saveDraft(s: LiveSessionState, athleteId?: string): void {
  try {
    localStorage.setItem(draftKey(athleteId), JSON.stringify(s))
  } catch {
    // Storage full/blocked — the session still works, it just won't
    // survive a kill. Never let persistence break the workout.
  }
}

export function loadDraft(athleteId?: string): LiveSessionState | null {
  try {
    const raw = localStorage.getItem(draftKey(athleteId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as LiveSessionState
    if (parsed?.v !== 1 || !Array.isArray(parsed.exercises) || parsed.phase === 'finished') return null
    return parsed
  } catch {
    return null
  }
}

export function clearDraft(athleteId?: string): void {
  try {
    localStorage.removeItem(draftKey(athleteId))
  } catch {
    // ignore
  }
}
