/**
 * Initiative 004, PR 5: saving an uploaded plan through useOnboarding, and
 * the backup that makes it a one-tap undo.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOnboarding, type OnboardingConfig } from '../../hooks/useOnboarding'
import { captureBackup, readBackups, seasonForRestore, trimBackups, withRoomFromBackups, newestBackupIsCurrent, SEASON_KEY } from '../../utils/planBackups'
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

describe('saveIfRoom (onboarding\'s uploaded plan)', () => {
  const PREV = `ba_onboarding_prev_${ID}`
  const REDO = `ba_onboarding_redo_${ID}`
  const fullFor = (key: string) => {
    const real = Storage.prototype.setItem
    return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, value: string) {
      if (k === key) throw new DOMException('full', 'QuotaExceededError')
      return real.call(this, k, value)
    })
  }

  it('on a full phone changes nothing, in storage or on screen, and says so', () => {
    const { result } = renderHook(() => useOnboarding(ID))
    act(() => { result.current.requestRedo() })
    expect(result.current.redoRequested).toBe(true)
    localStorage.setItem(EDITS, JSON.stringify([{ id: 'e2', appliedAt: 2 }]))
    const full = fullFor(CFG)
    let ok = true
    act(() => { ok = result.current.saveIfRoom(withUpload()) })
    expect(ok).toBe(false)
    // Still mid-redo: onboarding stays on screen, prefilled, with the plan.
    expect(result.current.config).toBeNull()
    expect(result.current.redoRequested).toBe(true)
    expect(result.current.previousConfig?.raceName).toBe('Spring Marathon')
    expect(localStorage.getItem(CFG)).toBeNull()
    expect(localStorage.getItem(REDO)).toBe('1')
    expect(localStorage.getItem(PREV)).not.toBeNull()
    expect(localStorage.getItem(EDITS)).not.toBeNull()

    full.mockRestore()
    act(() => { ok = result.current.saveIfRoom(withUpload()) })
    expect(ok).toBe(true)
    expect(result.current.config?.importedPlan?.title).toBe('Club 10K block')
    expect(result.current.redoRequested).toBe(false)
    expect(result.current.previousConfig).toBeNull()
    expect(JSON.parse(localStorage.getItem(CFG)!).importedPlan.title).toBe('Club 10K block')
    expect(localStorage.getItem(REDO)).toBeNull()
    expect(localStorage.getItem(PREV)).toBeNull()
    expect(localStorage.getItem(EDITS)).toBeNull()
  })

  it('save() still shows the plan on a full phone, as it always has', () => {
    const { result } = renderHook(() => useOnboarding(ID))
    act(() => { result.current.requestRedo() })
    fullFor(CFG)
    act(() => { result.current.save(generated) })
    expect(result.current.config?.raceName).toBe('Spring Marathon')
    expect(result.current.redoRequested).toBe(false)
  })
})

/**
 * A full phone is the browser's ~5 MB for the whole site, not one key
 * (storageRoom.ts). The app frees its rebuildable caches before it gives
 * up; an uploaded plan, which cost one of the day's uploads to read, also
 * gets the room of all but the newest restore points (owner, 2026-10-10).
 * Modelled as storageRoom.test.ts does: a quota over all of localStorage.
 */
