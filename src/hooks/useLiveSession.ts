import { useCallback, useEffect, useState } from 'react'
import type { ActualWorkout, StrengthExerciseLog } from '../types'
import {
  startSession, logCurrentSet, startNextSet, extendRest, skipCurrentSet,
  updateSet, pause, resume, endSession, toActualWorkout,
  elapsedSec, restRemainingSec,
  saveDraft, loadDraft, clearDraft,
  type LiveSessionState,
} from '../utils/liveSession'

/**
 * React shell over the pure live-session engine (utils/liveSession).
 *
 * Responsibilities kept deliberately thin:
 *   - bind every transition to Date.now()
 *   - persist the state to the local draft after every transition
 *     (crash-proof: killing the PWA mid-set resumes exactly here)
 *   - re-render once a second while a clock is visible — DISPLAY only;
 *     all timing truth lives in the state's timestamps, so a throttled
 *     or dead interval can never corrupt the session.
 */
export function useLiveSession(athleteId?: string) {
  const [state, setState] = useState<LiveSessionState | null>(() => loadDraft(athleteId))
  // Heartbeat for clock displays: the rendered "now". Views derive
  // elapsed/rest from this instead of calling Date.now() in render —
  // display truth updates once a second, timing truth stays in the
  // state's timestamps either way.
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!state || state.phase === 'finished' || state.pausedAt != null) return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [state])

  const transition = useCallback(
    (fn: (s: LiveSessionState, now: number) => LiveSessionState) => {
      setState(prev => {
        if (!prev) return prev
        const next = fn(prev, Date.now())
        saveDraft(next, athleteId)
        return next
      })
    },
    [athleteId],
  )

  return {
    state,
    /** The rendered clock — updated by the heartbeat while running. */
    nowMs,
    /** Begin a session from drafted exercises (ghost rows welcome). */
    start(exercises: StrengthExerciseLog[], meta: { dayLabel: string; dayIso?: string }) {
      const s = startSession(exercises, meta, Date.now())
      saveDraft(s, athleteId)
      setState(s)
    },
    /** True when a killed session is waiting to be resumed. */
    hasDraft: state != null && state.phase !== 'finished',
    logSet: () => transition((s, now) => logCurrentSet(s, now)),
    nextSet: () => transition(s => startNextSet(s)),
    addRest: (sec: number) => transition(s => extendRest(s, sec)),
    skipSet: () => transition(s => skipCurrentSet(s)),
    editSet: (exIdx: number, setIdx: number, patch: Parameters<typeof updateSet>[3]) =>
      transition(s => updateSet(s, exIdx, setIdx, patch)),
    pause: () => transition((s, now) => pause(s, now)),
    resume: () => transition((s, now) => resume(s, now)),
    end: () => transition(s => endSession(s)),
    /** Finish: produce the ordinary log entry and clear the draft. */
    finish(): ActualWorkout | null {
      if (!state) return null
      const workout = toActualWorkout(state, Date.now())
      clearDraft(athleteId)
      setState(null)
      return workout
    },
    /** Abandon without logging anything. */
    discard() {
      clearDraft(athleteId)
      setState(null)
    },
    now: {
      elapsedSec: () => (state ? elapsedSec(state, Date.now()) : 0),
      restRemainingSec: () => (state ? restRemainingSec(state, Date.now()) : 0),
    },
  }
}
