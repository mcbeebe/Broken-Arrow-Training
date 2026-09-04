import { useState, useCallback, useEffect, useMemo } from 'react'
import type {
  TrainingWeek,
  PlanEdit,
  PlanEditOp,
  PlanEditOpInput,
  PlanEditRevokeTarget,
  DayUpdates,
} from '../types'
import { stampKey } from '../utils/syncStamps'

/**
 * Structural plan edits as an ordered op-log replayed over the immutable
 * base plan. Generalizes the old single-day `usePlanOverrides`: the coach
 * (or a manual edit) can now add/delete/update at the day AND week level,
 * and a single coach proposal can carry many ops applied + undone as one
 * batch.
 *
 * The base plan is never mutated — `applyEditsToWeeks` derives the working
 * plan on every render, so undo is just "drop the batch" and reset is
 * "drop everything."
 */

const STORAGE_KEY = 'ba_plan_edits'
const LEGACY_OVERRIDES_KEY = 'ba_plan_overrides'

function scopedKey(base: string, athleteId?: string) {
  return athleteId ? `${base}_${athleteId}` : base
}

function rand() {
  return Math.random().toString(36).slice(2, 8)
}

/** Legacy PlanOverride shape (pre op-log). */
interface LegacyOverride {
  id: string
  weekNum: number
  dayIndex: number
  updates: DayUpdates
  rationale?: string
  appliedAt: number
}

function migrateLegacy(athleteId?: string): PlanEdit[] {
  try {
    const raw = localStorage.getItem(scopedKey(LEGACY_OVERRIDES_KEY, athleteId))
    if (!raw) return []
    const legacy = JSON.parse(raw) as LegacyOverride[]
    if (!Array.isArray(legacy)) return []
    return legacy.map(o => ({
      id: o.id || `edit_${o.appliedAt}_${rand()}`,
      batchId: o.id || `batch_${o.appliedAt}_${rand()}`,
      op: { kind: 'updateDay', weekNum: o.weekNum, dayIndex: o.dayIndex, updates: o.updates } as PlanEditOp,
      rationale: o.rationale,
      appliedAt: o.appliedAt || Date.now(),
    }))
  } catch {
    return []
  }
}

/** Drop ops that predate the current plan generation. Edits are keyed by
 *  weekNum/dayIndex against the plan that existed when they were made — an
 *  op applied BEFORE this plan was generated cannot describe it, it can
 *  only stamp last season's workout onto whatever now occupies that slot
 *  (the field bug: June's "Tiger Mtn" edits scattered across a September
 *  rebuild). Runs at every load, so a stale log resurrected by a sync
 *  pull is re-pruned before it can ever render. No generation → no-op
 *  (seed athletes have no onboarding stamp). */
export function pruneStaleEdits(edits: PlanEdit[], planGeneration?: string): PlanEdit[] {
  if (!planGeneration) return edits
  const genMs = Date.parse(planGeneration)
  if (!Number.isFinite(genMs)) return edits
  return edits.filter(e => e.appliedAt >= genMs)
}

function readEdits(athleteId?: string, planGeneration?: string): PlanEdit[] {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY, athleteId))
    if (raw) {
      const parsed = JSON.parse(raw)
      const all = Array.isArray(parsed) ? (parsed as PlanEdit[]) : []
      const live = pruneStaleEdits(all, planGeneration)
      if (live.length !== all.length) {
        // Persist the prune (stamped) so the cleaned log wins the sync
        // LWW and other devices stop replaying the stale ops too.
        writeEdits(live, athleteId)
      }
      return live
    }
    // First run on this device with no new-format data — fold in any
    // edits the athlete made under the old single-day override system.
    const migrated = pruneStaleEdits(migrateLegacy(athleteId), planGeneration)
    if (migrated.length > 0) {
      localStorage.setItem(scopedKey(STORAGE_KEY, athleteId), JSON.stringify(migrated))
    }
    return migrated
  } catch {
    return []
  }
}

function writeEdits(edits: PlanEdit[], athleteId?: string) {
  const key = scopedKey(STORAGE_KEY, athleteId)
  try {
    localStorage.setItem(key, JSON.stringify(edits))
    stampKey(key)
  } catch { /* quota */ }
}