describe('a full phone: the older restore points make room for an uploaded plan', () => {
  const BACKUPS = `ba_plan_backups_${ID}`
  const REDO = `ba_onboarding_redo_${ID}`

  function installQuota(limit: number) {
    const original = Storage.prototype.setItem
    return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      let used = 0
      for (let i = 0; i < this.length; i++) {
        const k = this.key(i)!
        if (k !== key) used += k.length + (this.getItem(k)?.length ?? 0)
      }
      if (used + key.length + value.length > limit) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      original.call(this, key, value)
    })
  }
  const used = () => {
    let n = 0
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      n += k.length + (localStorage.getItem(k)?.length ?? 0)
    }
    return n
  }
  /** `count` older restore points of about `size` characters each, behind
   *  the current plan's own unless `withCurrent` is false. */
  function seedRing(size: number, withCurrent = true, count = 7) {
    const older = Array.from({ length: count }, (_, i) => {
      const completedAt = `2026-0${i + 1}-01T00:00:00.000Z`
      const config = JSON.stringify({ ...generated, raceName: `Old plan ${i + 1}`, completedAt, raceDescription: 'x'.repeat(size) })
      return { savedAt: 1_000 - i, reason: 'auto', raceName: `Old plan ${i + 1}`, completedAt, config, edits: {} }
    })
    const current = { savedAt: 2_000, reason: 'auto', raceName: 'Spring Marathon', completedAt: generated.completedAt, config: localStorage.getItem(CFG)!, edits: {} }
    localStorage.setItem(BACKUPS, JSON.stringify(withCurrent ? [current, ...older] : older))
  }
  // Too big for any room the restore points could make.
  const huge = () => ({ ...withUpload(), scheduleConstraintsNote: 'y'.repeat(30_000) } as OnboardingConfig)

  describe('trimBackups and withRoomFromBackups', () => {
    it('keeps the newest restore points', () => {
      seedRing(10)
      expect(trimBackups(ID, 2)).toBe(true)
      expect(readBackups(ID).map(b => b.raceName)).toEqual(['Spring Marathon', 'Old plan 1'])
    })

    it('drops nothing, and writes nothing, when there are no more than it keeps', () => {
      captureBackup(ID, 'auto')
      const before = localStorage.getItem(BACKUPS)
      expect(trimBackups(ID, 2)).toBe(false)
      expect(trimBackups(`${ID}-nobody`, 2)).toBe(false)
      expect(localStorage.getItem(BACKUPS)).toBe(before)
    })

    it('trims only when the write failed, tries once more, and puts them back if that fails too', () => {
      seedRing(10)
      const before = localStorage.getItem(BACKUPS)
      const write = vi.fn(() => true)
      expect(withRoomFromBackups(ID, write)).toBe(true)
      expect(write).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem(BACKUPS)).toBe(before)

      const second = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
      expect(withRoomFromBackups(ID, second)).toBe(true)
      expect(second).toHaveBeenCalledTimes(2)
      expect(readBackups(ID)).toHaveLength(2)

      seedRing(10)
      const never = vi.fn(() => false)
      expect(withRoomFromBackups(ID, never)).toBe(false)
      expect(never).toHaveBeenCalledTimes(2)
      expect(localStorage.getItem(BACKUPS)).toBe(before)

      // Nothing to trim: no second try.
      localStorage.removeItem(BACKUPS)
      const once = vi.fn(() => false)
      expect(withRoomFromBackups(ID, once)).toBe(false)
      expect(once).toHaveBeenCalledTimes(1)
    })

    it('the newest restore point is current when it holds the plan and its day edits', () => {
      captureBackup(ID, 'auto')
      expect(newestBackupIsCurrent(ID)).toBe(true)
      // An edit made since.
      localStorage.setItem(EDITS, JSON.stringify([{ id: 'e2', appliedAt: 2 }]))
      expect(newestBackupIsCurrent(ID)).toBe(false)
      // No edits now: a backup never trades the edits it holds for none.
      localStorage.removeItem(EDITS)
      expect(newestBackupIsCurrent(ID)).toBe(true)
      // Another plan, or none.
      localStorage.setItem(CFG, JSON.stringify({ ...generated, raceName: 'Other' }))
      expect(newestBackupIsCurrent(ID)).toBe(false)
      localStorage.removeItem(CFG)
      expect(newestBackupIsCurrent(ID)).toBe(false)
    })

    it('a failed try leaves the restore points as they were before it, whatever it wrote to them', () => {
      seedRing(10)
      const before = localStorage.getItem(BACKUPS)
      // A capture that lands (a new label), then a save that doesn't.
      expect(withRoomFromBackups(ID, () => { captureBackup(ID, 'before upload'); return false })).toBe(false)
      expect(localStorage.getItem(BACKUPS)).toBe(before)
      // No restore points before: none after.
      localStorage.removeItem(BACKUPS)
      expect(withRoomFromBackups(ID, () => { captureBackup(ID, 'auto'); return false })).toBe(false)
      expect(localStorage.getItem(BACKUPS)).toBeNull()
    })
  })

  describe('onboarding (saveIfRoom)', () => {
    it('the plan is saved once the older restore points make room', () => {
      seedRing(5_000)
      const { result } = renderHook(() => useOnboarding(ID))
      act(() => { result.current.requestRedo() })
      installQuota(used() + 300)
      let ok = false
      act(() => { ok = result.current.saveIfRoom(withUpload()) })
      expect(ok).toBe(true)
      expect(JSON.parse(localStorage.getItem(CFG)!).importedPlan.title).toBe('Club 10K block')
      expect(result.current.config?.importedPlan?.title).toBe('Club 10K block')
      expect(result.current.redoRequested).toBe(false)
      // The new plan's own restore point, then the two kept: the plan it
      // replaced and the one before.
      const ring = readBackups(ID)
      expect(ring.map(b => b.raceName)).toEqual(['Club 10K block', 'Spring Marathon', 'Old plan 1'])
      expect(ring[1].reason).toBe('before redo')
      expect(result.current.planBackups.map(b => b.raceName)).toEqual(ring.map(b => b.raceName))
    })

    it('when that isn\'t enough, nothing of the athlete\'s changes, and every restore point stays', () => {
      seedRing(500)
      const { result } = renderHook(() => useOnboarding(ID))
      act(() => { result.current.requestRedo() })
      const ring = localStorage.getItem(BACKUPS)
      installQuota(used() + 300)
      let ok = true
      act(() => { ok = result.current.saveIfRoom(huge()) })
      expect(ok).toBe(false)
      expect(localStorage.getItem(CFG)).toBeNull()
      expect(localStorage.getItem(REDO)).toBe('1')
      expect(result.current.config).toBeNull()
      expect(result.current.redoRequested).toBe(true)
      expect(localStorage.getItem(BACKUPS)).toBe(ring)
      // And again: still no room, still nothing changed.
      act(() => { ok = result.current.saveIfRoom(huge()) })
      expect(ok).toBe(false)
      expect(localStorage.getItem(BACKUPS)).toBe(ring)
    })
  })

  describe('Settings (importPlan)', () => {
    it('the upload lands once the older restore points make room, with the outgoing plan and its edits kept', () => {
      seedRing(5_000)
      const { result } = renderHook(() => useOnboarding(ID))
      const edits = localStorage.getItem(EDITS)
      installQuota(used() + 100)
      let ok = false
      act(() => { ok = result.current.importPlan(withUpload()) })
      expect(ok).toBe(true)
      expect(JSON.parse(localStorage.getItem(CFG)!).importedPlan.title).toBe('Club 10K block')
      const ring = readBackups(ID)
      expect(ring.map(b => b.raceName)).toEqual(['Club 10K block', 'Spring Marathon', 'Old plan 1'])
      expect(ring[1].reason).toBe('before upload')
      expect(ring[1].edits.ba_plan_edits).toBe(edits)
      expect(result.current.planBackups.map(b => b.raceName)).toEqual(ring.map(b => b.raceName))
    })

    it('backing up the outgoing plan can take that room too', () => {
      seedRing(5_000, false)
      installQuota(used() + 100)
      // On a full phone the backup taken when the app opened didn't land
      // (a ring of 7 grows by the whole plan; a full ring of 8 would drop
      // its oldest and shrink).
      const { result } = renderHook(() => useOnboarding(ID))
      expect(readBackups(ID).map(b => b.raceName)).not.toContain('Spring Marathon')
      let ok = false
      act(() => { ok = result.current.importPlan(withUpload()) })
      expect(ok).toBe(true)
      expect(readBackups(ID).map(b => b.raceName)).toEqual(['Club 10K block', 'Spring Marathon', 'Old plan 1', 'Old plan 2'])
    })

    it('the day edits made since the app opened reach a restore point before they are cleared', () => {
      seedRing(5_000)
      const { result } = renderHook(() => useOnboarding(ID))
      // Edits made after the backup taken when the app opened, too many for
      // the room left, though the new plan alone would fit.
      const edits = JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ id: `e${i}`, appliedAt: i + 1, note: 'x'.repeat(60) })))
      localStorage.setItem(EDITS, edits)
      installQuota(used() + 1_000)
      let ok = false
      act(() => { ok = result.current.importPlan(withUpload()) })
      expect(ok).toBe(true)
      expect(localStorage.getItem(EDITS)).toBeNull()
      const outgoing = readBackups(ID)[1]
      expect(outgoing.raceName).toBe('Spring Marathon')
      expect(outgoing.reason).toBe('before upload')
      expect(outgoing.edits.ba_plan_edits).toBe(edits)
    })

    it('and when no room can be made for them, the upload doesn\'t happen and they stay', () => {
      seedRing(10)
      const { result } = renderHook(() => useOnboarding(ID))
      const edits = JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ id: `e${i}`, appliedAt: i + 1, note: 'x'.repeat(60) })))
      localStorage.setItem(EDITS, edits)
      const cfg = localStorage.getItem(CFG)
      const ring = localStorage.getItem(BACKUPS)
      installQuota(used() + 1_000)
      let ok = true
      act(() => { ok = result.current.importPlan(withUpload()) })
      expect(ok).toBe(false)
      expect(localStorage.getItem(EDITS)).toBe(edits)
      expect(localStorage.getItem(CFG)).toBe(cfg)
      expect(localStorage.getItem(BACKUPS)).toBe(ring)
    })

    it('a failed upload loses no restore point, even one a backup taken in the try pushed out', () => {
      // Eight restore points, then a plan change the ring hasn't seen: the
      // upload's backup of it pushes the oldest out.
      seedRing(1_000, false, 8)
      const { result } = renderHook(() => useOnboarding(ID))
      act(() => { result.current.setPlanStart('2026-09-14') })
      const ring = localStorage.getItem(BACKUPS)
      expect(JSON.parse(ring!)).toHaveLength(8)
      installQuota(used() + 1_000)
      let ok = true
      act(() => { ok = result.current.importPlan(huge()) })
      expect(ok).toBe(false)
      expect(localStorage.getItem(BACKUPS)).toBe(ring)
      expect(result.current.planBackups).toEqual(JSON.parse(ring!))
    })

    it('when that isn\'t enough, the current plan, its edits and every restore point stay', () => {
      seedRing(500)
      const { result } = renderHook(() => useOnboarding(ID))
      const cfg = localStorage.getItem(CFG)
      const ring = readBackups(ID)
      installQuota(used() + 100)
      let ok = true
      act(() => { ok = result.current.importPlan(huge()) })
      expect(ok).toBe(false)
      expect(localStorage.getItem(CFG)).toBe(cfg)
      expect(localStorage.getItem(EDITS)).not.toBeNull()
      expect(result.current.config?.raceName).toBe('Spring Marathon')
      // Exactly as it was: not even the "before upload" label stays.
      expect(readBackups(ID)).toEqual(ring)
      expect(result.current.planBackups).toEqual(ring)
    })
  })
})
