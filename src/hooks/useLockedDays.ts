import { useState, useCallback, useEffect, useMemo } from 'react'
import type { TrainingWeek } from '../types'
import { stampKey } from '../utils/syncStamps'
import { dayIsoInWeek } from '../utils/planDates'

/**
 * Locked days (P12) — a day the athlete has pinned as fixed.
 *
 * A lock is a calendar-day decision ("leave this Saturday exactly as it
 * is"), not a content edit — so it's keyed by ISO date and modelled like
 * useReplan / useDaySwap: localStorage-backed, scoped by athlete,
 * generation-pruned so last season's locks can't pin this season's days,
 * stamped for cross-device sync, and replayed over the derived weeks.
 *
 * `applyLocksToWeeks` stamps `day.locked = true` (derived at render, never
 * persisted, like userEdited). Every scheduler that could move, swap,
 * rewrite, or auto-adjust a day reads that flag and skips a locked one.
 */

const STORAGE_KEY = 'ba_locked_days'

function scopedKey(athleteId?: string) {
  return athleteId ? `${STORAGE_KEY}_${athleteId}` : STORAGE_KEY
}

function rand() {
  return Math.random().toString(36).slice(2, 8)
}

export interface LockRecord {
  id: string
  dateIso: string
  appliedAt: number
}

/** Locks applied before the current plan generation describe a plan that
 *  no longer exists — drop them (same contract as pruneStaleReplans). */
export function pruneStaleLocks(log: LockRecord[], planGeneration?: string): LockRecord[] {
  if (!planGeneration) return log
  const genMs = Date.parse(planGeneration)
  if (!Number.isFinite(genMs)) return log
  return log.filter(r => r.appliedAt >= genMs)
}

function readLog(athleteId?: string, planGeneration?: string): LockRecord[] {
  try {
    const raw = localStorage.getItem(scopedKey(athleteId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    const all = Array.isArray(parsed) ? (parsed as LockRecord[]) : []
    const live = pruneStaleLocks(all, planGeneration)
    if (live.length !== all.length) writeLog(live, athleteId)
    return live
  } catch {
    return []
  }
}

function writeLog(log: LockRecord[], athleteId?: string) {
  const key = scopedKey(athleteId)
  try {
    localStorage.setItem(key, JSON.stringify(log))
    stampKey(key)
  } catch { /* quota */ }
}

/** Stamp `day.locked` on every day whose ISO date carries a lock. Pure. */
export function applyLocks(weeks: TrainingWeek[], lockedIsos: ReadonlySet<string>): TrainingWeek[] {
  if (lockedIsos.size === 0) return weeks
  return weeks.map(week => ({
    ...week,
    days: week.days.map(day => {
      const iso = dayIsoInWeek(day.day, week)
      return iso && lockedIsos.has(iso) ? { ...day, locked: true } : day
    }),
  }))
}

export function useLockedDays(athleteId?: string, planGeneration?: string) {
  const [records, setRecords] = useState<LockRecord[]>(() => readLog(athleteId, planGeneration))

  useEffect(() => {
    setRecords(readLog(athleteId, planGeneration))
  }, [athleteId, planGeneration])

  // Cross-device: the sync layer dispatches a synthetic storage event after
  // a pull, so a lock set on the phone shows up on the laptop.
  useEffect(() => {
    const watched = scopedKey(athleteId)
    function onStorage(e: StorageEvent) {
      if (e.key !== watched) return
      setRecords(readLog(athleteId, planGeneration))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [athleteId, planGeneration])

  const lockedIsos = useMemo(() => new Set(records.map(r => r.dateIso)), [records])

  const isLocked = useCallback((dateIso: string) => lockedIsos.has(dateIso), [lockedIsos])

  /** Toggle a day's lock. Re-locking is idempotent; unlocking drops it. */
  const toggleLock = useCallback((dateIso: string) => {
    setRecords(prev => {
      const next = prev.some(r => r.dateIso === dateIso)
        ? prev.filter(r => r.dateIso !== dateIso)
        : [...prev, { id: `lock_${Date.now()}_${rand()}`, dateIso, appliedAt: Date.now() }]
      writeLog(next, athleteId)
      return next
    })
  }, [athleteId])

  const applyLocksToWeeks = useCallback(
    (weeks: TrainingWeek[]) => applyLocks(weeks, lockedIsos),
    [lockedIsos],
  )

  return useMemo(() => ({
    records,
    isLocked,
    toggleLock,
    applyLocksToWeeks,
  }), [records, isLocked, toggleLock, applyLocksToWeeks])
}
