/**
 * Room in localStorage for what matters.
 *
 * Field bug (2026-09-24): Settings → Garmin read "The quota has been
 * exceeded." — Safari's words for a full ~5 MB localStorage. Every opened
 * workout had cached its per-second streams (HR, pace, altitude, cadence;
 * ~100–150 KB each) forever, the stream cache swallowed its own quota
 * errors, and once storage filled the Garmin sync's unguarded cache write
 * threw. The sync stopped before it updated the app, so Garmin data froze
 * at the last good sync.
 *
 * Now: stream caches are capped (most recent STREAM_CACHE_CAP), a cache
 * write that hits the quota frees every stream copy and retries once, and
 * no sync cache write throws.
 */

/** Stream copies kept on the phone; older ones re-download on demand. */
export const STREAM_CACHE_CAP = 20
const INDEX_KEY = 'ba_stream_cache_index_v1'

/** What the athlete reads when even a freed-up storage can't take a save. */
export const STORAGE_FULL_MESSAGE =
  'Synced, but this phone’s storage for attune.coach is full, so a copy couldn’t be saved here.'

/** A per-second stream copy — regenerable, so the first thing to go. */
export function isStreamCacheKey(key: string): boolean {
  return key.startsWith('ba_strava_streams_') || key.startsWith('ba_garmin_streams_')
}

/** Safari: QuotaExceededError (code 22); Firefox: NS_ERROR_DOM_QUOTA_REACHED (1014). */
export function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error) && !(typeof DOMException !== 'undefined' && err instanceof DOMException)) return false
  const e = err as { name?: string; code?: number }
  return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014
}

function allStreamKeys(): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && isStreamCacheKey(k)) keys.push(k)
  }
  return keys
}

function readIndex(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}

/** Drop every stream copy. Returns how many were removed. */
export function evictStreamCaches(): number {
  let n = 0
  try {
    for (const k of allStreamKeys()) {
      localStorage.removeItem(k)
      n++
    }
    localStorage.removeItem(INDEX_KEY)
  } catch {
    // Storage unavailable — nothing to free.
  }
  return n
}

/**
 * Save a value the app can live without on this phone (a sync cache).
 * On a full storage, free the stream copies and try once more. Never
 * throws: returns false when the value still could not be saved, and the
 * caller carries on with the data in memory.
 */
export function setItemWithRoom(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (err) {
    if (!isQuotaError(err)) return false
  }
  if (evictStreamCaches() === 0) return false
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/**
 * Cache one activity's stream, keeping only the STREAM_CACHE_CAP newest
 * copies. Copies written before the cap existed (not in the index) are
 * the oldest of all and go first. Never throws.
 */
export function cacheStreamBounded(key: string, value: string): void {
  try {
    const index = readIndex().filter(k => k !== key)
    index.push(key)
    const tracked = new Set(index)
    const untracked = allStreamKeys().filter(k => !tracked.has(k) && k !== key)
    const order = [...untracked, ...index]
    const drop = order.slice(0, Math.max(0, order.length - STREAM_CACHE_CAP))
    for (const k of drop) localStorage.removeItem(k)
    const kept = index.filter(k => !drop.includes(k))
    if (!drop.includes(key)) localStorage.setItem(key, value)
    localStorage.setItem(INDEX_KEY, JSON.stringify(kept))
  } catch {
    // Full even after the cap: a chart copy is not worth failing over.
  }
}
