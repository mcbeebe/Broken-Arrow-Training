import { useState, useCallback, useEffect } from 'react'
import type {
  TrainingWeek,
  PlanEdit,
  PlanEditOp,
  PlanEditOpInput,
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

function readEdits(athleteId?: string): PlanEdit[] {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY, athleteId))
    if (raw) {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    }
    // First run on this device with no new-format data — fold in any
    // edits the athlete made under the old single-day override system.
    const migrated = migrateLegacy(athleteId)
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

/** Replay the op-log over a fresh clone of the base weeks. Ops apply in
 *  `appliedAt` order; out-of-range targets are skipped (graceful — a stale
 *  op against a since-removed week/day simply does nothing). */
export function replayEdits(base: TrainingWeek[], edits: PlanEdit[]): TrainingWeek[] {
  if (edits.length === 0) return base
  let weeks: TrainingWeek[] = base.map(w => ({ ...w, days: w.days.map(d => ({ ...d })) }))
  const sorted = [...edits].sort((a, b) => a.appliedAt - b.appliedAt)
  for (const { op } of sorted) {
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

export function usePlanEdits(athleteId?: string) {
  const [edits, setEdits] = useState<PlanEdit[]>(() => readEdits(athleteId))

  useEffect(() => {
    setEdits(readEdits(athleteId))
  }, [athleteId])

  // Re-read when the backend sync layer writes to our key (the sync
  // hook dispatches synthetic `storage` events after a successful pull
  // so cross-device edits show up without a refresh).
  useEffect(() => {
    const watched = scopedKey(STORAGE_KEY, athleteId)
    function onStorage(e: StorageEvent) {
      if (e.key !== watched) return
      setEdits(readEdits(athleteId))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [athleteId])

  const commit = useCallback((next: PlanEdit[]) => {
    writeEdits(next, athleteId)
    setEdits(next)
  }, [athleteId])

  /** Apply a coach proposal (one or many ops) as a single undoable batch.
   *  Returns the batchId, used as the override/undo handle. */
  const applyBatch = useCallback((ops: PlanEditOpInput[]): string => {
    const batchId = `batch_${Date.now()}_${rand()}`
    const base = Date.now()
    const newEdits: PlanEdit[] = ops.map((o, i) => ({
      id: `edit_${base}_${i}_${rand()}`,
      batchId,
      op: o.op,
      rationale: o.rationale,
      appliedAt: base + i,  // preserve intra-batch order
    }))
    let next = edits
    for (const ne of newEdits) {
      next = next.filter(e => !isSameUpdateTarget(e.op, ne.op))
    }
    commit([...next, ...newEdits])
    return batchId
  }, [edits, commit])

  const undoBatch = useCallback((batchId: string) => {
    commit(edits.filter(e => e.batchId !== batchId))
  }, [edits, commit])

  const resetAll = useCallback(() => {
    commit([])
  }, [commit])

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
    commit(edits.filter(e => !(e.op.kind === 'updateDay' && e.op.weekNum === weekNum && e.op.dayIndex === dayIndex)))
  }, [edits, commit])

  const hasEditForDay = useCallback((weekNum: number, dayIndex: number): boolean => {
    return edits.some(e => e.op.kind === 'updateDay' && e.op.weekNum === weekNum && e.op.dayIndex === dayIndex)
  }, [edits])

  /** Keep day-targeted ops aligned with a day swap so a structural/manual
   *  edit follows its workout to the new slot instead of merging into the
   *  one that moved in. */
  const swapDayIndices = useCallback((weekNum: number, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    const swapIdx = (i: number) => (i === fromIndex ? toIndex : i === toIndex ? fromIndex : i)
    const next = edits.map(e => {
      const op = e.op
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
  }, [edits, commit])

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
