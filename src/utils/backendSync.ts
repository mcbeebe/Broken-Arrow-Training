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
import {
  listStampedKeys,
  readStamp,
  readLastUploadedStamp,
  stampKey,
  writeLastUploadedStamp,
} from './syncStamps'

const API_URL = (import.meta.env.VITE_GARMIN_API_URL || '').replace(/\/$/, '')
const LAST_SYNC_KEY = '__attune_meta:__lastSync'

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

/** Gather every stamped key whose stamp has advanced past its last
 *  uploaded marker, build a PUT body, and ship it. Updates the
 *  lastUploaded markers on success so a no-op push next tick costs
 *  nothing. */
export async function pushAll(session: AuthSession): Promise<PushResult> {
  const items: RemoteItem[] = []
  for (const key of listStampedKeys()) {
    const stamp = readStamp(key)
    const lastUp = readLastUploadedStamp(key)
    if (stamp <= lastUp) continue
    const value = localStorage.getItem(key)
    if (value === null) continue
    items.push({
      key,
      value,
      updatedAt: new Date(stamp).toISOString(),
    })
  }
  if (items.length === 0) return { written: 0, skipped: 0 }

  const result = await withBackoff(async () => {
    const res = await authedFetch(session, 'PUT', { items })
    if (!res.ok) throw new Error(`sync PUT failed: ${res.status}`)
    return (await res.json()) as PushResult
  })

  // Mark every shipped key as uploaded — both successful writes and
  // server-rejected stale rows are now reconciled with the server's
  // view, so the next push has no reason to re-send them.
  for (const item of items) {
    writeLastUploadedStamp(item.key, Date.parse(item.updatedAt))
  }
  setLastSyncedAt(Date.now())
  return result
}
