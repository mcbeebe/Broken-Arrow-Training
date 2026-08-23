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

export interface LiveSessionState {
  /** Draft-format version — bump on breaking shape changes so an old
   *  draft is discarded instead of misread. */
  v: 1
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
  /** Pause bookkeeping: when pausedAt is set the clock is stopped, and
   *  pausedTotalMs accumulates completed pauses. */
  pausedAt: number | null
  pausedTotalMs: number
}

// ─── Construction ──────────────────────────────────────────────

export function startSession(
  exercises: StrengthExerciseLog[],
  meta: { dayLabel: string; dayIso?: string },
  now: number,
): LiveSessionState {
  return {
    v: 1,
    dayLabel: meta.dayLabel,
    dayIso: meta.dayIso,
    startedAt: now,
    exercises,
    cursor: { exIdx: 0, setIdx: 0 },
    phase: exercises.length > 0 ? 'exercise' : 'finished',
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
  const gone = Math.floor((end - s.restStartedAt) / 1000)
  return Math.max(0, s.restPlannedSec - gone)
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
 * done and enter rest (seeded from the exercise guide's prescription).
 * On the session's final set there is no rest — the session finishes.
 */
export function logCurrentSet(s: LiveSessionState, now: number): LiveSessionState {
  if (s.phase !== 'exercise') return s
  const { exIdx, setIdx } = s.cursor
  const marked = withSet(s, exIdx, setIdx, { done: true })
  const next = nextCursor(marked, s.cursor)
  if (!next) return { ...marked, phase: 'finished' }
  return {
    ...marked,
    phase: 'rest',
    restStartedAt: now,
    restPlannedSec: restSecondsFor(marked.exercises[exIdx].name),
  }
}

/** Leave rest and stand on the next set (rest expired, or skipped). */
export function startNextSet(s: LiveSessionState): LiveSessionState {
  if (s.phase !== 'rest') return s
  const next = nextCursor(s, s.cursor)
  if (!next) return { ...s, phase: 'finished', restStartedAt: undefined, restPlannedSec: undefined }
  return { ...s, phase: 'exercise', cursor: next, restStartedAt: undefined, restPlannedSec: undefined }
}

export function extendRest(s: LiveSessionState, addSec: number): LiveSessionState {
  if (s.phase !== 'rest' || s.restPlannedSec == null) return s
  return { ...s, restPlannedSec: s.restPlannedSec + addSec }
}

/** Skip the current set without doing it — honest data: it stays
 *  done:false in the log. Advances like a completed set, minus rest. */
export function skipCurrentSet(s: LiveSessionState): LiveSessionState {
  if (s.phase !== 'exercise') return s
  const marked = withSet(s, s.cursor.exIdx, s.cursor.setIdx, { done: false })
  const next = nextCursor(marked, s.cursor)
  if (!next) return { ...marked, phase: 'finished' }
  return { ...marked, cursor: next, phase: 'exercise' }
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
    // Rest is a recovery clock, not a work clock — shift its anchor so
    // the pause didn't silently consume the rest.
    restStartedAt: s.restStartedAt != null ? s.restStartedAt + pausedMs : undefined,
  }
}

/** End the session early from any phase (the "End session" control). */
export function endSession(s: LiveSessionState): LiveSessionState {
  return { ...s, phase: 'finished', restStartedAt: undefined, restPlannedSec: undefined }
}

// ─── Finishing ─────────────────────────────────────────────────

/**
 * Turn a finished session into an ordinary ActualWorkout — downstream
 * (grading, coach, sync, progression) cannot tell it from a manual log.
 * Exercises with no name are dropped, same as ManualLog's save.
 */
export function toActualWorkout(s: LiveSessionState, now: number): ActualWorkout {
  const seconds = elapsedSec(s, now)
  return {
    stravaId: now,
    source: 'manual',
    distance: 0,
    movingTime: seconds,
    elapsedTime: seconds,
    elevationGain: 0,
    type: 'strength_training',
    name: `Strength — ${s.dayLabel}`,
    startDate: s.dayIso ? `${s.dayIso}T08:00:00` : new Date(s.startedAt).toISOString(),
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
