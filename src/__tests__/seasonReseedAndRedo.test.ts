import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { RaceInfo } from '../types'
import { useSeason } from '../hooks/useSeason'
import { useOnboarding, type OnboardingConfig } from '../hooks/useOnboarding'

/**
 * Field P0s from a live onboarding redo:
 *  1. The season seed was once-per-athlete-FOREVER, so a redo listing four
 *     races kept the year-old single-race season (two races "ignored").
 *  2. Plan edits/day swaps are index-keyed op-logs; replaying June's custom
 *     workouts onto a rebuilt calendar scattered them across September.
 *     A new plan generation must invalidate them (logged history lives in
 *     the ISO-keyed manual logs and is untouched).
 */

const planRace: RaceInfo = {
  name: 'Oakland Hills Half', date: '2026-10-24', startTime: '', distance: 'Half Marathon',
  distanceMiles: 13.1, elevation: '', elevationRange: '', course: '', cutoff: '',
  landmarks: [], gear: [], nutrition: '',
}

beforeEach(() => localStorage.clear())

describe('season re-seeds per plan generation', () => {
  it('a redo with MORE races seeds the new ones (the "ignored races" bug)', () => {
    const first = renderHook(() => useSeason(planRace, 't',
      [{ name: 'Hyrox - Anaheim', date: '2026-12-12', priority: 'A' as const }], 'gen-1'))
    expect(first.result.current.season.races).toHaveLength(2)
    first.unmount()

    // Redo: same Hyrox re-captured (now layered) + two NEW races.
    const second = renderHook(() => useSeason(planRace, 't', [
      { name: 'Hyrox - Anaheim', date: '2026-12-12', priority: 'A' as const, integration: 'layered' as const, format: 'hyrox' as const },
      { name: 'Turkey Trot', date: '2026-11-26', priority: 'C' as const, format: 'road' as const },
      { name: 'CIM Marathon', date: '2027-04-11', priority: 'A' as const, format: 'road' as const },
    ], 'gen-2'))
    const names = second.result.current.season.races.map(r => r.raceInfo.name)
    expect(names).toContain('Hyrox - Anaheim')
    expect(names).toContain('Turkey Trot')
    expect(names).toContain('CIM Marathon')
    // The re-captured race adopted the fresh answers instead of duplicating.
    const hyrox = second.result.current.season.races.find(r => r.raceInfo.name === 'Hyrox - Anaheim')!
    expect(hyrox.integration).toBe('layered')
    expect(second.result.current.season.races.filter(r => r.raceInfo.name === 'Hyrox - Anaheim')).toHaveLength(1)
  })

  it('GUARD: within one generation, a panel removal is never undone by re-mounts', () => {
    const seeds = [{ name: 'Hyrox LA', date: '2026-11-07', priority: 'A' as const }]
    const first = renderHook(() => useSeason(planRace, 't', seeds, 'gen-1'))
    act(() => first.result.current.removeRace(
      first.result.current.season.races.find(r => r.raceInfo.name === 'Hyrox LA')!.id))
    first.unmount()
    const second = renderHook(() => useSeason(planRace, 't', seeds, 'gen-1'))
    expect(second.result.current.season.races.map(r => r.raceInfo.name)).not.toContain('Hyrox LA')
  })
})

