import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { stampKey } from '../utils/syncStamps'
import {
  deriveAnchors, latestByKind, liveEntries, seedFromExisting,
  type Benchmark, type DerivedAnchors,
} from '../engines/benchmark/log'
import type { OnboardingConfig } from './useOnboarding'
import type { StrengthCapacity } from '../engines/strength/benchmark'

/**
 * The athlete's benchmark log, persisted per athlete and synced across
 * devices (`ba_benchmarks_v1` is on both allowlists; the sync layer unions
 * it by entry id, so removals are tombstones — see `remove`).
 *
 * Like the strength capacity and unlike plan edits, this is NOT pruned by
 * plan generation: a measured number describes the athlete, not the plan,
 * and survives a rebuild. Staleness is per kind and lives in the engine.
 *
 * Seeding: the first time the log is read for an athlete who already has
 * an onboarding anchor, erg splits or a strength capacity, those become the
 * log's first entries (deterministic ids, so two devices seeding on their
 * own converge). From then on the log is the source of truth and App.tsx
 * mirrors `anchors` back onto the fields the engines read.
 */

const STORAGE_KEY = 'ba_benchmarks_v1'

function scopedKey(athleteId?: string) {
  return athleteId ? `${STORAGE_KEY}_${athleteId}` : STORAGE_KEY
}

function read(athleteId?: string): Benchmark[] {
  try {
    const raw = localStorage.getItem(scopedKey(athleteId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Benchmark[]) : []
  } catch {
    return []
  }
}

function write(log: Benchmark[], athleteId?: string) {
  const key = scopedKey(athleteId)
  try {
    localStorage.setItem(key, JSON.stringify(log))
    stampKey(key)
  } catch { /* quota */ }
}

function rand() {
  return Math.random().toString(36).slice(2, 8)
}

export interface UseBenchmarksReturn {
  /** Every entry including tombstones — the raw log. */
  log: Benchmark[]
  /** Live entries, newest measured first. */
  live: Benchmark[]
  latest: Partial<Record<Benchmark['kind'], Benchmark>>
  /** What the engines read, derived from the log. */
  anchors: DerivedAnchors
  add: (entry: Omit<Benchmark, 'id' | 'at'> & Partial<Pick<Benchmark, 'id' | 'at'>>) => Benchmark
  addMany: (entries: Benchmark[]) => void
  /** Tombstone. Returns false when no live entry had that id. */
  remove: (id: string) => boolean
  /** Tombstone every live entry of a kind (the "clear" affordance). */
  removeKind: (kind: Benchmark['kind']) => string[]
  /** True once the log holds anything at all (seeded or entered) — the
   *  signal App uses to start mirroring the log onto the config. */
  hasHistory: boolean
}

export function useBenchmarks(
  athleteId: string | undefined,
  seedFrom: { config: OnboardingConfig | null | undefined; capacity: StrengthCapacity | null | undefined },
): UseBenchmarksReturn {
  const [log, setLog] = useState<Benchmark[]>(() => read(athleteId))

  useEffect(() => {
    setLog(read(athleteId))
  }, [athleteId])

  // Cross-device: the sync layer dispatches a synthetic storage event
  // after a pull, so a 5K entered on the phone shows up on the laptop.
  useEffect(() => {
    const watched = scopedKey(athleteId)
    function onStorage(e: StorageEvent) {
      if (e.key !== watched) return
      setLog(read(athleteId))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [athleteId])

  // Seed once, from the fields the log replaces. Guarded on an EMPTY log
  // (tombstones count as history), so an athlete who cleared their entries
  // does not get the old onboarding number back on the next load.
  const { config, capacity } = seedFrom
  useEffect(() => {
    if (log.length > 0) return
    if (!config && !capacity) return
    const seeded = seedFromExisting(config, capacity, Date.now())
    if (seeded.length === 0) return
    write(seeded, athleteId)
    setLog(seeded)
    // The seed is a one-time migration keyed on emptiness; re-running it
    // for later config/capacity changes would resurrect deleted entries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log.length === 0, athleteId])

  // Mutators compute the next log synchronously from a ref rather than
  // inside a state updater: `remove` has to REPORT whether it found a live
  // entry, and an updater runs lazily, after the call has already returned.
  // The ref is advanced immediately so back-to-back calls see each other.
  const logRef = useRef(log)
  logRef.current = log
  const commit = useCallback((next: Benchmark[]) => {
    logRef.current = next
    write(next, athleteId)
    setLog(next)
  }, [athleteId])

  const add = useCallback<UseBenchmarksReturn['add']>((entry) => {
    const at = entry.at ?? Date.now()
    const full: Benchmark = { ...entry, id: entry.id ?? `bm_${at}_${rand()}`, at }
    commit([...logRef.current, full])
    return full
  }, [commit])

  const addMany = useCallback((entries: Benchmark[]) => {
    if (entries.length === 0) return
    commit([...logRef.current, ...entries])
  }, [commit])

  const remove = useCallback((id: string) => {
    let found = false
    const next = logRef.current.map(b => {
      if (b.id !== id || b.deleted) return b
      found = true
      return { ...b, deleted: true as const, at: Date.now() }
    })
    if (found) commit(next)
    return found
  }, [commit])

  const removeKind = useCallback((kind: Benchmark['kind']) => {
    const ids: string[] = []
    const next = logRef.current.map(b => {
      if (b.kind !== kind || b.deleted) return b
      ids.push(b.id)
      return { ...b, deleted: true as const, at: Date.now() }
    })
    if (ids.length) commit(next)
    return ids
  }, [commit])

  const live = useMemo(() => liveEntries(log), [log])
  const latest = useMemo(() => latestByKind(log), [log])
  const anchors = useMemo(() => deriveAnchors(log), [log])

  return { log, live, latest, anchors, add, addMany, remove, removeKind, hasHistory: log.length > 0 }
}
