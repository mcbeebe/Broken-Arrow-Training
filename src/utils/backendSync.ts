/**
 * Backend sync transport.
 *
 * Talks to `/api/sync` (GET/PUT) with last-write-wins semantics.
 * Stateless module-level utilities so both the background hook
 * (`useBackendSync`) and the Settings "Sync now" / "Pull from server"
 * buttons can drive the same code without racing through a React
 * context.
 */

import type { AuthSession } from './auth'
import { isPreservedKey } from './migrate'
import { isMergeableCollectionKey, mergeCollection } from './syncMerge'
import {
  listStampedKeys,
  readStamp,
  readLastUploadedStamp,
  stampKey,
  writeLastUploadedStamp,
} from './syncStamps'

/** Read lazily (not at module load) so env stubs in tests — and any
 *  future runtime configuration — take effect. */
function apiUrl(): string {
  return (import.meta.env.VITE_GARMIN_API_URL || '').replace(/\/$/, '')
}
const LAST_SYNC_KEY = '__attune_meta:__lastSync'
// Keep each PUT body comfortably under the server's 4 MB cap (which is
// itself comfortably under Vercel's 4.5 MB request-body hard limit).
// Two days of coach memory + plan edits routinely top a megabyte; this
// gives plenty of headroom while keeping individual requests fast.
const MAX_CHUNK_BYTES = 800_000

export interface RemoteItem {
  key: string
  value: string
  updatedAt: string  // ISO 8601
}

export interface RemoteState {
  items: RemoteItem[]
  serverNow: string  // ISO 8601
}

export interface PushResult {
  written: number
  skipped: number
  /** Keys the server refused (allowlist/shape). These are NOT marked
   *  uploaded — they retry, and the error surfaces in Settings → Sync. */
  rejectedKeys?: string[]
}

// ── Persistent, VISIBLE sync health (P0 postmortem) ─────────────
// Background sync used to swallow every failure at debug level — a device
// whose pushes were 100% failing showed nothing anywhere. Every failure
// (background or manual) now lands here, and Settings → Sync renders it.
export interface SyncError {
  at: number
  message: string
}

const SYNC_ERROR_KEY = '__attune_meta:__lastSyncError'
type ErrorListener = (err: SyncError | null) => void
const errorListeners = new Set<ErrorListener>()

export function getLastSyncError(): SyncError | null {
  try {
    const raw = localStorage.getItem(SYNC_ERROR_KEY)
    return raw ? (JSON.parse(raw) as SyncError) : null
  } catch {
    return null
  }
}

export function recordSyncError(message: string): void {
  const err: SyncError = { at: Date.now(), message }
  try {
    localStorage.setItem(SYNC_ERROR_KEY, JSON.stringify(err))
  } catch { /* best effort */ }
  for (const l of errorListeners) l(err)
}

export function clearSyncError(): void {
  try {
    localStorage.removeItem(SYNC_ERROR_KEY)
  } catch { /* best effort */ }
  for (const l of errorListeners) l(null)
}

export function subscribeSyncError(cb: ErrorListener): () => void {
  errorListeners.add(cb)
  return () => {
    errorListeners.delete(cb)
  }
}

/** Cross-component subscription for "last synced X ago" UI strings. */
type Listener = (ms: number | null) => void
const listeners = new Set<Listener>()

export function getLastSyncedAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_SYNC_KEY)
    if (!raw) return null
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function setLastSyncedAt(ms: number): void {
  try {
    localStorage.setItem(LAST_SYNC_KEY, String(ms))
  } catch {
    // best effort
  }
  for (const l of listeners) l(ms)
}

export function subscribeLastSyncedAt(cb: Listener): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Local notify pattern so hooks that listen for `storage` events
 *  (e.g. `useDisplayPreferences`) refresh when sync writes to their
 *  key. localStorage's native event only fires in OTHER tabs, so we
 *  synthesise one for the current tab. */
function dispatchLocalStorage(key: string, oldValue: string | null, newValue: string): void {
  try {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key,
        oldValue,
        newValue,
        storageArea: localStorage,
        url: window.location.href,
      }),
    )
  } catch {
    // jsdom / older browsers may not support the constructor; non-fatal.
  }
}

