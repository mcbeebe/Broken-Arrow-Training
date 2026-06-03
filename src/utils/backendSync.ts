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
import {
  listStampedKeys,
  readStamp,
  readLastUploadedStamp,
  stampKey,
  writeLastUploadedStamp,
} from './syncStamps'

const API_URL = (import.meta.env.VITE_GARMIN_API_URL || '').replace(/\/$/, '')
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
  if (!API_URL) throw new Error('API URL not configured')
  return fetch(`${API_URL}/api/sync`, {
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
    const shouldWrite = localRaw === null || serverMs > localStamp
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
    return (await res.json()) as PushResult
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
  for (const key of listStampedKeys()) {
    // Defense in depth: the server rejects non-allowlisted keys with
    // 400, but we filter client-side too so a stale stamp on a
    // regenerable-cache key (Garmin streams, Strava activities) can't
    // poison a whole chunk. The two allowlists are required to stay in
    // lockstep — `isPreservedKey` is the TS source of truth that
    // `api/_sync/allowlist.py` mirrors.
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
  if (pending.length === 0) return { written: 0, skipped: 0 }

  let written = 0
  let skipped = 0
  let batch: RemoteItem[] = []
  let batchBytes = 0

  const flush = async () => {
    if (batch.length === 0) return
    const r = await pushChunk(session, batch)
    written += r.written
    skipped += r.skipped
    // Mark uploaded per-chunk so a later chunk failing doesn't force a
    // re-push of the chunks that already landed.
    for (const item of batch) {
      writeLastUploadedStamp(item.key, Date.parse(item.updatedAt))
    }
    batch = []
    batchBytes = 0
  }

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

  setLastSyncedAt(Date.now())
  return { written, skipped }
}
