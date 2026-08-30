/**
 * Per-key merge strategies for the cross-device sync layer.
 *
 * The generic `/api/sync` transport is last-write-wins at the whole-key
 * level: a PUT replaces the server's row, a pull replaces the local copy.
 * That's correct for scalar keys (theme, a single config blob), but it
 * silently loses data for keys that hold a KEYED COLLECTION written from
 * more than one device.
 *
 * `ba_manual_logs_<id>` is the worst offender: it's a single JSON object
 * `{ [dayLabel]: ActualWorkout }` holding every workout note the athlete
 * has ever written. Journal on the phone Monday, journal on the laptop
 * Tuesday, and whichever device syncs last overwrites the whole blob —
 * erasing the other device's notes. (The coach copy survives because it's
 * persisted server-side by the coach API, not through `/api/sync`; the
 * workout note has no such backstop, so the loss is visible as "I typed a
 * journal entry on my computer but it never showed up on my phone.")
 *
 * For these keys we union the two objects by sub-key instead of replacing.
 * Distinct entries (different day labels — the common case) all survive.
 * A genuine conflict on the SAME sub-key is resolved toward the blob with
 * the newer overall timestamp; without per-entry timestamps that's the
 * best signal we have, and same-day edits from two devices are rare.
 */

/** localStorage keys whose value is a keyed-object collection that must be
 *  unioned across devices rather than last-write-wins replaced. Matches the
 *  athlete-scoped form (`<prefix>_<id>` or `<prefix>:<id>`). */
export function isMergeableCollectionKey(key: string): boolean {
  return (
    key.startsWith('ba_manual_logs_') ||
    key.startsWith('ba_manual_logs:') ||
    // Free-standing journal entries — same multi-device union concern as
    // manual logs: write a note on the phone, another on the laptop, and a
    // last-write-wins replace would erase one. Union by entry id instead.
    key.startsWith('ba_journal_notes_') ||
    key.startsWith('ba_journal_notes:')
  )
}

function parseObject(raw: string | null): Record<string, unknown> | null {
  if (raw == null) return null
  try {
    const parsed = JSON.parse(raw)
    // Plain objects only. Arrays / primitives fall back to LWW so legacy
    // or unexpected shapes never get silently mangled by a union.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // not JSON — fall back to LWW
  }
  return null
}

export interface CollectionMerge {
  /** The unioned JSON string. */
  value: string
  /** True when the union differs from the local copy (i.e. the pull
   *  actually brought in something new and we should persist + re-push). */
  changed: boolean
}

/**
 * Union two keyed-collection blobs. Returns `null` when either side isn't a
 * plain object, signalling the caller to fall back to last-write-wins.
 *
 * The result preserves `localRaw`'s key order (so an unchanged merge
 * re-serialises byte-identically and we can cheaply detect "nothing new"),
 * then layers in entries from the server. On a same-key conflict the newer
 * blob — per the overall key timestamps — wins.
 */
export function mergeCollection(
  localRaw: string | null,
  serverRaw: string,
  serverNewer: boolean,
): CollectionMerge | null {
  const local = parseObject(localRaw)
  const server = parseObject(serverRaw)
  if (!server) return null
  // No local copy yet → just take the server's (still a valid object).
  if (!local) return { value: serverRaw, changed: localRaw !== serverRaw }

  const merged: Record<string, unknown> = { ...local }
  for (const [k, v] of Object.entries(server)) {
    if (!(k in merged) || serverNewer) merged[k] = v
  }

  const value = JSON.stringify(merged)
  return { value, changed: value !== localRaw }
}

/**
 * Keys that hold the ACTIVE onboarding config — the race, goal, method the
 * whole plan regenerates from. Deliberately excludes the redo flag and the
 * pre-redo snapshot, which share the `ba_onboarding_` prefix but are not the
 * live config.
 */
export function isSyncedConfigKey(key: string): boolean {
  if (key === 'ba_onboarding') return true
  if (!key.startsWith('ba_onboarding_')) return false
  const suffix = key.slice('ba_onboarding_'.length)
  return !suffix.startsWith('redo') && !suffix.startsWith('prev')
}

/**
 * A key's CONTENT recency — when the value was actually authored, not when it
 * was last pushed. Returns null for keys (and shapes) that carry no such
 * signal, in which case the caller keeps its ordinary push-timestamp LWW.
 *
 * This exists because the sync layer's "which is newer" test uses the push
 * timestamp, and a stale device can re-upload month-old content with a fresh
 * push time — which is exactly how an old training plan overwrote a current
 * one. The onboarding config carries `completedAt`; that is the honest
 * recency, and it must beat any push stamp so an OLDER config can never
 * clobber a NEWER one.
 */
export function contentVersion(key: string, raw: string | null): number | null {
  if (raw == null) return null
  if (isSyncedConfigKey(key)) {
    try {
      const c = JSON.parse(raw) as { completedAt?: unknown }
      const t = typeof c?.completedAt === 'string' ? Date.parse(c.completedAt) : NaN
      return Number.isFinite(t) ? t : null
    } catch {
      return null
    }
  }
  return null
}
