/**
 * P9 — the queue's laws.
 *
 * Moving the pile off the morning would have been a relocation, not a fix,
 * if the queue could grow without limit or let proposals rot unanswered.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  buildQueue, expired, overflowCount, waitingDays, waitingLabel,
  QUEUE_CAP, STALE_DAYS, EXPIRE_DAYS, firstSeenAt, clearFirstSeen,
} from '../utils/reviewQueue'
import type { QueueItem } from '../utils/reviewQueue'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 7, 29, 12)

const item = (id: string, daysAgo: number): QueueItem => ({
  id, kind: 'mim', title: `Proposal ${id}`,
  consequence: 'Future erg days get slightly harder.',
  raisedAt: NOW - daysAgo * DAY,
})

describe('the cap', () => {
  it('never shows more than a decision\'s worth at once', () => {
    const many = Array.from({ length: 12 }, (_, i) => item(`i${i}`, i))
    expect(buildQueue(many, NOW)).toHaveLength(QUEUE_CAP)
  })

  it('reports what the cap is holding back rather than swallowing it', () => {
    const many = Array.from({ length: 10 }, (_, i) => item(`i${i}`, 1))
    expect(overflowCount(many, NOW)).toBe(10 - QUEUE_CAP)
  })

  it('counts no overflow when everything fits', () => {
    expect(overflowCount([item('a', 1), item('b', 2)], NOW)).toBe(0)
  })
})

describe('ageing', () => {
  it('puts the longest-waiting first — it has the best claim on a decision', () => {
    const q = buildQueue([item('new', 0), item('old', 9), item('mid', 3)], NOW)
    expect(q.map(i => i.id)).toEqual(['old', 'mid', 'new'])
  })

  it('flags an item that has waited past the stale mark', () => {
    const q = buildQueue([item('fresh', STALE_DAYS - 1), item('stale', STALE_DAYS)], NOW)
    expect(q.find(i => i.id === 'fresh')!.stale).toBe(false)
    expect(q.find(i => i.id === 'stale')!.stale).toBe(true)
  })

  it('says how long it has waited, in words that read naturally', () => {
    expect(waitingLabel(buildQueue([item('a', 0)], NOW)[0])).toBe('new today')
    expect(waitingLabel(buildQueue([item('a', 1)], NOW)[0])).toBe('waiting 1 day')
    expect(waitingLabel(buildQueue([item('a', 5)], NOW)[0])).toBe('waiting 5 days')
  })

  it('measures whole days, so an hour does not read as a day', () => {
    expect(waitingDays({ ...item('a', 0), raisedAt: NOW - 23 * 60 * 60 * 1000 }, NOW)).toBe(0)
  })
})

describe('expiry', () => {
  it('drops a proposal that silence has already answered', () => {
    const q = buildQueue([item('ancient', EXPIRE_DAYS), item('live', EXPIRE_DAYS - 1)], NOW)
    expect(q.map(i => i.id)).toEqual(['live'])
  })

  it('names what expired, so the log can say what happened rather than nothing', () => {
    const gone = expired([item('ancient', EXPIRE_DAYS + 3), item('live', 2)], NOW)
    expect(gone.map(i => i.id)).toEqual(['ancient'])
  })

  it('keeps expired items out of the overflow count too', () => {
    const items = Array.from({ length: 9 }, (_, i) => item(`i${i}`, EXPIRE_DAYS + 1))
    expect(overflowCount(items, NOW)).toBe(0)
    expect(buildQueue(items, NOW)).toHaveLength(0)
  })
})

describe('an empty queue', () => {
  it('is simply empty — no placeholder, no invented work', () => {
    expect(buildQueue([], NOW)).toEqual([])
    expect(expired([], NOW)).toEqual([])
    expect(overflowCount([], NOW)).toBe(0)
  })
})

/**
 * Ageing only means anything if it survives a reload.
 */
describe('when an item was first seen', () => {
  beforeEach(() => localStorage.clear())

  it('remembers, so the clock keeps running across sessions', () => {
    const t0 = firstSeenAt('mike', 'mim_rowing', NOW)
    expect(t0).toBe(NOW)
    // A week later the app opens again: the item is a week old, not new.
    const t1 = firstSeenAt('mike', 'mim_rowing', NOW + 7 * DAY)
    expect(t1).toBe(NOW)
    expect(waitingDays({ ...item('mim_rowing', 0), raisedAt: t1 }, NOW + 7 * DAY)).toBe(7)
  })

  it('keeps athletes separate', () => {
    firstSeenAt('mike', 'x', NOW)
    expect(firstSeenAt('sam', 'x', NOW + 3 * DAY)).toBe(NOW + 3 * DAY)
  })

  it('forgets once decided, so the same proposal later starts a fresh wait', () => {
    firstSeenAt('mike', 'x', NOW)
    clearFirstSeen('mike', 'x')
    expect(firstSeenAt('mike', 'x', NOW + 30 * DAY)).toBe(NOW + 30 * DAY)
  })

  it('treats a blocked store as new rather than crashing', () => {
    const original = Storage.prototype.getItem
    Storage.prototype.getItem = () => { throw new Error('denied') }
    try {
      expect(firstSeenAt('mike', 'x', NOW)).toBe(NOW)
    } finally {
      Storage.prototype.getItem = original
    }
  })
})
