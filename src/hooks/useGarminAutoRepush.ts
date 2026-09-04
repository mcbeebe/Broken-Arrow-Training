/**
 * Keep the watch's copy of the plan in step with the app's (G2a).
 *
 * Whenever the derived plan changes — a coach proposal, a realignment, a
 * manual edit, a day swap, an undo — any FUTURE workout already pushed to
 * Garmin whose content no longer matches gets re-sent. One seam catches all
 * of those, which is the point: the alternative is remembering to re-push at
 * every edit site.
 *
 * Two properties keep it cheap, and both are easy to lose in a refactor:
 *
 *   - DEBOUNCED. An applied multi-op proposal changes `weeks` several times
 *     in a row; without the delay each intermediate state would be pushed to
 *     the watch. The timer collapses them into one pass.
 *   - LEDGER-DIFFED. `repushChangedWorkouts` is a no-op unless a pushed day
 *     genuinely changed, so untouched days are never re-sent.
 *
 * Best-effort throughout: a failure is logged and dropped, because the next
 * edit retries and a network blip must not surface as an error to someone
 * editing their training plan.
 */
import { useEffect } from 'react'
import type { TrainingWeek } from '../types'
import { repushChangedWorkouts } from '../utils/garminRepush'

/** How long to wait for edits to settle before pushing. */
export const REPUSH_DEBOUNCE_MS = 2500

export function useGarminAutoRepush(
  weeks: TrainingWeek[],
  athleteId: string,
  connected: boolean,
): void {
  useEffect(() => {
    if (!connected) return
    const timer = setTimeout(() => {
      repushChangedWorkouts(weeks, athleteId)
        .then(result => {
          if (result.sent > 0) {
            console.info(`[garmin] plan changed — re-sent ${result.sent} workout(s) to watch`)
          }
          if (result.failed > 0) {
            console.warn(`[garmin] re-push: ${result.failed} failed`, result.errors)
          }
        })
        .catch(() => { /* re-push is best-effort; next edit retries */ })
    }, REPUSH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [weeks, connected, athleteId])
}
