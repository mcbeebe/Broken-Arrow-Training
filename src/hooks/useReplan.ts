import { useState, useCallback, useEffect, useMemo } from 'react'
import type { TrainingWeek } from '../types'
import { applyReplanLog, hasReplanFor, type ReplanKind, type ReplanRecord } from '../engines/planGenerator/replanLog'
import { stampKey } from '../utils/syncStamps'

/**
 * Phase 5 (PRD-110) — the athlete-facing half of adaptation.
 *
 * Holds the replan op-log (skip / move / illness) and replays it over the
 * derived weeks. Same shape as usePlanEdits: localStorage-backed, scoped
 * by athlete, pruned against the plan's birth stamp so last season's
 * "I was sick" can never rewrite this season's build.
 */

const STORAGE_KEY = 'ba_replan_log'

function scopedKey(athleteId?: string) {
  return athleteId ? `${STORAGE_KEY}_${athleteId}` : STORAGE_KEY
}

function rand() {
  return Math.random().toString(36).slice(2, 8)
}

/** Records older than the current plan generation describe a plan that no
 *  longer exists — drop them rather than aim them at whatever now sits on
 *  those dates. (Same contract as pruneStaleEdits.) */
export function pruneStaleReplans(log: ReplanRecord[], planGeneration?: string): ReplanRecord[] {
  if (!planGeneration) return log
  const genMs = Date.parse(planGeneration)
  if (!Number.isFinite(genMs)) return log
  return log.filter(r => r.appliedAt >= genMs)
}

function readLog(athleteId?: string, planGeneration?: string): ReplanRecord[] {
  try {
    const raw = localStorage.getItem(scopedKey(athleteId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    const all = Array.isArray(parsed) ? (parsed as ReplanRecord[]) : []
    const live = pruneStaleReplans(all, planGeneration)
    if (live.length !== all.length) writeLog(live, athleteId)
    return live
  } catch {
    return []
  }
}

function writeLog(log: ReplanRecord[], athleteId?: string) {
  const key = scopedKey(athleteId)
  try {
    localStorage.setItem(key, JSON.stringify(log))
    stampKey(key)
  } catch { /* quota */ }
}

export function useReplan(athleteId?: string, planGeneration?: string) {
  const [records, setRecords] = useState<ReplanRecord[]>(() => readLog(athleteId, planGeneration))

  useEffect(() => {
    setRecords(readLog(athleteId, planGeneration))
  }, [athleteId, planGeneration])

  // Cross-device: the sync layer dispatches a synthetic storage event
  // after a pull, so a replan made on the phone shows up on the laptop.
  useEffect(() => {
    const watched = scopedKey(athleteId)
    function onStorage(e: StorageEvent) {
      if (e.key !== watched) return
      setRecords(readLog(athleteId, planGeneration))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [athleteId, planGeneration])

  const commit = useCallback((next: ReplanRecord[]) => {
    writeLog(next, athleteId)
    setRecords(next)
  }, [athleteId])

  /** Apply one rule to one date. A second action on the same date
   *  REPLACES the first — "actually, I was sick" corrects "I skipped it"
   *  instead of stacking two rewrites on one day. */
  const apply = useCallback((kind: ReplanKind, dateIso: string) => {
    setRecords(prev => {
      const next = [
        ...prev.filter(r => r.dateIso !== dateIso),
        { id: `replan_${Date.now()}_${rand()}`, kind, dateIso, appliedAt: Date.now() },
      ]
      writeLog(next, athleteId)
      return next
    })
  }, [athleteId])

  const undoFor = useCallback((dateIso: string) => {
    setRecords(prev => {
      const next = prev.filter(r => r.dateIso !== dateIso)
      writeLog(next, athleteId)
      return next
    })
  }, [athleteId])

  const resetAll = useCallback(() => commit([]), [commit])

  const applyReplansToWeeks = useCallback(
    (weeks: TrainingWeek[]) => applyReplanLog(weeks, records),
    [records],
  )

  const hasReplan = useCallback((dateIso: string) => hasReplanFor(records, dateIso), [records])

  return useMemo(() => ({
    records,
    apply,
    undoFor,
    resetAll,
    applyReplansToWeeks,
    hasReplan,
  }), [records, apply, undoFor, resetAll, applyReplansToWeeks, hasReplan])
}