describe('completing onboarding invalidates old-plan day customizations', () => {
  it('save() clears plan edits, day swaps, and legacy overrides (tombstoned)', () => {
    localStorage.setItem('ba_plan_edits_t', JSON.stringify([{ id: 'e1' }]))
    localStorage.setItem('ba_day_swaps_t', JSON.stringify({ 3: [[0, 1]] }))
    localStorage.setItem('ba_plan_overrides_t', JSON.stringify({}))
    const { result } = renderHook(() => useOnboarding('t'))
    act(() => result.current.save({
      raceType: 'trail', raceName: 'New Race', raceDate: '2026-10-24',
      experienceLevel: 'intermediate', trainingDaysPerWeek: 5, wearable: 'none',
      athleteName: 'Mike', age: 42, completedAt: '',
    } as OnboardingConfig))
    expect(localStorage.getItem('ba_plan_edits_t')).toBeNull()
    expect(localStorage.getItem('ba_day_swaps_t')).toBeNull()
    expect(localStorage.getItem('ba_plan_overrides_t')).toBeNull()
    // Tombstone stamps exist so a sync pull can't resurrect the old edits.
    expect(localStorage.getItem('__attune_meta:__stamp:ba_plan_edits_t')).not.toBeNull()
  })

  it('requestRedo snapshots the outgoing config so the redo can prefill basics', () => {
    const old = {
      raceType: 'trail', raceName: 'Old Race', raceDate: '2026-08-01',
      experienceLevel: 'intermediate', trainingDaysPerWeek: 5, wearable: 'garmin',
      athleteName: 'Mike', age: 42, completedAt: '2026-06-01T00:00:00.000Z',
    } as OnboardingConfig
    localStorage.setItem('ba_onboarding_t', JSON.stringify(old))
    const { result } = renderHook(() => useOnboarding('t'))
    act(() => result.current.requestRedo())
    // The live config is gone (redo in progress)…
    expect(result.current.config).toBeNull()
    // …but the snapshot carries the profile forward, and survives a refresh.
    expect(result.current.previousConfig?.athleteName).toBe('Mike')
    expect(result.current.previousConfig?.age).toBe(42)
    expect(JSON.parse(localStorage.getItem('ba_onboarding_prev_t')!).athleteName).toBe('Mike')
    // Completing the redo disposes of the snapshot.
    act(() => result.current.save({
      raceType: 'trail', raceName: 'New Race', raceDate: '2026-10-24',
      experienceLevel: 'intermediate', trainingDaysPerWeek: 5, wearable: 'garmin',
      athleteName: 'Mike', age: 42, completedAt: '',
    } as OnboardingConfig))
    expect(result.current.previousConfig).toBeNull()
    expect(localStorage.getItem('ba_onboarding_prev_t')).toBeNull()
  })

  it('GUARD: manual logs (the journal) survive a save untouched', () => {
    localStorage.setItem('ba_manual_logs_t', JSON.stringify({ '2026-06-05': { notes: 'Granite Mtn with pack' } }))
    const { result } = renderHook(() => useOnboarding('t'))
    act(() => result.current.save({
      raceType: 'trail', raceName: 'New Race', raceDate: '2026-10-24',
      experienceLevel: 'intermediate', trainingDaysPerWeek: 5, wearable: 'none',
      athleteName: 'Mike', age: 42, completedAt: '',
    } as OnboardingConfig))
    expect(JSON.parse(localStorage.getItem('ba_manual_logs_t')!)['2026-06-05'].notes).toBe('Granite Mtn with pack')
  })
})

describe('near-duplicate race hygiene (typo dedupe)', () => {
  it('a typo variant of a stored race is REPLACED (corrected name), never duplicated', () => {
    // Stored under the typo'd name; the redo re-captures it spelled right.
    const first = renderHook(() => useSeason(planRace, 't',
      [{ name: 'Tamalpais Trail Maraton', date: '2026-11-07', priority: 'A' as const }], 'gen-1'))
    expect(first.result.current.season.races).toHaveLength(2)
    first.unmount()
    const second = renderHook(() => useSeason(planRace, 't',
      [{ name: 'Tamalpais Trail Marathon', date: '2026-11-07', priority: 'B' as const }], 'gen-2'))
    const names = second.result.current.season.races.map(r => r.raceInfo.name)
    expect(names.filter(n => n.startsWith('Tamalpais'))).toEqual(['Tamalpais Trail Marathon'])
    expect(second.result.current.season.races.find(r => r.raceInfo.name === 'Tamalpais Trail Marathon')!.priority).toBe('B')
  })

  it('a stored typo variant of the ANCHOR race never rides along as a second race', () => {
    localStorage.setItem('ba_season_v1_t', JSON.stringify({
      races: [
        { id: 'oakland-hills-half-maraton_2026-10-24', priority: 'A', status: 'upcoming', raceInfo: { name: 'Oakland Hills Half Maraton', date: '2026-10-24', startTime: '', distance: 'Half Marathon', distanceMiles: 13.1, elevation: '', elevationRange: '', course: '', cutoff: '', landmarks: [], gear: [], nutrition: '' } },
      ],
      blocks: [],
    }))
    // The anchor is the correctly spelled race on the same date.
    const anchor: RaceInfo = { ...planRace, name: 'Oakland Hills Half Marathon' }
    const { result } = renderHook(() => useSeason(anchor, 't'))
    const names = result.current.season.races.map(r => r.raceInfo.name)
    expect(names.filter(n => n.startsWith('Oakland Hills'))).toEqual(['Oakland Hills Half Marathon'])
  })

  it('GUARD: same name on DIFFERENT dates is a legitimate series, not a duplicate', () => {
    const { result } = renderHook(() => useSeason(planRace, 't', [
      { name: 'Hyrox LA', date: '2026-11-07', priority: 'B' as const },
      { name: 'Hyrox LA', date: '2027-03-06', priority: 'B' as const },
    ], 'gen-1'))
    expect(result.current.season.races.filter(r => r.raceInfo.name === 'Hyrox LA')).toHaveLength(2)
  })
})
