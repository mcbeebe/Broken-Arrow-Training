/**
 * Two devices, one edit log, nothing lost.
 *
 * `ba_plan_edits_<id>` is a single localStorage key holding the athlete's
 * ENTIRE structural edit history as one array. The sync transport is
 * last-write-wins per key, so accepting a coach proposal on the phone and
 * hand-editing a day on the laptop meant whichever device synced second
 * replaced the other's whole log — every edit on the losing device gone.
 *
 * Unioning the two logs fixes that, but only because removal is now
 * REPRESENTED rather than implied: undo, reset and remove-for-day append a
 * `revoke` tombstone instead of deleting rows. Without that, a union would
 * trade the data-loss bug for a worse one — an undone coach proposal
 * resurrected from the other device's stale copy, silently rewriting a plan
 * the athlete had already rejected. Both halves are tested here.
 */
import { describe, it, expect } from 'vitest'
import type { PlanEdit, TrainingWeek } from '../types'
import { isMergeableCollectionKey, mergeCollection } from '../utils/syncMerge'
import { applyRevocations, replayEdits } from '../hooks/usePlanEdits'

function edit(id: string, at: number, weekNum: number, dayIndex: number, workout: string, batchId = id): PlanEdit {
  return {
    id, batchId, appliedAt: at,
    op: { kind: 'updateDay', weekNum, dayIndex, updates: { workout } },
  }
}

function tombstone(id: string, at: number, target: PlanEdit['op']): PlanEdit {
  return { id, batchId: id, appliedAt: at, op: target }
}

function weeks(): TrainingWeek[] {
  return [{
    num: 1, dates: 'Mar 2–8', miles: 20,
    days: [
      { day: 'Mon', type: 'easy', workout: 'BASE-A', detail: '', zone: 'Z2', route: '', time: '' },
      { day: 'Tue', type: 'easy', workout: 'BASE-B', detail: '', zone: 'Z2', route: '', time: '' },
    ],
  }] as unknown as TrainingWeek[]
}

/** One sync round: local pulls the server's copy and unions it in. */
function merge(local: PlanEdit[], server: PlanEdit[], serverNewer = true): PlanEdit[] {
  const out = mergeCollection(JSON.stringify(local), JSON.stringify(server), serverNewer)
  expect(out, 'plan edits should take the union path, not fall back to LWW').not.toBeNull()
  return JSON.parse(out!.value) as PlanEdit[]
}

describe('the key is registered for merging', () => {
  it('recognises the athlete-scoped plan-edit log', () => {
    expect(isMergeableCollectionKey('ba_plan_edits_mike')).toBe(true)
    expect(isMergeableCollectionKey('ba_plan_edits:mike')).toBe(true)
  })

  it('does not accidentally claim unrelated keys', () => {
    // `ba_day_swaps` used to be listed here as a non-mergeable key. It is
    // mergeable now — same single-key shape, same loss under LWW — and has
    // its own suite in daySwapLockUnionMerge.test.ts.
    expect(isMergeableCollectionKey('ba_onboarding_mike')).toBe(false)
    expect(isMergeableCollectionKey('ba_theme')).toBe(false)
    expect(isMergeableCollectionKey('ba_storage_version')).toBe(false)
  })
})

describe('concurrent edits on two devices', () => {
  it('keeps BOTH devices’ edits — the data-loss bug', () => {
    const phone = [edit('e_phone', 100, 1, 0, 'PHONE EDIT')]
    const laptop = [edit('e_laptop', 200, 1, 1, 'LAPTOP EDIT')]

    const merged = merge(phone, laptop)
    const ids = merged.map(e => e.id)
    expect(ids).toContain('e_phone')
    expect(ids).toContain('e_laptop')

    const w = replayEdits(weeks(), merged)
    expect(w[0].days[0].workout).toBe('PHONE EDIT')
    expect(w[0].days[1].workout).toBe('LAPTOP EDIT')
  })

  it('converges: both devices end up with the same array', () => {
    const phone = [edit('e_phone', 100, 1, 0, 'PHONE')]
    const laptop = [edit('e_laptop', 200, 1, 1, 'LAPTOP')]
    // Each device merges the other's copy in; the results must be identical
    // or they re-push different arrays at each other forever.
    expect(JSON.stringify(merge(phone, laptop, true)))
      .toBe(JSON.stringify(merge(laptop, phone, false)))
  })

  it('is idempotent — re-merging the same server copy changes nothing', () => {
    const phone = [edit('e_phone', 100, 1, 0, 'PHONE')]
    const laptop = [edit('e_laptop', 200, 1, 1, 'LAPTOP')]
    const once = merge(phone, laptop)
    const twice = merge(once, laptop)
    expect(twice).toEqual(once)
    expect(mergeCollection(JSON.stringify(once), JSON.stringify(laptop), true)!.changed).toBe(false)
  })

  it('takes the server copy wholesale when the device has no log yet', () => {
    const server = [edit('e1', 100, 1, 0, 'SERVER')]
    const out = mergeCollection(null, JSON.stringify(server), true)
    expect(JSON.parse(out!.value)).toEqual(server)
  })
})

