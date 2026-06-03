/**
 * Per-key write timestamps for the backend sync layer.
 *
 * The cross-device sync (`useBackendSync`) needs to know which local
 * keys have changed since the last upload, and last-write-wins needs a
 * per-key timestamp to compare against the server's `updated_at`.
 * Hooks call `stampKey(key)` immediately after each
 * `localStorage.setItem(key, value)` so the stamp is monotonic with
 * the underlying write.
 *
 * Stamps live in their own dedicated keyspace (`__attune_meta:__stamp:`)
 * so they never collide with user data and they're invisible to the
 * preserve-list allowlist that gates sync uploads. The lastUpload
 * mirror (`__attune_meta:__lastUpload:`) lets the sync hook skip
 * re-uploading rows that haven't moved since the previous push, even
 * across page reloads.
 */

const STAMP_PREFIX = '__attune_meta:__stamp:'
const LAST_UPLOAD_PREFIX = '__attune_meta:__lastUpload:'

/** Record that `key` was just written. Pass the optional `at` (ms since
 *  epoch) when seeding from a server timestamp; defaults to `Date.now()`
 *  for the normal local-write path. */
export function stampKey(key: string, at: number = Date.now()): void {
  try {
    localStorage.setItem(STAMP_PREFIX + key, String(at))
  } catch {
    // Storage quota or disabled — best-effort; sync will fall back to
    // coarse `Date.now()` at sync time for un-stamped keys.
  }
}

/** Last-write timestamp for `key` (ms since epoch). Returns 0 when
 *  unknown so callers can treat "no stamp" as "older than anything". */
export function readStamp(key: string): number {
  try {
    const raw = localStorage.getItem(STAMP_PREFIX + key)
    if (!raw) return 0
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

/** Every data key that currently has a stamp. The sync hook walks this
 *  list (plus the preserve allowlist) to decide what to upload. */
export function listStampedKeys(): string[] {
  const out: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(STAMP_PREFIX)) {
        out.push(k.slice(STAMP_PREFIX.length))
      }
    }
  } catch {
    // ignore
  }
  return out
}

/** What we last successfully uploaded for `key`. The sync hook reads
 *  this when deciding whether `key` has work to send, both within a
 *  session (in-memory mirror) and across reloads (this localStorage
 *  copy). */
export function readLastUploadedStamp(key: string): number {
  try {
    const raw = localStorage.getItem(LAST_UPLOAD_PREFIX + key)
    if (!raw) return 0
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

/** Persist that we successfully uploaded `key` at timestamp `at`. */
export function writeLastUploadedStamp(key: string, at: number): void {
  try {
    localStorage.setItem(LAST_UPLOAD_PREFIX + key, String(at))
  } catch {
    // best effort
  }
}