/** A timestamp strictly greater than every entry already in the log, and no
 *  earlier than now.
 *
 *  Wall-clock alone is not enough. `applyBatch` stamps its ops `base + i` to
 *  preserve intra-batch order, so a three-op batch can hold timestamps AHEAD
 *  of `Date.now()`; an undo a moment later would then compare as "before"
 *  some of the very ops it is undoing and silently leave them applied. Two
 *  actions inside the same millisecond hit the same problem. Deriving the
 *  next stamp from the log makes both impossible: every new entry — edit or
 *  tombstone — sorts strictly after everything present.
 *
 *  Deliberately not a monotonic counter: `appliedAt` has to stay comparable
 *  across devices, and a wall-clock floor keeps it so. */
function nextStamp(log: PlanEdit[]): number {
  let max = 0
  for (const e of log) if (e.appliedAt > max) max = e.appliedAt
  return Math.max(Date.now(), max + 1)
}

/** Identity of an update op's target, or null for non-update ops (which
 *  always stack). Used to enforce last-wins at replay. */
function updateTargetKey(op: PlanEditOp): string | null {
  if (op.kind === 'updateDay') return `day:${op.weekNum}:${op.dayIndex}`
  if (op.kind === 'updateWeek') return `week:${op.weekNum}`
  return null
}

/** An update op replaces any prior op of the same kind + target so
 *  re-editing the same day/week patches rather than stacks. Add/delete
 *  ops always append. */
function isSameUpdateTarget(a: PlanEditOp, b: PlanEditOp): boolean {
  if (a.kind === 'updateDay' && b.kind === 'updateDay') {
    return a.weekNum === b.weekNum && a.dayIndex === b.dayIndex
  }
  if (a.kind === 'updateWeek' && b.kind === 'updateWeek') {
    return a.weekNum === b.weekNum
  }
  return false
}

/** Does revocation `r` kill edit `e`?
 *
 *  Only edits applied strictly BEFORE the revocation die, so undoing a batch
 *  on Monday can never silently kill a re-edit of the same day made on
 *  Tuesday — including one that arrives later from another device. */
function revokes(r: Extract<PlanEditOp, { kind: 'revoke' }>, e: PlanEdit): boolean {
  if (e.appliedAt >= r.before) return false
  if ('all' in r) return true
  if ('batchId' in r) return e.batchId === r.batchId
  return (
    e.op.kind === 'updateDay' &&
    e.op.weekNum === r.day.weekNum &&
    e.op.dayIndex === r.day.dayIndex
  )
}

/** The live edits: everything that isn't a tombstone and isn't killed by one.
 *
 *  Tombstones are how a removal survives a cross-device merge — see the
 *  `revoke` op in types. Applying them at read time (rather than deleting
 *  rows at write time) is what lets the sync layer union two devices' logs
 *  without resurrecting work the athlete already undid. */
export function applyRevocations(entries: PlanEdit[]): PlanEdit[] {
  const tombstones = entries
    .map(e => e.op)
    .filter((op): op is Extract<PlanEditOp, { kind: 'revoke' }> => op.kind === 'revoke')
  const live = entries.filter(e => e.op.kind !== 'revoke')
  if (tombstones.length === 0) return live
  return live.filter(e => !tombstones.some(r => revokes(r, e)))
}

/** Replay the op-log over a fresh clone of the base weeks. Ops apply in
 *  `appliedAt` order; out-of-range targets are skipped (graceful — a stale
 *  op against a since-removed week/day simply does nothing).
 *
 *  Revoked edits are dropped first, and for `updateDay`/`updateWeek` only the
 *  LAST op per target applies. That last-wins rule used to be enforced at
 *  write time (`applyBatch` filtered prior same-target updates out of the
 *  log), which a union-merge can undo by restoring the superseded row from
 *  another device. Enforcing it here instead makes the outcome identical
 *  either way: whatever rows are present, the newest update of a day wins
 *  outright rather than having an older op's stale fields merge back in. */
