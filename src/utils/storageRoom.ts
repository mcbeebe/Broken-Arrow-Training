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
 * Now: stream caches are capped by count and by size, a write that hits
 * the quota frees stream copies oldest-first until it fits, and no sync
 * cache write throws.
 *
 * Field bug (2026-10-06): the app itself died on "Something went wrong —
 * QuotaExceededError" when the athlete swapped two days: the swap was
 * saved by a bare setItem inside a React state updater, so the throw
 * landed in render. Storage had filled past the stream cap with coach
 * insight copies (a fresh set every day, only ever read for 48 h) and
 * one briefing log per day (only today's is read), neither ever deleted.
 * Now those are swept at boot, a full storage frees them after the
 * streams, and app writes go through setItemWithRoom so a full phone
 * means "not saved here", never a dead app.
 */

/** Stream copies kept on the phone; older ones re-download on demand. */
export const STREAM_CACHE_CAP = 20
/** …and at most this many characters of them (JSON is ASCII: ~1 byte
 *  each in WebKit). One GPS hour is ~190 K, so 20 long runs alone would
 *  otherwise fill Safari's ~5 MB. */
export const STREAM_CACHE_BUDGET = 1_500_000
const INDEX_KEY = 'ba_stream_cache_index_v1'

/** What the athlete reads when even a freed-up storage can't take a save. */
export const STORAGE_FULL_MESSAGE =
  'Synced, but this phone’s storage for attune.coach is full, so a copy couldn’t be saved here.'

/** Coach insight copies (useCoachInsight). Read only while < 48 h old. */
export const INSIGHT_CACHE_PREFIX = 'ba_coach_insight_v1:'
/** Must match useCoachInsight's MAX_AGE_MS: past it a copy is never read. */
export const INSIGHT_CACHE_MAX_AGE_MS = 48 * 60 * 60 * 1000
/** One key per day (useDailyBriefingLog); only today's is ever read. */
export const BRIEFING_LOG_PREFIX = 'ba_coach_briefing_log_v1:'

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

function keysWhere(match: (key: string) => boolean): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && match(k)) keys.push(k)
  }
  return keys
}

function allStreamKeys(): string[] {
  return keysWhere(isStreamCacheKey)
}

/** When an insight copy was made; 0 (oldest of all) when unreadable. */
function insightGeneratedAt(key: string): number {
  try {
    const at = JSON.parse(localStorage.getItem(key) ?? 'null')?.generatedAt
    return typeof at === 'number' && Number.isFinite(at) ? at : 0
  } catch {
    return 0
  }
}

/** Insight copies oldest-first. All regenerable from the coach API. */
function insightKeysOldestFirst(): string[] {
  return keysWhere(k => k.startsWith(INSIGHT_CACHE_PREFIX))
    .map(k => ({ k, at: insightGeneratedAt(k) }))
    .sort((a, b) => a.at - b.at)
    .map(e => e.k)
}

/** The `YYYY-MM-DD` a briefing-log key belongs to, or null. */
function briefingLogDate(key: string): string | null {
  if (!key.startsWith(BRIEFING_LOG_PREFIX)) return null
  const m = /:(\d{4}-\d{2}-\d{2})$/.exec(key)
  return m ? m[1] : null
}

function localDay(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Briefing logs from before today (local), oldest-first. */
function pastBriefingKeysOldestFirst(now: number): string[] {
  const today = localDay(now)
  return keysWhere(k => {
    const d = briefingLogDate(k)
    return d !== null && d < today
  }).sort((a, b) => (briefingLogDate(a)! < briefingLogDate(b)! ? -1 : 1))
}

/**
 * Delete caches that can never be read again: insight copies past their
 * 48 h read window (or unreadable), and briefing logs older than
 * yesterday (yesterday is kept for a clock or timezone that disagrees
 * about midnight). Run once at boot. Never throws; returns how many keys
 * were removed.
 */
export function sweepExpiredCaches(now: number = Date.now()): number {
  let n = 0
  try {
    const yesterday = localDay(now - 24 * 60 * 60 * 1000)
    const dead = [
      ...keysWhere(k => k.startsWith(INSIGHT_CACHE_PREFIX))
        .filter(k => now - insightGeneratedAt(k) >= INSIGHT_CACHE_MAX_AGE_MS),
      ...keysWhere(k => {
        const d = briefingLogDate(k)
        return d !== null && d < yesterday
      }),
    ]
    for (const k of dead) {
      localStorage.removeItem(k)
      n++
    }
  } catch {
    // Storage unavailable — nothing to sweep.
  }
  return n
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

/** Stream keys oldest-first: copies from before the cap (not in the
 *  index) first, then the index in write order. Index entries whose copy
 *  is gone (cleared elsewhere) are skipped. */
function streamKeysOldestFirst(): string[] {
  const present = allStreamKeys()
  const presentSet = new Set(present)
  const index = readIndex().filter(k => presentSet.has(k))
  const tracked = new Set(index)
  return [...present.filter(k => !tracked.has(k)), ...index]
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
 * Save a value. On a full storage, free regenerable copies until it fits:
 * stream copies oldest-first (recent ones feed grading and the Monday
 * review's HR drift, so they go last), then coach insight copies
 * oldest-first, then briefing logs from before today. Never throws:
 * returns false when it still could not be saved, and the caller carries
 * on with the data in memory.
 */
export function setItemWithRoom(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (err) {
    if (!isQuotaError(err)) return false
  }
  try {
    const victims = [
      ...streamKeysOldestFirst(),
      ...insightKeysOldestFirst(),
      ...pastBriefingKeysOldestFirst(Date.now()),
    ].filter(k => k !== key)
    for (const victim of victims) {
      localStorage.removeItem(victim)
      try {
        localStorage.setItem(key, value)
        return true
      } catch (err) {
        if (!isQuotaError(err)) return false
      }
    }
  } catch {
    // Storage unavailable.
  }
  return false
}

/**
 * setItemWithRoom for a write that later steps depend on: throws when it
 * still could not be saved, so a multi-step update (save the new plan,
 * THEN drop the old plan's edits) stops instead of half-applying.
 */
export function setItemWithRoomOrThrow(key: string, value: string): void {
  if (!setItemWithRoom(key, value)) {
    throw new Error(`Could not save ${key}: this phone's storage is full`)
  }
}

/**
 * Cache one activity's stream, keeping only the STREAM_CACHE_CAP newest
 * copies. Copies written before the cap existed (not in the index) are
 * the oldest of all and go first. Never throws.
 */
export function cacheStreamBounded(key: string, value: string): void {
  try {
    if (value.length > STREAM_CACHE_BUDGET) return
    // Oldest-first, this copy last (it is the newest).
    const order = [...streamKeysOldestFirst().filter(k => k !== key), key]
    const size = (k: string) => (k === key ? value.length : (localStorage.getItem(k)?.length ?? 0))
    let total = order.reduce((n, k) => n + size(k), 0)
    let count = order.length
    const drop: string[] = []
    for (const k of order) {
      if (k === key || (count <= STREAM_CACHE_CAP && total <= STREAM_CACHE_BUDGET)) break
      drop.push(k)
      total -= size(k)
      count--
    }
    for (const k of drop) localStorage.removeItem(k)
    const dropped = new Set(drop)
    const index = order.filter(k => !dropped.has(k))
    if (!setItemWithRoom(key, value)) return
    localStorage.setItem(INDEX_KEY, JSON.stringify(index))
  } catch {
    // Full even after the cap: a chart copy is not worth failing over.
  }
}
