import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  benchmarkUndoKey, clearUndoSnapshot, readUndoSnapshot, saveUndoSnapshot,
  type BenchmarkUndoSnapshot,
} from '../../../engines/benchmark/undoSnapshot'

/**
 * M7 — the App wiring above `mergeBenchmarkAnchors`. #403 made the merge core
 * pure and tested; every line ABOVE it survived mutation, including the undo
 * path, which was a `useRef` and therefore gone the moment the athlete
 * navigated away.
 */

const ATHLETE = 'mike'
const snap = (over: Partial<BenchmarkUndoSnapshot> = {}): BenchmarkUndoSnapshot => ({
  batchId: 'batch-1',
  zones: [{ zone: 'Z2', min: 130, max: 145, label: 'Easy', purpose: 'aerobic' }] as unknown as BenchmarkUndoSnapshot['zones'],
  maxHROverride: 178,
  fitnessAnchor: { type: 'easy_pace', valueSeconds: 600 },
  testedLthrBpm: null,
  configMaxHR: 180,
  ...over,
})

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('the benchmark undo snapshot survives the screen', () => {
  it('round-trips through storage — the whole point of not being a ref', () => {
    saveUndoSnapshot(ATHLETE, snap())
    // A fresh read with no in-memory state: this IS "navigated away and
    // came back".
    expect(readUndoSnapshot(ATHLETE, 'batch-1')).toEqual(snap())
  })

  it('refuses a snapshot from a DIFFERENT apply', () => {
    // Two applies in a row: the old ref was overwritten, so undoing the
    // first restored the second's state — the athlete's zones rolled back
    // to somewhere they had never been.
    saveUndoSnapshot(ATHLETE, snap({ batchId: 'batch-2', maxHROverride: 190 }))
    expect(readUndoSnapshot(ATHLETE, 'batch-1')).toBeNull()
    expect(readUndoSnapshot(ATHLETE, 'batch-2')?.maxHROverride).toBe(190)
  })

  it('distinguishes "no zones to restore" from "no snapshot"', () => {
    // null zones means the athlete had no customised table, so undo RESETS.
    // Both are falsy; only one means "do nothing".
    saveUndoSnapshot(ATHLETE, snap({ zones: null, maxHROverride: null, fitnessAnchor: null }))
    const read = readUndoSnapshot(ATHLETE, 'batch-1')
    expect(read).not.toBeNull()
    expect(read!.zones).toBeNull()
    expect(read!.maxHROverride).toBeNull()
  })

  it('carries the erg tri-state: untouched, absent, present', () => {
    saveUndoSnapshot(ATHLETE, snap())
    expect('capacity' in readUndoSnapshot(ATHLETE, 'batch-1')!).toBe(false)
    saveUndoSnapshot(ATHLETE, snap({ capacity: null }))
    expect(readUndoSnapshot(ATHLETE, 'batch-1')!.capacity).toBeNull()
    saveUndoSnapshot(ATHLETE, snap({ capacity: { measuredAt: '2026-08-01', erg500Sec: 105 } }))
    expect(readUndoSnapshot(ATHLETE, 'batch-1')!.capacity?.erg500Sec).toBe(105)
  })

  it('a corrupt payload is no undo, never a crash on a button press', () => {
    localStorage.setItem(benchmarkUndoKey(ATHLETE), '{not json')
    expect(readUndoSnapshot(ATHLETE, 'batch-1')).toBeNull()
    localStorage.setItem(benchmarkUndoKey(ATHLETE), 'null')
    expect(readUndoSnapshot(ATHLETE, 'batch-1')).toBeNull()
    localStorage.setItem(benchmarkUndoKey(ATHLETE), '"a string"')
    expect(readUndoSnapshot(ATHLETE, 'batch-1')).toBeNull()
  })

  it('a browser that refuses to store never blocks the apply', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded') })
    expect(() => saveUndoSnapshot(ATHLETE, snap())).not.toThrow()
  })

  it('a read that throws is no undo, never a crash', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError') })
    expect(readUndoSnapshot(ATHLETE, 'batch-1')).toBeNull()
  })

  it('clears after use, and is per-athlete', () => {
    saveUndoSnapshot(ATHLETE, snap())
    saveUndoSnapshot('other', snap({ maxHROverride: 200 }))
    clearUndoSnapshot(ATHLETE)
    expect(readUndoSnapshot(ATHLETE, 'batch-1')).toBeNull()
    expect(readUndoSnapshot('other', 'batch-1')?.maxHROverride).toBe(200)
  })
})
