/**
 * setPlanStart — the user-driven, OVERWRITING plan-start re-pin behind
 * Settings → Plan Start. Unlike pinPlanStart (a one-time migration that never
 * overwrites), this lets the athlete nudge week 1 after a mid-block redo put
 * it on the wrong Monday. It must overwrite, snap to Monday, and — like
 * pinPlanStart — never save() (which would wipe plan edits and logged history).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOnboarding } from '../hooks/useOnboarding'
import type { OnboardingConfig } from '../hooks/useOnboarding'

const ATHLETE = 'mike'
const CFG_KEY = `ba_onboarding_${ATHLETE}`
const EDITS_KEY = `ba_plan_edits_${ATHLETE}`

const seedConfig = (over: Partial<OnboardingConfig> = {}) => ({
  raceType: 'hyrox', raceName: 'Anaheim Hyrox', raceDate: '2026-11-30',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 5,
  athleteName: 'Mike', age: 45, completedAt: '2026-08-01T00:00:00.000Z',
  planStartPinnedIso: '2026-08-31', ...over,
} as OnboardingConfig)

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(CFG_KEY, JSON.stringify(seedConfig()))
  localStorage.setItem(EDITS_KEY, JSON.stringify([{ id: 'e1', batchId: 'b1', op: { kind: 'updateDay' }, appliedAt: 1 }]))
})

describe('setPlanStart', () => {
  it('OVERWRITES an existing pin (pinPlanStart would not)', () => {
    const { result } = renderHook(() => useOnboarding(ATHLETE))
    act(() => result.current.setPlanStart('2026-08-24'))
    expect(result.current.config?.planStartPinnedIso).toBe('2026-08-24')
    expect(JSON.parse(localStorage.getItem(CFG_KEY)!).planStartPinnedIso).toBe('2026-08-24')
  })

  it('snaps any date to that week’s Monday', () => {
    const { result } = renderHook(() => useOnboarding(ATHLETE))
    act(() => result.current.setPlanStart('2026-08-26')) // a Wednesday
    expect(result.current.config?.planStartPinnedIso).toBe('2026-08-24') // Monday
  })

  it('is non-destructive — plan edits and completedAt survive', () => {
    const { result } = renderHook(() => useOnboarding(ATHLETE))
    act(() => result.current.setPlanStart('2026-08-17'))
    // The whole point: a re-pin is not a rebuild.
    expect(JSON.parse(localStorage.getItem(EDITS_KEY)!)).toHaveLength(1)
    expect(result.current.config?.completedAt).toBe('2026-08-01T00:00:00.000Z')
  })

  it('is a no-op when the pin is already that Monday (no needless write)', () => {
    const { result } = renderHook(() => useOnboarding(ATHLETE))
    const before = localStorage.getItem(CFG_KEY)
    act(() => result.current.setPlanStart('2026-08-31')) // already the pin
    expect(localStorage.getItem(CFG_KEY)).toBe(before)
  })
})
