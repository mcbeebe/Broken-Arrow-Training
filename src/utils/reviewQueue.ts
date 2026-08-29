/**
 * The review queue — where the coach's proposals wait for a decision.
 *
 * P8 stopped these interrupting the morning. That alone would have moved
 * the pile rather than fixed it, so the queue carries its own laws:
 *
 *  - it is CAPPED, so it can never become the wall of cards it replaced;
 *  - items AGE visibly, because "waiting 9 days" is information;
 *  - an item that is ignored long enough EXPIRES with a logged reason,
 *    rather than sitting there forever accusing the athlete;
 *  - dismissing is a snooze, never a blacklist (the law T4 established).
 *
 * The failure this guards against is queue rot: proposals decaying
 * unanswered while the engine quietly stops learning. Rot has to be
 * visible, or it is indistinguishable from nothing being wrong.
 */

export type QueueItemKind = 'benchmark' | 'recalibration' | 'mim' | 'doms'

export interface QueueItem {
  id: string
  kind: QueueItemKind
  title: string
  /** What applying it will do, in the athlete's language. */
  consequence: string
  /** Epoch ms the proposal first appeared. */
  raisedAt: number
}

export interface QueueView extends QueueItem {
  /** Whole days this has been waiting. */
  waitingDays: number
  /** True once it has waited long enough to be worth flagging. */
  stale: boolean
}

/** Most the athlete should ever face at once. Beyond this it stops being a
 *  decision and becomes a chore. */
export const QUEUE_CAP = 7
/** Waiting longer than this is worth saying out loud. */
export const STALE_DAYS = 7
/** Past this, the proposal has been answered by silence. It expires. */
export const EXPIRE_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

export function waitingDays(item: QueueItem, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - item.raisedAt) / DAY_MS))
}

/** Items that have waited past their welcome. They are removed WITH a
 *  reason rather than silently, so the log can say what happened. */
export function expired(items: QueueItem[], now: number = Date.now()): QueueItem[] {
  return items.filter(i => waitingDays(i, now) >= EXPIRE_DAYS)
}

/**
 * What the athlete sees: oldest first, because the thing that has waited
 * longest has the best claim on the decision, and capped.
 */
export function buildQueue(items: QueueItem[], now: number = Date.now()): QueueView[] {
  return items
    .filter(i => waitingDays(i, now) < EXPIRE_DAYS)
    .map(i => {
      const days = waitingDays(i, now)
      return { ...i, waitingDays: days, stale: days >= STALE_DAYS }
    })
    .sort((a, b) => b.waitingDays - a.waitingDays)
    .slice(0, QUEUE_CAP)
}

/** How many are hidden by the cap — never silently swallowed. */
export function overflowCount(items: QueueItem[], now: number = Date.now()): number {
  const live = items.filter(i => waitingDays(i, now) < EXPIRE_DAYS).length
  return Math.max(0, live - QUEUE_CAP)
}

/** "waiting 3 days" / "waiting since this morning". */
export function waitingLabel(view: QueueView): string {
  if (view.waitingDays === 0) return 'new today'
  if (view.waitingDays === 1) return 'waiting 1 day'
  return `waiting ${view.waitingDays} days`
}

/**
 * When a proposal was first put in front of the athlete.
 *
 * Persisted per item, because ageing has to survive a reload: an item that
 * arrived "new" every time the app opened could never grow stale and could
 * never expire, which is precisely how a queue rots while looking healthy.
 */
export function firstSeenAt(athleteId: string | undefined, itemId: string, now: number = Date.now()): number {
  const key = `ba_queue_seen_${athleteId ?? 'me'}`
  try {
    const raw = localStorage.getItem(key)
    const seen = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    if (typeof seen[itemId] === 'number') return seen[itemId]
    seen[itemId] = now
    localStorage.setItem(key, JSON.stringify(seen))
    return now
  } catch {
    // Private mode or a full quota: treat it as new rather than crashing.
    return now
  }
}

/** Forget an item's clock once it has been decided, so the same proposal
 *  arising again later starts its own wait rather than inheriting an old
 *  one and expiring immediately. */
export function clearFirstSeen(athleteId: string | undefined, itemId: string): void {
  const key = `ba_queue_seen_${athleteId ?? 'me'}`
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return
    const seen = JSON.parse(raw) as Record<string, number>
    delete seen[itemId]
    localStorage.setItem(key, JSON.stringify(seen))
  } catch { /* nothing to clear */ }
}
