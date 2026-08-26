import { useCallback, useEffect, useState } from 'react'
import { stampKey } from '../utils/syncStamps'

/**
 * The Adaptation Log (Adaptive Engine phase 3, PR 7) — every change
 * the engine made or proposed, and why, in one place with undo.
 * "Adapt without an undo path and a visible history" is the one thing
 * the field agrees kills trust, so this store is the autopilot's
 * precondition, not its afterthought.
 *
 * Storage discipline matches the other op-logs: athleteId-scoped
 * localStorage + sync stamp, newest first, capped. Entries reference
 * the plan-edit batchId when one exists, so the log's Undo routes
 * through the same atomic seam as everything else.
 */

export type AdaptationSource = 'autopilot' | 'monday-review' | 'coach'
export type AdaptationKind = 'auto' | 'applied' | 'declined' | 'reverted'

export interface AdaptationLogEntry {
  id: string
  atMs: number
  /** Local calendar day the action belongs to. */
  dateIso: string
  source: AdaptationSource
  /** 'auto' = same-day modulation; 'applied' = athlete confirmed a
   *  proposal; 'declined' = proposal turned down; 'reverted' = undone. */
  kind: AdaptationKind
  title: string
  detail: string
  /** Plan-edit batch to undo, while the entry is still revertible. */
  batchId?: string
}

const STORAGE_KEY = 'ba_adaptation_log_v1'
const MAX_ENTRIES = 120

function scopedKey(athleteId?: string) {
  return athleteId ? `${STORAGE_KEY}_${athleteId}` : STORAGE_KEY
}

export function readLog(athleteId?: string): AdaptationLogEntry[] {
  try {
    const raw = localStorage.getItem(scopedKey(athleteId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(e => e && typeof e.id === 'string') : []
  } catch {
    return []
  }
}

function writeLog(entries: AdaptationLogEntry[], athleteId?: string) {
  try {
    const key = scopedKey(athleteId)
    localStorage.setItem(key, JSON.stringify(entries))
    stampKey(key)
  } catch { /* quota */ }
}

/** Pure append: newest first, capped. Exported for tests. */
export function appendEntry(
  entries: AdaptationLogEntry[],
  entry: Omit<AdaptationLogEntry, 'id' | 'atMs'> & { atMs?: number },
): { entries: AdaptationLogEntry[]; id: string } {
  const atMs = entry.atMs ?? Date.now()
  const id = `adapt_${atMs}_${Math.random().toString(36).slice(2, 8)}`
  const next = [{ ...entry, id, atMs }, ...entries].slice(0, MAX_ENTRIES)
  return { entries: next, id }
}

/** Pure revert marker: the entry keeps its story, loses its undo. */
export function markEntryReverted(entries: AdaptationLogEntry[], id: string): AdaptationLogEntry[] {
  return entries.map(e =>
    e.id === id ? { ...e, kind: 'reverted' as const, batchId: undefined } : e,
  )
}

export interface UseAdaptationLogReturn {
  /** Newest first. */
  entries: AdaptationLogEntry[]
  append(entry: Omit<AdaptationLogEntry, 'id' | 'atMs'> & { atMs?: number }): string
  markReverted(id: string): void
  /** One-push-per-session guard: has `source` already acted on `dateIso`? */
  hasEntryFor(dateIso: string, source: AdaptationSource): boolean
}

export function useAdaptationLog(athleteId?: string): UseAdaptationLogReturn {
  const [entries, setEntries] = useState<AdaptationLogEntry[]>(() => readLog(athleteId))

  useEffect(() => {
    setEntries(readLog(athleteId))
  }, [athleteId])

  const append = useCallback<UseAdaptationLogReturn['append']>(entry => {
    const { entries: next, id } = appendEntry(readLog(athleteId), entry)
    writeLog(next, athleteId)
    setEntries(next)
    return id
  }, [athleteId])

  const markReverted = useCallback((id: string) => {
    const next = markEntryReverted(readLog(athleteId), id)
    writeLog(next, athleteId)
    setEntries(next)
  }, [athleteId])

  const hasEntryFor = useCallback((dateIso: string, source: AdaptationSource) =>
    entries.some(e => e.dateIso === dateIso && e.source === source), [entries])

  return { entries, append, markReverted, hasEntryFor }
}