describe('an undo is not resurrected by the other device', () => {
  it('keeps a batch undone after merging a device that still has it', () => {
    // Phone accepted a coach proposal, then undid it. The laptop synced
    // before the undo, so its copy still carries the proposal.
    const applied = edit('e1', 100, 1, 0, 'COACH PROPOSAL', 'batch_1')
    const phone = [applied, tombstone('r1', 150, { kind: 'revoke', before: 150, batchId: 'batch_1' })]
    const laptop = [applied]

    const merged = merge(phone, laptop)
    expect(applyRevocations(merged)).toHaveLength(0)
    expect(replayEdits(weeks(), merged)[0].days[0].workout).toBe('BASE-A')
  })

  it('keeps a reset-all effective across the merge', () => {
    const phone = [
      edit('e1', 100, 1, 0, 'A'),
      tombstone('r_all', 300, { kind: 'revoke', before: 300, all: true }),
    ]
    const laptop = [edit('e1', 100, 1, 0, 'A'), edit('e2', 200, 1, 1, 'B')]
    const merged = merge(phone, laptop)
    expect(applyRevocations(merged)).toHaveLength(0)
  })

  it('keeps a remove-for-day effective across the merge', () => {
    const phone = [
      edit('e1', 100, 1, 0, 'A'),
      tombstone('r_day', 150, { kind: 'revoke', before: 150, day: { weekNum: 1, dayIndex: 0 } }),
    ]
    const laptop = [edit('e1', 100, 1, 0, 'A'), edit('e2', 120, 1, 1, 'OTHER DAY')]
    const live = applyRevocations(merge(phone, laptop))
    // Only the targeted day is revoked; the other device's unrelated edit stays.
    expect(live.map(e => e.id)).toEqual(['e2'])
  })

  it('does NOT kill an edit made AFTER the undo', () => {
    // The bound that stops an undo from swallowing a later re-edit — including
    // one that arrives from the other device after the tombstone was written.
    const phone = [
      edit('e1', 100, 1, 0, 'FIRST', 'batch_1'),
      tombstone('r1', 150, { kind: 'revoke', before: 150, batchId: 'batch_1' }),
    ]
    const laptop = [edit('e2', 900, 1, 0, 'LATER RE-EDIT', 'batch_1')]
    const merged = merge(phone, laptop)
    const live = applyRevocations(merged)
    expect(live.map(e => e.id)).toEqual(['e2'])
    expect(replayEdits(weeks(), merged)[0].days[0].workout).toBe('LATER RE-EDIT')
  })
})

describe('replay is last-wins per target, whatever the union restores', () => {
  it('lets the newest edit of a day win outright', () => {
    // A device that compacted away a superseded row gets it back from the
    // other device. The newer edit must still win — and the older op's fields
    // must not merge back in underneath it.
    const older: PlanEdit = {
      id: 'e_old', batchId: 'b1', appliedAt: 100,
      op: { kind: 'updateDay', weekNum: 1, dayIndex: 0, updates: { workout: 'OLD', detail: 'STALE DETAIL' } },
    }
    const newer: PlanEdit = {
      id: 'e_new', batchId: 'b2', appliedAt: 200,
      op: { kind: 'updateDay', weekNum: 1, dayIndex: 0, updates: { workout: 'NEW' } },
    }
    const w = replayEdits(weeks(), merge([newer], [older]))
    expect(w[0].days[0].workout).toBe('NEW')
    expect(w[0].days[0].detail).toBe('')
  })

  it('still stacks add/delete ops rather than superseding them', () => {
    const adds: PlanEdit[] = [
      { id: 'a1', batchId: 'b1', appliedAt: 100,
        op: { kind: 'addDay', weekNum: 1, atIndex: 2, day: { day: 'Wed', type: 'cross', workout: 'BIKE', detail: '', zone: 'Z2', route: '', time: '' } } },
      { id: 'a2', batchId: 'b2', appliedAt: 200,
        op: { kind: 'addDay', weekNum: 1, atIndex: 3, day: { day: 'Thu', type: 'cross', workout: 'SWIM', detail: '', zone: 'Z2', route: '', time: '' } } },
    ] as unknown as PlanEdit[]
    expect(replayEdits(weeks(), adds)[0].days).toHaveLength(4)
  })
})

describe('shapes that must not be unioned', () => {
  it('falls back to last-write-wins for a non-JSON value', () => {
    expect(mergeCollection('not json', 'also not json', true)).toBeNull()
  })

  it('falls back to last-write-wins when the server sends a primitive', () => {
    expect(mergeCollection('[]', '42', true)).toBeNull()
  })

  it('survives entries with no id rather than collapsing them together', () => {
    const local = [{ appliedAt: 1 }, { appliedAt: 2 }] as unknown as PlanEdit[]
    const server = [{ appliedAt: 3 }] as unknown as PlanEdit[]
    expect(merge(local, server)).toHaveLength(3)
  })
})
