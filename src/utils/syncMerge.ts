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
    key.startsWith('ba_journal_notes:') ||
    // The structural plan-edit op-log. An ARRAY rather than a keyed object,
    // and the whole athlete's edit history in one key: under last-write-wins
    // a coach proposal accepted on the phone and a hand edit made on the
    // laptop don't merge — whichever device syncs second replaces the other's
    // entire log. Unioned by entry id; see `mergeArrayById`.
    key.startsWith('ba_plan_edits_') ||
    key.startsWith('ba_plan_edits:') ||
    // Day swaps and locked days: the same single-key-holds-everything shape
    // as the plan-edit log, and the same loss under last-write-wins. Both
    // record removals as tombstones (SwapReset, LockRecord.unlocked) so the
    // union cannot resurrect a reset week or re-lock an opened day.
    key.startsWith('ba_day_swaps_') ||
    key.startsWith('ba_day_swaps:') ||
    key.startsWith('ba_locked_days_') ||
    key.startsWith('ba_locked_days:')
  )
}

/** Identity of one array entry for the union.
 *
 *  `id` when the entry has one. Day swaps written before `id` existed have
 *  none, and there the identity has to come from the content — a duplicated
 *  swap is not a harmless repeat: `applySwapsToWeeks` replays swaps in
 *  sequence, so applying one twice swaps the days back and silently undoes
 *  it. Falling back to a positional key would do exactly that. Must stay in
 *  step with `swapKey` in hooks/useDaySwap.
 *
 *  Anything else with no id keys by side and position, which keeps both
 *  sides' entries rather than collapsing them together. */
function entryKey(e: unknown, i: number, side: string, storageKey?: string): string {
  const id = (e as { id?: unknown })?.id
  if (typeof id === 'string' && id) return id
  if (storageKey?.startsWith('ba_day_swaps')) {
    const s = e as { weekNum?: number; fromIndex?: number; toIndex?: number; at?: number }
    return `${s.weekNum}:${s.fromIndex ?? 'r'}:${s.toIndex ?? 'r'}:${s.at ?? 0}`
  }
  return `${side}:${i}`
}

/** Union two id-keyed ARRAYS.
 *
 *  The op-log is append-only by construction — removals are recorded as
 *  tombstone entries rather than as absences (see the `revoke` op in types),
 *  which is precisely what makes a union safe here: an entry missing from one
 *  side means that side never saw it, never that it was deleted. So the union
 *  is every entry from both sides, deduped by `id`.
 *
 *  Order is not preserved from either side — the log is replayed in
 *  `appliedAt` order, so the array's own order carries no meaning. Sorting the
 *  result makes the merge deterministic: both devices converge on the same
 *  array, which matters because each re-pushes its merged copy.
 *
 *  On a same-id conflict (the same entry mutated on both devices — a day swap
 *  re-anchoring an edit is the realistic case) the newer blob wins, matching
 *  the keyed-object path. */
function mergeArrayById(
  local: unknown[],
  server: unknown[],
  serverNewer: boolean,
  storageKey?: string,
): string {
  const byId = new Map<string, unknown>()
  const keyOf = (e: unknown, i: number, side: string): string =>
    entryKey(e, i, side, storageKey)
  const first = serverNewer ? local : server
  const second = serverNewer ? server : local
  const firstSide = serverNewer ? 'l' : 's'
  const secondSide = serverNewer ? 's' : 'l'
  first.forEach((e, i) => byId.set(keyOf(e, i, firstSide), e))
  // The second pass wins ties, so it is whichever side is newer.
  second.forEach((e, i) => byId.set(keyOf(e, i, secondSide), e))

  const merged = [...byId.values()]
  const stamp = (e: unknown): number => {
    const r = e as { appliedAt?: number; at?: number }
    return r?.appliedAt ?? r?.at ?? 0
  }
  merged.sort((a, b) => {
    const at = stamp(a)
    const bt = stamp(b)
    if (at !== bt) return at - bt
    const ai = String((a as { id?: unknown })?.id ?? '')
    const bi = String((b as { id?: unknown })?.id ?? '')
    return ai < bi ? -1 : ai > bi ? 1 : 0
  })
  return JSON.stringify(merged)
}

function parseArray(raw: string | null): unknown[] | null {
  if (raw == null) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function parseObject(raw: string | null): Record<string, unknown> | null {
  if (raw == null) return null
  try {
    const parsed = JSON.parse(raw)
    // Plain objects only; arrays are handled by `parseArray` above, and
    // primitives fall back to LWW so an unexpected shape is never silently
    // mangled by a union.
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
 * Union two collection blobs — a keyed object, or an id-keyed array. Returns
 * `null` when neither shape applies, signalling the caller to fall back to
 * last-write-wins.
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
  /** The localStorage key. Only needed for array shapes whose entries may
   *  have no `id` (day swaps written before ids existed) — see `entryKey`. */
  storageKey?: string,
): CollectionMerge | null {
  // Array-shaped collections (the plan-edit op-log) union by entry id.
  const serverArr = parseArray(serverRaw)
  if (serverArr) {
    const localArr = parseArray(localRaw)
    if (!localArr) return { value: serverRaw, changed: localRaw !== serverRaw }
    const value = mergeArrayById(localArr, serverArr, serverNewer, storageKey)
    return { value, changed: value !== localRaw }
  }

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
