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
