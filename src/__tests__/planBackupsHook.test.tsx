/**
 * The backup/restore loop end to end through useOnboarding — the one-tap undo
 * for the exact thing that happened: a redo swapped the plan and lost a week.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOnboarding } from '../hooks/useOnboarding'
import type { OnboardingConfig } from '../hooks/useOnboarding'

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
  localStorage.setItem(EDITS, JSON.stringify([{ id: 'e1', appliedAt: 1 }]))
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

  it('restore brings back the edit keys captured with the snapshot', () => {
    const { result } = renderHook(() => useOnboarding(ID))
    const snap = result.current.planBackups[0]

    // Simulate a redo wiping the edits, then a different config saved.
    act(() => { localStorage.removeItem(EDITS); result.current.requestRedo() })

    act(() => { result.current.restorePlan(snap.savedAt) })
    expect(JSON.parse(localStorage.getItem(EDITS)!)).toEqual([{ id: 'e1', appliedAt: 1 }])
  })

  it('returns false for a savedAt that does not exist', () => {
    const { result } = renderHook(() => useOnboarding(ID))
    let ok = true
    act(() => { ok = result.current.restorePlan(999) })
    expect(ok).toBe(false)
  })
})
