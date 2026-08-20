/**
 * The pin is a silent one-time migration over every existing athlete, so
 * how it WRITES matters as much as what it writes: `save()` re-stamps
 * completedAt and deletes the plan-edit, day-swap and override op-logs
 * (correct when an athlete rebuilds, catastrophic for a migration). These
 * tests hold that line.
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
  experienceLevel: 'intermediate', trainingDaysPerWeek: 5, wearable: 'garmin',
  athleteName: 'Mike', age: 45, maxHR: 200, completedAt: '2026-08-01T00:00:00.000Z',
  ...over,
} as OnboardingConfig)

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(CFG_KEY, JSON.stringify(seedConfig()))
  localStorage.setItem(EDITS_KEY, JSON.stringify([{ id: 'e1', batchId: 'b1', op: { kind: 'updateDay', weekNum: 2, dayIndex: 1, updates: {} }, appliedAt: Date.now() }]))
})

describe('pinPlanStart', () => {
  it('stamps the pin and leaves plan edits alone', () => {
    const { result } = renderHook(() => useOnboarding(ATHLETE))
    act(() => result.current.pinPlanStart('2026-08-17'))

    expect(result.current.config?.planStartPinnedIso).toBe('2026-08-17')
    expect(JSON.parse(localStorage.getItem(CFG_KEY)!).planStartPinnedIso).toBe('2026-08-17')
    // The customizations survive — this is the whole point.
    expect(JSON.parse(localStorage.getItem(EDITS_KEY)!)).toHaveLength(1)
  })

  it('does NOT re-stamp completedAt (which would prune every edit at load)', () => {
    const { result } = renderHook(() => useOnboarding(ATHLETE))
    act(() => result.current.pinPlanStart('2026-08-17'))
    expect(result.current.config?.completedAt).toBe('2026-08-01T00:00:00.000Z')
  })

  it('is idempotent — a second call never moves an existing pin', () => {
    const { result } = renderHook(() => useOnboarding(ATHLETE))
    act(() => result.current.pinPlanStart('2026-08-17'))
    act(() => result.current.pinPlanStart('2026-09-14'))
    expect(result.current.config?.planStartPinnedIso).toBe('2026-08-17')
  })

  it('no-ops when there is no config (seed athletes keep their hardcoded plan)', () => {
    localStorage.removeItem(CFG_KEY)
    const { result } = renderHook(() => useOnboarding(ATHLETE))
    act(() => result.current.pinPlanStart('2026-08-17'))
    expect(result.current.config).toBeNull()
    expect(localStorage.getItem(CFG_KEY)).toBeNull()
  })

  it('for contrast: save() DOES clear the op-logs — why the pin cannot use it', () => {
    const { result } = renderHook(() => useOnboarding(ATHLETE))
    act(() => result.current.save(seedConfig({ planStartPinnedIso: '2026-08-17' })))
    expect(localStorage.getItem(EDITS_KEY)).toBeNull()
  })
})
