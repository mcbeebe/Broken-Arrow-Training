/**
 * Initiative 004, PR 5: saving an uploaded plan through useOnboarding, and
 * the backup that makes it a one-tap undo.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOnboarding, type OnboardingConfig } from '../../hooks/useOnboarding'
import { captureBackup, readBackups, seasonForRestore, SEASON_KEY } from '../../utils/planBackups'
import { SEASON_STORAGE_KEY } from '../../engines/season'
import type { ImportedPlanV1 } from '../../utils/planImport/types'

const ID = 'mike'
const CFG = `ba_onboarding_${ID}`
const EDITS = `ba_plan_edits_${ID}`
const SWAPS = `ba_day_swaps_${ID}`
const SEASON = `ba_season_v1_${ID}`
const PANEL_RACE = { id: 'panel-5k_2026-12-05', priority: 'C', status: 'upcoming', raceInfo: { name: 'Panel 5K', date: '2026-12-05' } }

const generated = {
  raceType: 'road', raceName: 'Spring Marathon', raceDate: '2027-04-18', raceDistance: 'marathon',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 5, wearable: 'garmin',
  athleteName: 'Mike', age: 42, completedAt: '2026-09-01T00:00:00.000Z', planStartPinnedIso: '2026-09-07',
} as OnboardingConfig

const uploaded: ImportedPlanV1 = {
  v: 1,
  source: { name: 'Club 10K block.pdf', kind: 'pdf', importedAt: '2026-10-09T12:00:00.000Z' },
  title: 'Club 10K block',
  sport: 'road',
  weeks: [{ sessions: [{ day: 2, type: 'run', title: 'Easy', distanceMi: 4 }] }],
}

const withUpload = (plan: unknown = uploaded): OnboardingConfig =>
  ({ ...generated, raceName: '', raceDate: '', planStartPinnedIso: '2026-10-12', importedPlan: plan } as OnboardingConfig)

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(CFG, JSON.stringify(generated))
  localStorage.setItem(EDITS, JSON.stringify([{ id: 'e1', appliedAt: 1 }]))
})
afterEach(() => vi.restoreAllMocks())

describe('importPlan', () => {
  it('saves the uploaded plan as a new generation, clearing the old plan\'s day edits', () => {
    const { result } = renderHook(() => useOnboarding(ID))
    localStorage.setItem(SWAPS, '[{"id":"s1"}]')
    let ok = false
    act(() => { ok = result.current.importPlan(withUpload()) })
    expect(ok).toBe(true)
    expect(result.current.config?.importedPlan?.title).toBe('Club 10K block')
    expect(JSON.parse(localStorage.getItem(CFG)!).importedPlan.title).toBe('Club 10K block')
    expect(result.current.config?.completedAt).not.toBe(generated.completedAt)
    expect(localStorage.getItem(EDITS)).toBeNull()
    expect(localStorage.getItem(SWAPS)).toBeNull()
  })

  it('backs up the outgoing plan first, labelled, with the day edits made since the app opened', () => {
    const { result } = renderHook(() => useOnboarding(ID))
    // An edit made after the mount-time backup was taken.
    localStorage.setItem(EDITS, JSON.stringify([{ id: 'e1', appliedAt: 1 }, { id: 'e2', appliedAt: 2 }]))
    act(() => { result.current.importPlan(withUpload()) })
    const before = result.current.planBackups.find(b => b.reason === 'before upload')
    expect(before?.raceName).toBe('Spring Marathon')
    expect(JSON.parse(before!.config).raceDistance).toBe('marathon')
    expect(JSON.parse(before!.edits.ba_plan_edits)).toHaveLength(2)
  })

  // Storage only: in the app, the edit hooks then drop these edits as older
  // than the restored plan (an existing Restore bug, outside initiative 004).
  it('Restore brings the generated plan back and puts its edit log back in storage, even when both backups share a millisecond', () => {
    const { result } = renderHook(() => useOnboarding(ID))
    // Moving the start changes the config without a backup, so the "before
    // upload" capture is a new entry, taken in the same millisecond as
    // save()'s own; savedAt is how Restore finds one.
    act(() => { result.current.setPlanStart('2026-09-14') })
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-09T12:00:00.000Z'))
    act(() => { result.current.importPlan(withUpload()) })
    const ids = result.current.planBackups.map(b => b.savedAt)
    expect(new Set(ids).size).toBe(ids.length)
    const before = result.current.planBackups.find(b => b.reason === 'before upload')!
    act(() => { result.current.restorePlan(before.savedAt) })
    expect(result.current.config?.importedPlan).toBeUndefined()
    expect(result.current.config?.raceName).toBe('Spring Marathon')
    expect(result.current.config?.planStartPinnedIso).toBe('2026-09-14')
    expect(JSON.parse(localStorage.getItem(EDITS)!)).toEqual([{ id: 'e1', appliedAt: 1 }])
  })

  it('Restore brings back the season calendar as it was, marked so it is not re-seeded', () => {
    localStorage.setItem(SEASON, JSON.stringify({ races: [PANEL_RACE], blocks: [], seededGeneration: generated.completedAt }))
    const { result } = renderHook(() => useOnboarding(ID))
    act(() => { result.current.importPlan(withUpload()) })
    const before = result.current.planBackups.find(b => b.reason === 'before upload')!
    expect(JSON.parse(before.season!).races[0].raceInfo.name).toBe('Panel 5K')

    const heard: string[] = []
    const listen = (e: StorageEvent) => { if (e.key) heard.push(e.key) }
    window.addEventListener('storage', listen)
    act(() => { result.current.restorePlan(before.savedAt) })
    window.removeEventListener('storage', listen)

    const season = JSON.parse(localStorage.getItem(SEASON)!)
    expect(season.races.map((r: { raceInfo: { name: string } }) => r.raceInfo.name)).toEqual(['Panel 5K'])
    expect(season.seededGeneration).toBe(result.current.config?.completedAt)
    expect(heard).toContain(SEASON)
  })

  it('refuses the upload when the current plan can\'t be backed up first', () => {
    const { result } = renderHook(() => useOnboarding(ID))
    // A change the mount-time backup doesn't hold, so a new one is needed.
    act(() => { result.current.setPlanStart('2026-09-14') })
    const real = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === `ba_plan_backups_${ID}`) throw new DOMException('full', 'QuotaExceededError')
      return real.call(this, key, value)
    })
    let ok = true
    act(() => { ok = result.current.importPlan(withUpload()) })
    expect(ok).toBe(false)
    expect(result.current.config?.importedPlan).toBeUndefined()
    expect(JSON.parse(localStorage.getItem(CFG)!).importedPlan).toBeUndefined()
    expect(localStorage.getItem(EDITS)).not.toBeNull()
  })

  it('refuses a plan the app could not open, changing nothing', () => {
    const { result } = renderHook(() => useOnboarding(ID))
    const backups = JSON.stringify(readBackups(ID))
    let ok = true
    act(() => { ok = result.current.importPlan(withUpload({ v: 1, weeks: 'nope' })) })
    expect(ok).toBe(false)
    expect(result.current.config?.raceName).toBe('Spring Marathon')
    expect(localStorage.getItem(EDITS)).not.toBeNull()
    expect(JSON.stringify(readBackups(ID))).toBe(backups)
  })

  it('says so, and keeps the old plan showing, when the phone can\'t store it', () => {
    const { result } = renderHook(() => useOnboarding(ID))
    const real = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === CFG) throw new DOMException('full', 'QuotaExceededError')
      return real.call(this, key, value)
    })
    let ok = true
    act(() => { ok = result.current.importPlan(withUpload()) })
    expect(ok).toBe(false)
    expect(result.current.config?.importedPlan).toBeUndefined()
    expect(result.current.config?.raceName).toBe('Spring Marathon')
    expect(JSON.parse(localStorage.getItem(CFG)!).raceName).toBe('Spring Marathon')
  })
})

describe('captureBackup, for the same plan', () => {
  it('two backups taken in the same millisecond still get different ids', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    captureBackup(ID, 'auto')
    localStorage.setItem(CFG, JSON.stringify(withUpload()))
    const list = captureBackup(ID, 'auto')
    expect(list.map(b => b.savedAt)).toEqual([1_001, 1_000])
  })

  it('a "before upload" capture relabels the newest entry in place', () => {
    captureBackup(ID, 'auto')
    const list = captureBackup(ID, 'before upload')
    expect(list).toHaveLength(1)
    expect(list[0].reason).toBe('before upload')
  })

  it('an "auto" capture never takes that label away', () => {
    captureBackup(ID, 'before upload')
    expect(captureBackup(ID, 'auto')[0].reason).toBe('before upload')
  })

  it('takes edits made since, but never trades the edits it holds for none', () => {
    captureBackup(ID, 'auto')
    localStorage.setItem(EDITS, '[{"id":"e1"},{"id":"e2"}]')
    expect(captureBackup(ID, 'auto')[0].edits.ba_plan_edits).toBe('[{"id":"e1"},{"id":"e2"}]')
    localStorage.removeItem(EDITS)
    expect(captureBackup(ID, 'before upload')[0].edits.ba_plan_edits).toBe('[{"id":"e1"},{"id":"e2"}]')
  })

  it('an uploaded plan with no race is listed by its title', () => {
    localStorage.setItem(CFG, JSON.stringify(withUpload()))
    expect(captureBackup(ID, 'auto')[0].raceName).toBe('Club 10K block')
  })
})

describe('seasonForRestore', () => {
  const backup = (season?: string) => ({ savedAt: 1, reason: 'auto' as const, raceName: '', completedAt: null, config: '{}', edits: {}, ...(season ? { season } : {}) })

  it('marks the calendar as seeded for the restored plan', () => {
    const out = seasonForRestore(backup(JSON.stringify({ races: [PANEL_RACE], blocks: [], seededGeneration: 'old' })), 'new')
    expect(JSON.parse(out!)).toEqual({ races: [PANEL_RACE], blocks: [], seededGeneration: 'new' })
  })

  it('has nothing to restore from a backup taken before it kept the calendar, or a broken one', () => {
    expect(seasonForRestore(backup(), 'new')).toBeNull()
    expect(seasonForRestore(backup('{nope'), 'new')).toBeNull()
    expect(seasonForRestore(backup('{"races":"x"}'), 'new')).toBeNull()
  })

  it('reads and writes the season hook\'s own key', () => {
    expect(SEASON_KEY).toBe(SEASON_STORAGE_KEY)
  })
})
