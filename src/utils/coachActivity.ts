/**
 * Tracks the last moment the athlete actively engaged with the coach —
 * typing in the composer or sending a message. The daily auto-archive
 * reads this so it can hold the midnight rollover until the athlete has
 * been idle for the grace window, rather than yanking the thread out from
 * under an in-progress conversation.
 *
 * Module-level singleton: only one human uses the app at a time, and the
 * signal ("is someone mid-conversation right now") isn't athlete-specific.
 */
let lastActivity = Date.now()

export function markCoachActivity(): void {
  lastActivity = Date.now()
}

export function getLastCoachActivity(): number {
  return lastActivity
}