export function replayEdits(base: TrainingWeek[], edits: PlanEdit[]): TrainingWeek[] {
  const living = applyRevocations(edits)
  if (living.length === 0) return base
  let weeks: TrainingWeek[] = base.map(w => ({ ...w, days: w.days.map(d => ({ ...d })) }))
  const sorted = [...living].sort((a, b) => a.appliedAt - b.appliedAt)
  const superseded = new Set<string>()
  const lastByTarget = new Map<string, string>()
  for (const e of sorted) {
    const t = updateTargetKey(e.op)
    if (!t) continue
    const prior = lastByTarget.get(t)
    if (prior) superseded.add(prior)
    lastByTarget.set(t, e.id)
  }
  for (const { op, id } of sorted) {
    if (superseded.has(id)) continue
    switch (op.kind) {
      case 'updateWeek': {
        const w = weeks.find(x => x.num === op.weekNum)
        if (w) Object.assign(w, op.updates)
        break
      }
      case 'updateDay': {
        const w = weeks.find(x => x.num === op.weekNum)
        if (w && op.dayIndex >= 0 && op.dayIndex < w.days.length) {
          // A type/workout rewrite means day.type no longer describes the
          // content — mark it so type-keyed generic coach notes stay quiet
          // ("Quality day — hit the zone splits" on a hand-edited hike).
          // Detail/zone-only updates (incl. system repace batches) are NOT
          // marked. Derived at replay, never persisted.
          const rewrote = op.updates.type !== undefined || op.updates.workout !== undefined
          w.days[op.dayIndex] = {
            ...w.days[op.dayIndex],
            ...op.updates,
            ...(rewrote ? { userEdited: true } : {}),
          }
        }
        break
      }
      case 'addDay': {
        const w = weeks.find(x => x.num === op.weekNum)
        if (w) {
          const at = Math.max(0, Math.min(op.atIndex, w.days.length))
          w.days.splice(at, 0, { ...op.day, userEdited: true })
        }
        break
      }
      case 'deleteDay': {
        const w = weeks.find(x => x.num === op.weekNum)
        if (w && op.dayIndex >= 0 && op.dayIndex < w.days.length) {
          w.days.splice(op.dayIndex, 1)
        }
        break
      }
      case 'addWeek': {
        if (!weeks.some(x => x.num === op.week.num)) {
          const newWeek: TrainingWeek = { ...op.week, days: op.week.days.map(d => ({ ...d })) }
          const idx = weeks.findIndex(x => x.num === op.atNum)
          if (idx >= 0) weeks.splice(idx + 1, 0, newWeek)
          else weeks.push(newWeek)
        }
        break
      }
      case 'deleteWeek': {
        weeks = weeks.filter(x => x.num !== op.weekNum)
        break
      }
    }
  }
  return weeks
}

/** `planGeneration` is the current plan's birth stamp (onboarding
 *  config.completedAt) — ops older than it are pruned at load; see
 *  pruneStaleEdits. Omit for seed athletes with no generated plan. */
