/**
 * Local versioned plan backups — the safety net so a bad redo or a sync
 * mishap is a one-tap undo.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { captureBackup, readBackups, configForRestore, MAX_BACKUPS, type PlanBackup } from '../utils/planBackups'

const ID = 'mike'
const CFG = `ba_onboarding_${ID}`
const EDITS = `ba_plan_edits_${ID}`
const cfg = (completedAt: string, race: string) =>
  JSON.stringify({ raceType: 'hyrox', raceName: race, completedAt })

beforeEach(() => localStorage.clear())

describe('captureBackup', () => {
  it('does nothing when there is no config to save', () => {
    expect(captureBackup(ID, 'auto')).toEqual([])
    expect(readBackups(ID)).toEqual([])
  })

  it('captures the config and its edit keys, newest first', () => {
    localStorage.setItem(CFG, cfg('2026-08-28T00:00:00Z', 'Hyrox Anaheim'))
    localStorage.setItem(EDITS, '[{"id":"e1"}]')
    const list = captureBackup(ID, 'auto')
    expect(list).toHaveLength(1)
    expect(list[0].raceName).toBe('Hyrox Anaheim')
    expect(list[0].edits[`ba_plan_edits`]).toBe('[{"id":"e1"}]')
  })

  it('dedupes identical content — no duplicate stacking on every app open', () => {
    localStorage.setItem(CFG, cfg('2026-08-28T00:00:00Z', 'Hyrox Anaheim'))
    captureBackup(ID, 'auto')
    captureBackup(ID, 'auto')
    expect(readBackups(ID)).toHaveLength(1)
  })

  it('stacks a genuinely new version on top', () => {
    localStorage.setItem(CFG, cfg('2026-08-28T00:00:00Z', 'Hyrox Anaheim'))
    captureBackup(ID, 'auto')
    localStorage.setItem(CFG, cfg('2026-07-28T00:00:00Z', 'Oakland Hills Half'))
    const list = captureBackup(ID, 'before redo')
    expect(list).toHaveLength(2)
    expect(list[0].raceName).toBe('Oakland Hills Half')   // newest first
    expect(list[0].reason).toBe('before redo')
    expect(list[1].raceName).toBe('Hyrox Anaheim')
  })

  it('caps the ring at MAX_BACKUPS, dropping the oldest', () => {
    for (let i = 0; i < MAX_BACKUPS + 3; i++) {
      localStorage.setItem(CFG, cfg(`2026-08-${String(i + 1).padStart(2, '0')}T00:00:00Z`, `Race ${i}`))
      captureBackup(ID, 'auto')
    }
    const list = readBackups(ID)
    expect(list).toHaveLength(MAX_BACKUPS)
    expect(list[0].raceName).toBe(`Race ${MAX_BACKUPS + 2}`) // newest kept
    expect(list.some(b => b.raceName === 'Race 0')).toBe(false) // oldest dropped
  })

  it('is scoped per athlete', () => {
    localStorage.setItem(CFG, cfg('2026-08-28T00:00:00Z', 'Hyrox Anaheim'))
    captureBackup(ID, 'auto')
    expect(readBackups('jim')).toEqual([])
  })

  it('survives a corrupt backups blob rather than throwing', () => {
    localStorage.setItem(`ba_plan_backups_${ID}`, 'not json')
    expect(readBackups(ID)).toEqual([])
  })
})

describe('configForRestore', () => {
  it('stamps a FRESH completedAt so the restored config wins sync', () => {
    const b = { config: cfg('2026-07-28T00:00:00Z', 'Oakland Hills Half') } as PlanBackup
    const now = Date.parse('2026-08-30T12:00:00Z')
    const restored = configForRestore(b, now)!
    expect(restored.raceName).toBe('Oakland Hills Half')       // content preserved
    expect(restored.completedAt).toBe('2026-08-30T12:00:00.000Z') // but newest now
    expect(Date.parse(restored.completedAt!)).toBeGreaterThan(Date.parse('2026-07-28T00:00:00Z'))
  })

  it('returns null on an unparseable config', () => {
    expect(configForRestore({ config: 'nope' } as PlanBackup)).toBeNull()
  })
})

/** The key must NOT be on the sync allowlist — a backup that could itself be
 *  clobbered by a stale device would defeat the purpose. */
describe('backups are local only', () => {
  it('ba_plan_backups is not preserved/synced', async () => {
    const { isPreservedKey } = await import('../utils/migrate')
    expect(isPreservedKey(`ba_plan_backups_${ID}`)).toBe(false)
  })
})
