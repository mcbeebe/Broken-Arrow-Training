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
import { isMergeableCollectionKey, mergeCollection, contentVersion } from './syncMerge'
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
// Chunk sizing (P0 postmortem, part two — the 504): a first-sync or
// post-outage backlog can be megabytes across hundreds of keys. Each
// PUT must finish — mobile upload included — inside the serverless
// function's time budget, and progress is stamped per chunk, so small
// chunks make the backlog drain incrementally instead of timing out as
// one giant request. A single value larger than the byte cap still
// ships alone; the server's one-round-trip batched write handles it.
const MAX_CHUNK_BYTES = 300_000
const MAX_CHUNK_ITEMS = 120

// Statuses where re-sending the identical payload can't succeed but a
// smaller one can: the function ran out of time mid-batch (504/408) or
// the body tripped a size limit (413). 502/503 ride along — a gateway
// hiccup heals on the retry the split provides. Deliberately NOT 500
// (a deterministic server bug would turn splitting into a request
// storm) and not network-layer failures (offline is offline).
const SPLIT_STATUSES = new Set([408, 413, 502, 503, 504])

class HttpError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

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
  shouldRetry: (e: unknown) => boolean = () => true,
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (!shouldRetry(e)) throw e
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
      const merged = mergeCollection(localRaw, item.value, serverMs > localStamp, item.key)
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

    // Content-recency guard (the data-loss fix). The test above compares
    // PUSH timestamps, but a stale device can re-upload old content with a
    // fresh push time — which is how a month-old plan overwrote a current
    // one. When a key carries its own authored-at signal (the config's
    // completedAt), never let OLDER content win, however new its stamp
    // looks. Absent on either side → fall back to the timestamp LWW above.
    const localVer = contentVersion(item.key, localRaw)
    const serverVer = contentVersion(item.key, item.value)
    if (localVer != null && serverVer != null && serverVer < localVer) continue

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
  // A multi-item chunk that hits a split-eligible status must NOT burn
  // backoff retries on the identical payload — pushChunkResilient
  // halves it instead. A single item can't split, so it keeps full
  // retries as its only recourse.
  const splitEligible = items.length > 1
  return withBackoff(
    async () => {
      const res = await authedFetch(session, 'PUT', { items })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new HttpError(`sync PUT failed: ${res.status}${body ? ` — ${body}` : ''}`, res.status)
      }
      const parsed = (await res.json()) as PushResult & { rejected?: { key: string | null; reason: string }[] }
      return {
        written: parsed.written ?? 0,
        skipped: parsed.skipped ?? 0,
        rejectedKeys: (parsed.rejected ?? [])
          .map(r => r.key)
          .filter((k): k is string => typeof k === 'string'),
      }
    },
    3,
    e => !(splitEligible && e instanceof HttpError && SPLIT_STATUSES.has(e.status)),
  )
}

/** Push a chunk; when the server times out or rejects the size
 *  (SPLIT_STATUSES), halve and recurse — down to one item per request —
 *  so a backlog that can't clear the function's time budget in one
 *  request still drains in smaller pieces. `onSuccess` fires per landed
 *  sub-chunk so progress persists even if a later piece fails.
 *  Network-layer errors (no HTTP status) do NOT split: offline is
 *  offline, and halving would just multiply dead requests. */
async function pushChunkResilient(
  session: AuthSession,
  items: RemoteItem[],
  onSuccess: (sent: RemoteItem[], r: PushResult) => void,
): Promise<PushResult> {
  try {
    const r = await pushChunk(session, items)
    onSuccess(items, r)
    return r
  } catch (e) {
    if (items.length > 1 && e instanceof HttpError && SPLIT_STATUSES.has(e.status)) {
      const mid = Math.ceil(items.length / 2)
      const a = await pushChunkResilient(session, items.slice(0, mid), onSuccess)
      const b = await pushChunkResilient(session, items.slice(mid), onSuccess)
      return {
        written: a.written + b.written,
        skipped: a.skipped + b.skipped,
        rejectedKeys: [...(a.rejectedKeys ?? []), ...(b.rejectedKeys ?? [])],
      }
    }
    throw e
  }
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
    // Stamp an unstamped entry with its own CONTENT time when it has one
    // (the config's completedAt), not `now`. Otherwise an old config that
    // was never stamped uploads as brand-new and clobbers every device's
    // current plan — the exact backfill that caused the plan revert.
    const stampAt = contentVersion(key, value) ?? now
    stampKey(key, stampAt)
    pending.push({
      key,
      value,
      updatedAt: new Date(stampAt).toISOString(),
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
    const items = batch
    batch = []
    batchBytes = 0
    const r = await pushChunkResilient(session, items, (sent, res) => {
      const rejected = new Set(res.rejectedKeys ?? [])
      for (const k of rejected) allRejected.push(k)
      // Mark uploaded per landed (sub-)chunk so a later piece failing
      // doesn't force a re-push of what already made it. Rejected keys
      // are NOT marked — they retry every sync until the server accepts
      // them, and the failure stays visible instead of silently vanishing.
      for (const item of sent) {
        if (rejected.has(item.key)) continue
        writeLastUploadedStamp(item.key, Date.parse(item.updatedAt))
      }
    })
    written += r.written
    skipped += r.skipped
  }

  try {
    for (const item of pending) {
      // Per-item size approximated by its JSON length; close enough
      // because `value` (the raw localStorage string) dominates.
      const itemBytes = JSON.stringify(item).length
      if (batchBytes > 0 && (batchBytes + itemBytes > MAX_CHUNK_BYTES || batch.length >= MAX_CHUNK_ITEMS)) {
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
