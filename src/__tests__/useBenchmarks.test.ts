/**
 * The benchmark log hook: seeds itself once from the fields it replaces,
 * appends, tombstones instead of deleting, and derives what the engines read.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBenchmarks } from '../hooks/useBenchmarks'
import type { OnboardingConfig } from '../hooks/useOnboarding'

const config = {
  raceType: 'road', completedAt: '2026-05-20T10:00:00Z',
  fitnessAnchor: { type: 'race_5k', valueSeconds: 1335, dateIso: '2026-05-02' },
  testedLthrBpm: 168,
} as unknown as OnboardingConfig

beforeEach(() => localStorage.clear())

describe('useBenchmarks', () => {
  it('seeds from the existing fields exactly once and persists under the athlete key', () => {
    const { result } = renderHook(() => useBenchmarks('mike', { config, capacity: { measuredAt: '2026-06-03', pushUps: 40 } }))
    expect(result.current.live.map(b => b.kind).sort()).toEqual(['lthr', 'push_ups', 'race_5k'])
    expect(result.current.anchors.fitnessAnchor).toEqual({ type: 'race_5k', valueSeconds: 1335, dateIso: '2026-05-02' })
    expect(result.current.anchors.testedLthrBpm).toBe(168)
    expect(result.current.anchors.capacity).toEqual({ measuredAt: '2026-06-03', pushUps: 40 })
    const stored = JSON.parse(localStorage.getItem('ba_benchmarks_v1_mike') ?? '[]')
    expect(stored).toHaveLength(3)
    expect(localStorage.getItem('__attune_meta:__stamp:ba_benchmarks_v1_mike')).toBeTruthy()
  })

  it('does not seed when the log already has history — even if it is all tombstones', () => {
    localStorage.setItem('ba_benchmarks_v1_mike', JSON.stringify([
      { id: 'seed_race_5k', kind: 'race_5k', value: 1335, unit: 'seconds', dateIso: '2026-05-02', source: 'derived', at: 1, deleted: true },
    ]))
    const { result } = renderHook(() => useBenchmarks('mike', { config, capacity: null }))
    expect(result.current.live).toEqual([])
    expect(result.current.hasHistory).toBe(true)
    expect(result.current.anchors).toEqual({})
  })

  it('a newer 5K becomes the anchor; the older one stays as history', () => {
    const { result } = renderHook(() => useBenchmarks('mike', { config, capacity: null }))
    act(() => { result.current.add({ kind: 'race_5k', value: 1300, unit: 'seconds', dateIso: '2026-08-30', source: 'manual' }) })
    expect(result.current.anchors.fitnessAnchor?.valueSeconds).toBe(1300)
    expect(result.current.live.filter(b => b.kind === 'race_5k')).toHaveLength(2)
  })

  it('remove is a tombstone, and the previous entry of that kind takes over', () => {
    const { result } = renderHook(() => useBenchmarks('mike', { config, capacity: null }))
    let added = ''
    act(() => { added = result.current.add({ kind: 'race_5k', value: 1300, unit: 'seconds', dateIso: '2026-08-30', source: 'manual' }).id })
    act(() => { expect(result.current.remove(added)).toBe(true) })
    expect(result.current.anchors.fitnessAnchor?.valueSeconds).toBe(1335)
    const stored = JSON.parse(localStorage.getItem('ba_benchmarks_v1_mike') ?? '[]') as { id: string; deleted?: true }[]
    expect(stored.find(b => b.id === added)?.deleted).toBe(true)
    act(() => { expect(result.current.remove(added)).toBe(false) })
  })

  it('removeKind clears every live entry of that kind', () => {
    const { result } = renderHook(() => useBenchmarks('mike', { config, capacity: null }))
    act(() => { result.current.add({ kind: 'lthr', value: 170, unit: 'bpm', dateIso: '2026-09-01', source: 'manual' }) })
    let ids: string[] = []
    act(() => { ids = result.current.removeKind('lthr') })
    expect(ids).toHaveLength(2)
    expect(result.current.anchors.testedLthrBpm).toBeUndefined()
  })

  it('is scoped per athlete', () => {
    renderHook(() => useBenchmarks('mike', { config, capacity: null }))
    const { result } = renderHook(() => useBenchmarks('jim', { config: null, capacity: null }))
    expect(result.current.live).toEqual([])
    expect(result.current.hasHistory).toBe(false)
  })
})