export function usePlanEdits(athleteId?: string, planGeneration?: string) {
  // `log` is the raw persisted array — edits AND tombstones. Everything the
  // hook hands out is the LIVE view (`edits`), so a caller counting edits or
  // asking "is this day edited" never sees an undone one. Only the writers
  // below touch the raw log.
  const [log, setLog] = useState<PlanEdit[]>(() => readEdits(athleteId, planGeneration))
  const edits = useMemo(() => applyRevocations(log), [log])

  useEffect(() => {
    setLog(readEdits(athleteId, planGeneration))
  }, [athleteId, planGeneration])

  // Re-read when the backend sync layer writes to our key (the sync
  // hook dispatches synthetic `storage` events after a successful pull
  // so cross-device edits show up without a refresh).
  useEffect(() => {
    const watched = scopedKey(STORAGE_KEY, athleteId)
    function onStorage(e: StorageEvent) {
      if (e.key !== watched) return
      setLog(readEdits(athleteId, planGeneration))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [athleteId, planGeneration])

  const commit = useCallback((next: PlanEdit[]) => {
    writeEdits(next, athleteId)
    setLog(next)
  }, [athleteId])

  /** Apply a coach proposal (one or many ops) as a single undoable batch.
   *  Returns the batchId, used as the override/undo handle. */
  const applyBatch = useCallback((ops: PlanEditOpInput[]): string => {
    const base = nextStamp(log)
    const batchId = `batch_${base}_${rand()}`
    const newEdits: PlanEdit[] = ops.map((o, i) => ({
      id: `edit_${base}_${i}_${rand()}`,
      batchId,
      op: o.op,
      rationale: o.rationale,
      appliedAt: base + i,  // preserve intra-batch order
    }))
    // Dropping the superseded rows is now only COMPACTION — replay enforces
    // last-wins per target regardless. That matters for sync: if this device
    // compacts a row another device still holds, the union restores it and
    // replay still lands on the newer edit.
    let next = log
    for (const ne of newEdits) {
      next = next.filter(e => !isSameUpdateTarget(e.op, ne.op))
    }
    commit([...next, ...newEdits])
    return batchId
  }, [log, commit])


  /** Append a tombstone. Removals are ADDED rather than subtracted so they
   *  survive a cross-device union — see the `revoke` op in types. */
  const revoke = useCallback((target: PlanEditRevokeTarget) => {
    const at = nextStamp(log)
    commit([...log, {
      id: `revoke_${at}_${rand()}`,
      batchId: `revoke_${at}_${rand()}`,
      op: { kind: 'revoke', before: at, ...target } as PlanEditOp,
      appliedAt: at,
    }])
  }, [log, commit])

  const undoBatch = useCallback((batchId: string) => {
    revoke({ batchId })
  }, [revoke])

  const resetAll = useCallback(() => {
    revoke({ all: true })
  }, [revoke])

  // ── Backward-compatible single-day helpers (manual WorkoutEditor) ──

  /** Apply (or replace) a single-day patch. Returns the batchId so the
   *  caller can undo it. Mirrors the old `applyOverride` contract. */
  const applyOverride = useCallback((o: { weekNum: number; dayIndex: number; updates: DayUpdates; rationale?: string }): string => {
    return applyBatch([{ op: { kind: 'updateDay', weekNum: o.weekNum, dayIndex: o.dayIndex, updates: o.updates }, rationale: o.rationale }])
  }, [applyBatch])

  const removeOverride = useCallback((batchId: string) => {
    undoBatch(batchId)
  }, [undoBatch])

  const removeForDay = useCallback((weekNum: number, dayIndex: number) => {
    revoke({ day: { weekNum, dayIndex } })
  }, [revoke])

  const hasEditForDay = useCallback((weekNum: number, dayIndex: number): boolean => {
    // Through applyRevocations: an undone edit is still a row in the log, and
    // reading the raw array would report a day as edited after the athlete
    // undid it.
    return edits.some(
      e => e.op.kind === 'updateDay' && e.op.weekNum === weekNum && e.op.dayIndex === dayIndex)
  }, [edits])

  /** Keep day-targeted ops aligned with a day swap so a structural/manual
   *  edit follows its workout to the new slot instead of merging into the
   *  one that moved in. */
  const swapDayIndices = useCallback((weekNum: number, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    const swapIdx = (i: number) => (i === fromIndex ? toIndex : i === toIndex ? fromIndex : i)
    const next = log.map(e => {
      const op = e.op
      // A day-targeted TOMBSTONE has to follow the swap too, or after a swap
      // it revokes whichever edit moved into the slot instead of the one it
      // was written for.
      if (op.kind === 'revoke' && 'day' in op && op.day.weekNum === weekNum) {
        return { ...e, op: { ...op, day: { ...op.day, dayIndex: swapIdx(op.day.dayIndex) } } }
      }
      if ('weekNum' in op && op.weekNum !== weekNum) return e
      if (op.kind === 'updateDay' || op.kind === 'deleteDay') {
        return { ...e, op: { ...op, dayIndex: swapIdx(op.dayIndex) } }
      }
      if (op.kind === 'addDay') {
        return { ...e, op: { ...op, atIndex: swapIdx(op.atIndex) } }
      }
      return e
    })
    commit(next)
  }, [log, commit])

  const applyEditsToWeeks = useCallback((weeks: TrainingWeek[]): TrainingWeek[] => {
    return replayEdits(weeks, edits)
  }, [edits])

  return {
    edits,
    applyBatch,
    undoBatch,
    resetAll,
    applyEditsToWeeks,
    // backward-compatible single-day API
    applyOverride,
    removeOverride,
    removeForDay,
    hasEditForDay,
    swapDayIndices,
  }
}
