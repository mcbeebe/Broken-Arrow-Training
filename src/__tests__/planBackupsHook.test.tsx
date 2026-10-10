/**
 * The backup/restore loop end to end through useOnboarding — the one-tap undo
 * for the exact thing that happened: a redo swapped the plan and lost a week.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useEffect, useRef } from 'react'
import { renderHook, act } from '@testing-library/react'
import { useOnboarding } from '../hooks/useOnboarding'
import { usePlanEdits } from '../hooks/usePlanEdits'
import { useDaySwap } from '../hooks/useDaySwap'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import type { PlanEdit } from '../types'

const ID = 'mike'
const CFG = `ba_onboarding_${ID}`
const EDITS = `ba_plan_edits_${ID}`

const seed = (over: Partial<OnboardingConfig> = {}) => ({
  raceType: 'hyrox', raceName: 'Hyrox Anaheim', raceDate: '2026-11-30',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 5,
  athleteName: 'Mike', age: 45, completedAt: '2026-08-28T00:00:00.000Z',
  planStartPinnedIso: '2026-08-24', ...over,
} as OnboardingConfig)

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(CFG, JSON.stringify(seed()))
  // An edit made under this plan (after its generation).
  localStorage.setItem(EDITS, JSON.stringify([{ id: 'e1', appliedAt: Date.parse('2026-09-01T00:00:00.000Z') }]))
})

describe('backup + restore through useOnboarding', () => {
  it('auto-captures the current plan on mount', () => {
    const { result } = renderHook(() => useOnboarding(ID))
    expect(result.current.planBackups.length).toBeGreaterThanOrEqual(1)
    expect(result.current.planBackups[0].raceName).toBe('Hyrox Anaheim')
  })

  it('snapshots before a redo, and restore brings the exact plan back', () => {
    const { result } = renderHook(() => useOnboarding(ID))

    // The redo (as happened): clears the config, snapshots it first.
    act(() => result.current.requestRedo())
    expect(result.current.config).toBeNull()
    const beforeRedo = result.current.planBackups.find(b => b.reason === 'before redo')
    expect(beforeRedo?.raceName).toBe('Hyrox Anaheim')

    // Restore it — the config comes back, and it's stamped newest so it wins sync.
    let ok = false
    act(() => { ok = result.current.restorePlan(beforeRedo!.savedAt) })
    expect(ok).toBe(true)
    expect(result.current.config?.raceName).toBe('Hyrox Anaheim')
    expect(result.current.config?.planStartPinnedIso).toBe('2026-08-24') // customization intact
    expect(Date.parse(result.current.config!.completedAt))
      .toBeGreaterThan(Date.parse('2026-08-28T00:00:00.000Z')) // fresh, wins sync
    // The redo state is cleared — we're not stuck mid-onboarding.
    expect(result.current.redoRequested).toBe(false)
  })

  it('restore brings back the edit keys captured with the snapshot, on the restored plan\'s generation', () => {
    const { result } = renderHook(() => useOnboarding(ID))
    const snap = result.current.planBackups[0]

    // Simulate a redo wiping the edits, then a different config saved.
    act(() => { localStorage.removeItem(EDITS); result.current.requestRedo() })

    act(() => { result.current.restorePlan(snap.savedAt) })
    // Moved onto the restored plan, so the edit hooks keep it.
    const gen = Date.parse(result.current.config!.completedAt)
    expect(JSON.parse(localStorage.getItem(EDITS)!)).toEqual([{ id: `r${gen}_e1`, appliedAt: gen }])
  })

  it('returns false for a savedAt that does not exist', () => {
    const { result } = renderHook(() => useOnboarding(ID))
    let ok = true
    act(() => { ok = result.current.restorePlan(999) })
    expect(ok).toBe(false)
  })
})

describe('restore, with the edit hooks mounted as the app mounts them', () => {
  // Every edit hook is handed the config's completedAt and drops anything
  // older. A restore stamps a fresh one, so this is where edits used to die.
  const useApp = () => {
    const onboarding = useOnboarding(ID)
    const generation = onboarding.config?.completedAt
    return { onboarding, edits: usePlanEdits(ID, generation), swaps: useDaySwap(ID, generation) }
  }
  const updateDay = (workout: string, dayIndex = 0) => [{ op: { kind: 'updateDay' as const, weekNum: 1, dayIndex, updates: { workout } } }]
  // A clock that moves a minute per step, so nothing passes by landing in
  // the same millisecond as the restore.
  let clock = Date.parse('2026-10-01T09:00:00.000Z')
  const tick = () => { clock += 60_000; vi.setSystemTime(clock) }
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(clock) })
  afterEach(() => vi.useRealTimers())

  it('keeps the plan\'s day edits and swaps, and an undo made before stays undone', () => {
    localStorage.removeItem(EDITS)
    const { result } = renderHook(() => useApp())
    let undone = ''
    // Undone on a day nothing edits again, so the undo itself is what keeps
    // it undone after the restore.
    tick(); act(() => { undone = result.current.edits.applyBatch(updateDay('Hill reps', 1)) })
    tick(); act(() => { result.current.edits.undoBatch(undone) })
    tick(); act(() => { result.current.edits.applyBatch(updateDay('Tempo with Sam')) })
    tick(); act(() => { result.current.swaps.swapDays(2, 0, 3) })
    expect(result.current.edits.edits).toHaveLength(1)

    // A redo, then a different plan saved: the old plan's edits are cleared.
    tick(); act(() => { result.current.onboarding.requestRedo() })
    const before = result.current.onboarding.planBackups.find(b => b.reason === 'before redo')!
    tick(); act(() => { result.current.onboarding.save(seed({ raceName: 'Spring Marathon', raceType: 'road' })) })
    expect(result.current.edits.edits).toHaveLength(0)
    expect(result.current.swaps.hasSwaps(2)).toBe(false)

    tick(); act(() => { result.current.onboarding.restorePlan(before.savedAt) })
    expect(result.current.onboarding.config?.raceName).toBe('Hyrox Anaheim')
    const live = result.current.edits.edits
    expect(live).toHaveLength(1)
    expect(live[0].op).toMatchObject({ kind: 'updateDay', updates: { workout: 'Tempo with Sam' } })
    expect(result.current.edits.hasEditForDay(1, 1)).toBe(false)
    expect(result.current.swaps.hasSwaps(2)).toBe(true)
  })

  it('an edit the morning autopilot makes in the same moment as the restore lands beside the restored ones', () => {
    localStorage.removeItem(EDITS)
    // As useMorningOutlook does: it acts in the commit that brings a plan,
    // with the applyBatch of that render.
    const useAppWithAutopilot = () => {
      const app = useApp()
      const generation = app.onboarding.config?.completedAt
      const seen = useRef(generation)
      useEffect(() => {
        if (!generation || generation === seen.current) return
        seen.current = generation
        app.edits.applyBatch(updateDay('Easy instead', 4))
      // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [generation])
      return app
    }
    const { result } = renderHook(() => useAppWithAutopilot())
    tick(); act(() => { result.current.edits.applyBatch(updateDay('Tempo with Sam')) })
    tick(); act(() => { result.current.onboarding.requestRedo() })
    const before = result.current.onboarding.planBackups.find(b => b.reason === 'before redo')!
    tick(); act(() => { result.current.onboarding.restorePlan(before.savedAt) })
    const workouts = (edits: PlanEdit[]) =>
      edits.map(e => (e.op.kind === 'updateDay' ? e.op.updates.workout : undefined)).sort()
    expect(workouts(result.current.edits.edits)).toEqual(['Easy instead', 'Tempo with Sam'])
    // And as the next app open reads it: the restored copy, not the old one
    // the autopilot's stale view would write back (dropped there as older
    // than the restored plan).
    const reopened = renderHook(() => usePlanEdits(ID, result.current.onboarding.config?.completedAt))
    expect(workouts(reopened.result.current.edits)).toEqual(['Easy instead', 'Tempo with Sam'])
  })

  it('a restored edit can still be undone', () => {
    localStorage.removeItem(EDITS)
    const { result } = renderHook(() => useApp())
    tick(); act(() => { result.current.edits.applyBatch(updateDay('Tempo with Sam')) })
    tick(); act(() => { result.current.onboarding.requestRedo() })
    const before = result.current.onboarding.planBackups.find(b => b.reason === 'before redo')!
    tick(); act(() => { result.current.onboarding.restorePlan(before.savedAt) })
    const restored = result.current.edits.edits
    expect(restored).toHaveLength(1)
    tick(); act(() => { result.current.edits.undoBatch(restored[0].batchId) })
    expect(result.current.edits.edits).toHaveLength(0)
  })
})
