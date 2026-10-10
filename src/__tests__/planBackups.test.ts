/**
 * Local versioned plan backups — the safety net so a bad redo or a sync
 * mishap is a one-tap undo.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { captureBackup, readBackups, configForRestore, editsForRestore, MAX_BACKUPS, type PlanBackup } from '../utils/planBackups'
import { mergeCollection } from '../utils/syncMerge'
import { pruneStaleEdits } from '../hooks/usePlanEdits'
import type { PlanEdit } from '../types'

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

describe('editsForRestore', () => {
  const GEN = '2026-08-01T00:00:00.000Z'           // the backed-up plan's generation
  const RESTORED = '2026-10-10T09:00:00.000Z'      // the restore's fresh one
  const R = Date.parse(RESTORED)
  const t = (iso: string) => Date.parse(iso)
  const backup = (edits: Record<string, unknown>): PlanBackup => ({
    savedAt: 1, reason: 'before redo', raceName: 'Hyrox Anaheim', completedAt: GEN, config: '{}',
    edits: Object.fromEntries(Object.entries(edits).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])),
  })

  it('moves every edit, undo, swap and reset onto the restored plan, in their order, across all three logs', () => {
    const out = editsForRestore(backup({
      ba_plan_edits: [
        { id: 'a', batchId: 'b1', op: { kind: 'updateDay', weekNum: 1, dayIndex: 0, updates: {} }, appliedAt: t('2026-08-02T00:00:00Z') },
        { id: 'u', batchId: 'u1', op: { kind: 'revoke', before: t('2026-08-03T00:00:00Z'), batchId: 'b1' }, appliedAt: t('2026-08-03T00:00:00Z') },
        { id: 'c', batchId: 'b2', op: { kind: 'updateDay', weekNum: 2, dayIndex: 1, updates: {} }, appliedAt: t('2026-08-05T00:00:00Z') },
      ],
      ba_day_swaps: [
        { id: 's1', weekNum: 1, fromIndex: 0, toIndex: 1, at: t('2026-08-04T00:00:00Z') },
        { id: 'r1', weekNum: 1, at: t('2026-08-06T00:00:00Z'), reset: true },
      ],
      ba_plan_overrides: [{ id: 'o1', weekNum: 1, dayIndex: 2, updates: {}, appliedAt: t('2026-08-02T00:00:00Z') }],
    }), RESTORED)
    const edits = JSON.parse(out.ba_plan_edits)
    const swaps = JSON.parse(out.ba_day_swaps)
    const overrides = JSON.parse(out.ba_plan_overrides)
    // Five distinct times, in order, now the first five milliseconds of the restored plan.
    expect(edits.map((e: { appliedAt: number }) => e.appliedAt)).toEqual([R, R + 1, R + 3])
    expect(edits[1].op.before).toBe(R + 1)
    expect(swaps.map((s: { at: number }) => s.at)).toEqual([R + 2, R + 4])
    expect(overrides[0].appliedAt).toBe(R) // the same moment as edit a, still
    // Each edit and swap is made afresh on the restored plan (a new id), but
    // keeps its batch, which undo and receipts go by. Legacy overrides keep
    // their id: their migration takes the batch from it.
    expect(edits.map((e: { id: string }) => e.id)).toEqual([`r${R}_a`, `r${R}_u`, `r${R}_c`])
    expect(swaps.map((s: { id: string }) => s.id)).toEqual([`r${R}_s1`, `r${R}_r1`])
    expect(overrides[0].id).toBe('o1')
    // Nothing else about an entry changes.
    expect(edits[0]).toMatchObject({ batchId: 'b1', op: { kind: 'updateDay', weekNum: 1, dayIndex: 0 } })
    expect(edits[1].op).toMatchObject({ kind: 'revoke', batchId: 'b1' })
    expect(swaps[1]).toMatchObject({ weekNum: 1, reset: true })
  })

  it('survives another device that still holds the old copies and pushed its log last', () => {
    // Phone A restores. Laptop B still holds the plan's old log, makes an
    // edit, and pushes first: its whole log is the newer one, which wins any
    // clash of ids. Under the old ids, B's old copy replaced the restored one,
    // and then dropped out as older than the restored plan.
    const day = (dayIndex: number) => ({ kind: 'updateDay', weekNum: 1, dayIndex, updates: {} })
    const old = [{ id: 'a', batchId: 'b1', op: day(0), appliedAt: t('2026-08-02T00:00:00Z') }]
    const restored = editsForRestore(backup({ ba_plan_edits: old }), RESTORED).ba_plan_edits
    const fromLaptop = JSON.stringify([...old, { id: 'b-new', batchId: 'bn', op: day(3), appliedAt: R + 60_000 }])
    const merged = JSON.parse(mergeCollection(restored, fromLaptop, true, 'ba_plan_edits_mike')!.value) as PlanEdit[]
    expect(pruneStaleEdits(merged, RESTORED).map(e => e.id).sort()).toEqual(['b-new', `r${R}_a`])
  })

  it('an id from an earlier restore is renamed, not stacked, and a swap with no id keeps none', () => {
    const out = editsForRestore(backup({
      ba_plan_edits: [{ id: 'r1790000000000_a', appliedAt: t('2026-08-02T00:00:00Z') }],
      ba_day_swaps: [{ weekNum: 1, fromIndex: 0, toIndex: 1, at: t('2026-08-03T00:00:00Z') }],
    }), RESTORED)
    expect(JSON.parse(out.ba_plan_edits)[0].id).toBe(`r${R}_a`)
    expect(JSON.parse(out.ba_day_swaps)[0]).not.toHaveProperty('id')
  })

  it('leaves out what its own plan had already dropped: entries older than the backed-up plan', () => {
    const out = editsForRestore(backup({
      ba_plan_edits: [{ id: 'old', appliedAt: t('2026-07-01T00:00:00Z') }, { id: 'kept', appliedAt: t('2026-08-02T00:00:00Z') }],
      ba_day_swaps: [{ id: 'old', weekNum: 1, fromIndex: 0, toIndex: 1, at: t('2026-07-01T00:00:00Z') }],
    }), RESTORED)
    expect(JSON.parse(out.ba_plan_edits)).toEqual([{ id: `r${R}_kept`, appliedAt: R }])
    expect(JSON.parse(out.ba_day_swaps)).toEqual([])
  })

  it('keeps an entry made the moment its plan was, as the edit hooks do', () => {
    const out = editsForRestore(backup({
      ba_plan_edits: [{ id: 'same', appliedAt: t(GEN) }],
      ba_day_swaps: [{ id: 'same', weekNum: 1, fromIndex: 0, toIndex: 1, at: t(GEN) }],
    }), RESTORED)
    expect(JSON.parse(out.ba_plan_edits)).toEqual([{ id: `r${R}_same`, appliedAt: R }])
    expect(JSON.parse(out.ba_day_swaps)).toHaveLength(1)
  })

  it('keeps a legacy swap with no time as it was, and a log it can\'t read as it was', () => {
    const legacy = { weekNum: 1, fromIndex: 2, toIndex: 3 }
    const out = editsForRestore(backup({ ba_day_swaps: [legacy], ba_plan_edits: 'not json', ba_plan_overrides: '{"not":"a list"}' }), RESTORED)
    expect(JSON.parse(out.ba_day_swaps)).toEqual([legacy])
    expect(out.ba_plan_edits).toBe('not json')
    expect(out.ba_plan_overrides).toBe('{"not":"a list"}')
  })

  it('a backup with no generation of its own keeps every entry, moved onto the restored plan', () => {
    const b = { ...backup({ ba_plan_edits: [{ id: 'a', appliedAt: 5 }] }), completedAt: null }
    expect(JSON.parse(editsForRestore(b, RESTORED).ba_plan_edits)).toEqual([{ id: `r${R}_a`, appliedAt: R }])
  })

  it('changes nothing when the restored generation can\'t be read', () => {
    const b = backup({ ba_plan_edits: [{ id: 'a', appliedAt: t('2026-08-02T00:00:00Z') }] })
    expect(editsForRestore(b, 'not a date')).toEqual(b.edits)
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