async function authedFetch(
  session: AuthSession,
  method: 'GET' | 'PUT',
  body?: unknown,
): Promise<Response> {
  const base = apiUrl()
  if (!base) throw new Error('API URL not configured')
  return fetch(`${base}/api/sync`, {
    method,
    headers: {
      'Authorization': `Bearer ${session.token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

async function withBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (attempt < maxAttempts - 1) {
        const delay = 500 * Math.pow(2, attempt)
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  throw lastErr
}

export async function fetchServerState(session: AuthSession): Promise<RemoteState> {
  return withBackoff(async () => {
    const res = await authedFetch(session, 'GET')
    if (!res.ok) throw new Error(`sync GET failed: ${res.status}`)
    return (await res.json()) as RemoteState
  })
}

/** Boot hydrate: pull server state and merge into local. For each
 *  incoming key, write iff the local copy is absent or the server
 *  timestamp is strictly newer. Stamps + lastUploaded both anchor to
 *  the server timestamp so the next push doesn't re-upload what we
 *  just received. */
export async function hydrateFromServer(session: AuthSession): Promise<{ pulled: number }> {
  const state = await fetchServerState(session)
  let pulled = 0
  for (const item of state.items) {
    const serverMs = Date.parse(item.updatedAt)
    if (!Number.isFinite(serverMs)) continue
    const localRaw = localStorage.getItem(item.key)
    const localStamp = readStamp(item.key)

    // Keyed-collection keys (e.g. `ba_manual_logs_<id>`) are written from
    // multiple devices and must be UNIONED, not last-write-wins replaced —
    // otherwise the device that syncs last erases the other's entries (the
    // "my journal note never showed up on my phone" bug). We merge whenever
    // the server's copy differs, regardless of which side is newer, so
    // entries unique to either device propagate. Stamp the merged result
    // with `now` (and DON'T advance lastUploaded) so the next push ships the
    // union back to the server and the other device converges too.
    if (localRaw !== null && isMergeableCollectionKey(item.key)) {
      const merged = mergeCollection(localRaw, item.value, serverMs > localStamp)
      if (merged && merged.changed) {
        try {
          localStorage.setItem(item.key, merged.value)
          stampKey(item.key, Date.now())
          dispatchLocalStorage(item.key, localRaw, merged.value)
          pulled++
        } catch {
          // quota / disabled storage — skip
        }
      }
      // A mergeable key never falls through to the replace path below.
      if (merged) continue
      // mergeCollection returned null (unexpected non-object shape) — fall
      // back to the standard LWW handling.
    }

    // Last-write-wins by timestamp: pull only when the server's copy is
    // strictly newer than our last local write. A key that is absent
    // locally but still carries a stamp >= the server's is an intentional
    // local deletion (a tombstone — e.g. "Redo onboarding" clears
    // `ba_onboarding`). Resurrecting it would warp the athlete out of an
    // in-progress redo and back into their old plan. Genuinely fresh
    // devices have no stamp (localStamp === 0), so server data still
    // hydrates normally. The explicit "Pull from server" button uses
    // `pullFromServer`, which overwrites unconditionally.
    const shouldWrite = serverMs > localStamp
    if (!shouldWrite) continue
    try {
      localStorage.setItem(item.key, item.value)
      stampKey(item.key, serverMs)
      writeLastUploadedStamp(item.key, serverMs)
      dispatchLocalStorage(item.key, localRaw, item.value)
      pulled++
    } catch {
      // quota / disabled storage — skip
    }
  }
  if (pulled > 0) setLastSyncedAt(Date.now())
  return { pulled }
}

/** Replace-local: take everything on the server and write it over the
 *  local copy unconditionally, bumping stamps to match. Used by the
 *  Settings "Pull from server (replaces local)" button. */
export async function pullFromServer(session: AuthSession): Promise<{ pulled: number }> {
  const state = await fetchServerState(session)
  let pulled = 0
  for (const item of state.items) {
    const serverMs = Date.parse(item.updatedAt)
    if (!Number.isFinite(serverMs)) continue
    try {
      const oldValue = localStorage.getItem(item.key)
      localStorage.setItem(item.key, item.value)
      stampKey(item.key, serverMs)
      writeLastUploadedStamp(item.key, serverMs)
      dispatchLocalStorage(item.key, oldValue, item.value)
      pulled++
    } catch {
      // skip
    }
  }
  setLastSyncedAt(Date.now())
  return { pulled }
}

/** Ship a single batch of items. Wraps the auth + backoff layer so
 *  `pushAll` can call this once per chunk. On non-2xx, surfaces the
 *  server's response body in the thrown error so the UI can show the
 *  actual rejection reason (which key tripped the allowlist, etc.)
 *  rather than the bare status code. */
async function pushChunk(session: AuthSession, items: RemoteItem[]): Promise<PushResult> {
  return withBackoff(async () => {
    const res = await authedFetch(session, 'PUT', { items })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`sync PUT failed: ${res.status}${body ? ` — ${body}` : ''}`)
    }
    const parsed = (await res.json()) as PushResult & { rejected?: { key: string | null; reason: string }[] }
    return {
      written: parsed.written ?? 0,
      skipped: parsed.skipped ?? 0,
      rejectedKeys: (parsed.rejected ?? [])
        .map(r => r.key)
        .filter((k): k is string => typeof k === 'string'),
    }
  })
}

/** Gather every stamped key whose stamp has advanced past its last
 *  uploaded marker, build a PUT body, and ship it. Splits into chunks
 *  so a giant `ba_coach_memory_v1:*` value doesn't blow past the
 *  server body cap. Updates the lastUploaded markers per-chunk so a
 *  partial failure mid-batch still records progress for the chunks
 *  that did make it through. */
export async function pushAll(session: AuthSession): Promise<PushResult> {
  const pending: RemoteItem[] = []
  const seen = new Set<string>()

  // First pass: keys with existing stamps (the normal "write-then-
  // sync" flow). Anything the instrumented hooks touched since the
  // new bundle loaded lives here.
  for (const key of listStampedKeys()) {
    seen.add(key)
    if (!isPreservedKey(key)) continue
    const stamp = readStamp(key)
    const lastUp = readLastUploadedStamp(key)
    if (stamp <= lastUp) continue
    const value = localStorage.getItem(key)
    if (value === null) continue
    pending.push({
      key,
      value,
      updatedAt: new Date(stamp).toISOString(),
    })
  }

  // Second pass: allowlisted localStorage entries that have NO stamp.
  // These are usually edits that pre-date the sync layer — written by
  // the old bundle, or by an uninstrumented write path. Without this
  // backfill the data is invisible to the sync system until the
  // athlete touches each item again. Stamp with "now" so a single
  // Sync-now recovers a device that's been editing offline for days.
  //
  // Snapshot the keys BEFORE we start stamping, because `stampKey`
  // calls `localStorage.setItem` which mutates the same collection
  // we're iterating — in Safari that shifts indices mid-loop and
  // silently skips original entries. The two-step (snapshot, then
  // mutate) keeps the loop deterministic.
  const now = Date.now()
  const allKeys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k) allKeys.push(k)
  }
  let backfilled = 0
  let scanned = 0
  for (const key of allKeys) {
    if (seen.has(key)) continue
    if (!isPreservedKey(key)) continue
    scanned++
    const value = localStorage.getItem(key)
    if (value === null) continue
    stampKey(key, now)
    pending.push({
      key,
      value,
      updatedAt: new Date(now).toISOString(),
    })
    backfilled++
  }
  console.debug(
    `[sync] pushAll: stamped=${seen.size} ` +
    `total_localStorage=${allKeys.length} ` +
    `allowlisted_unstamped=${scanned} backfilled=${backfilled} ` +
    `pending=${pending.length}`,
  )

  if (pending.length === 0) return { written: 0, skipped: 0 }

  let written = 0
  let skipped = 0
  const allRejected: string[] = []
  let batch: RemoteItem[] = []
  let batchBytes = 0

  const flush = async () => {
    if (batch.length === 0) return
    const r = await pushChunk(session, batch)
    written += r.written
    skipped += r.skipped
    const rejected = new Set(r.rejectedKeys ?? [])
    for (const k of rejected) allRejected.push(k)
    // Mark uploaded per-chunk so a later chunk failing doesn't force a
    // re-push of the chunks that already landed. Rejected keys are NOT
    // marked — they retry every sync until the server accepts them, and
    // the failure stays visible instead of silently vanishing.
    for (const item of batch) {
      if (rejected.has(item.key)) continue
      writeLastUploadedStamp(item.key, Date.parse(item.updatedAt))
    }
    batch = []
    batchBytes = 0
  }

  try {
    for (const item of pending) {
      // Per-item size approximated by its JSON length; close enough
      // because `value` (the raw localStorage string) dominates.
      const itemBytes = JSON.stringify(item).length
      if (batchBytes > 0 && batchBytes + itemBytes > MAX_CHUNK_BYTES) {
        await flush()
      }
      batch.push(item)
      batchBytes += itemBytes
    }
    await flush()
  } catch (e) {
    recordSyncError(e instanceof Error ? e.message : 'sync push failed')
    throw e
  }

  if (allRejected.length > 0) {
    recordSyncError(
      `Server refused ${allRejected.length} item(s): ${[...new Set(allRejected)].slice(0, 3).join(', ')}` +
      (allRejected.length > 3 ? '…' : '') + ' — these retry each sync; if this persists, it needs a fix.',
    )
  } else {
    clearSyncError()
  }
  setLastSyncedAt(Date.now())
  return { written, skipped, rejectedKeys: allRejected }
}
