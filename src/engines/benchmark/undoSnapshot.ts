import type { HRZone } from '../../types'
import type { FitnessAnchor } from '../../hooks/useOnboarding'
import type { StrengthCapacity } from '../strength/benchmark'

/**
 * The way back from a benchmark Apply (M7 — the App wiring above
 * `mergeBenchmarkAnchors`).
 *
 * Applying a field-test result rewrites four separate stores at once: the
 * HR zone table, the maxHR override, the athlete's onboarding anchors, and
 * — when the test measured an erg split — the strength capacity. Undo has
 * to put all four back, or the athlete is left with a plan re-anchored to a
 * test they rejected.
 *
 * It used to live in a `useRef` inside App. Two consequences, both real:
 *
 *  1. Navigating away and coming back emptied it. `undoBenchmarkResult`
 *     reverted the plan-edit batch and then returned early, so the plan days
 *     came back but the ZONES, maxHR, anchors and erg baseline stayed
 *     rewritten — a silent half-undo that leaves the athlete worse off than
 *     either outcome they were choosing between.
 *  2. It was not keyed by batch. Two applies in a row overwrote it, so
 *     undoing the first restored the second's state.
 *
 * The snapshot now lives in localStorage keyed by the plan-edit batch it
 * belongs to, so an undo either restores exactly the state that apply
 * replaced, or restores nothing and says so.
 *
 * Deliberately NOT in the cross-device sync or origin-migration allowlists:
 * a snapshot is the inverse of one specific plan-edit batch on one device,
 * and replaying it elsewhere would restore zones that device never changed.
 */

export interface BenchmarkUndoSnapshot {
  /** The plan-edit batch this snapshot is the inverse of. */
  batchId: string
  /** Customised zone table at apply time; null = the athlete had none, so
   *  undo resets rather than restores. */
  zones: HRZone[] | null
  maxHROverride: number | null
  fitnessAnchor: FitnessAnchor | null
  testedLthrBpm: number | null
  configMaxHR: number | null
  /** undefined = the erg was untouched by this apply, so undo leaves it
   *  alone; null = there was no capacity to restore, so undo clears it. */
  capacity?: StrengthCapacity | null
}

export function benchmarkUndoKey(athleteId: string): string {
  return `ba_bench_undo_v1_${athleteId}`
}

/** Persist the way back. Storage failures are swallowed: a browser that
 *  refuses to store must not stop the athlete applying their test result. */
export function saveUndoSnapshot(athleteId: string, snap: BenchmarkUndoSnapshot): void {
  try {
    localStorage.setItem(benchmarkUndoKey(athleteId), JSON.stringify(snap))
  } catch { /* private mode / quota — apply still stands, undo degrades */ }
}

/**
 * The snapshot for THIS batch, or null. A stored snapshot for a different
 * batch is not "close enough": restoring it would roll the athlete back to a
 * state a later apply already replaced.
 */
export function readUndoSnapshot(athleteId: string, batchId: string): BenchmarkUndoSnapshot | null {
  try {
    const raw = localStorage.getItem(benchmarkUndoKey(athleteId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BenchmarkUndoSnapshot> | null
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.batchId !== batchId) return null
    // `zones` and the anchors are allowed to be null; what must be present
    // is the batch identity and the object shape.
    return parsed as BenchmarkUndoSnapshot
  } catch {
    return null // corrupt payload → no undo, never a throw on a button press
  }
}

export function clearUndoSnapshot(athleteId: string): void {
  try { localStorage.removeItem(benchmarkUndoKey(athleteId)) } catch { /* ignore */ }
}
