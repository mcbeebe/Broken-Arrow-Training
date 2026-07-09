import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { AuthSession } from '../../utils/auth'
import { pushAll, getLastSyncError, clearSyncError } from '../../utils/backendSync'
import { stampKey, readLastUploadedStamp } from '../../utils/syncStamps'

/**
 * P0 postmortem, part two — the 504 FUNCTION_INVOCATION_TIMEOUT.
 *
 * The first sync after the allowlist fix pushed a weeks-long backlog in
 * one request and the server timed out. The client's answer: when a PUT
 * fails with a time/size status (504/413/…), HALVE the chunk and resend
 * — down to one item per request — stamping progress per landed piece so
 * the backlog always drains. Network-layer failures must NOT split
 * (offline would become a request storm).
 */

const session: AuthSession = {
  athleteId: 't', email: 't@x.com', name: 'T', token: 'tok', provider: 'google',
}

beforeEach(() => {
  localStorage.clear()
  clearSyncError()
  vi.stubEnv('VITE_GARMIN_API_URL', 'https://api.test')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

type Handler = (items: { key: string }[]) => { status: number }

/** Fetch mock that parses each PUT body and answers per `handler`.
 *  Successful responses report every item as written. */
function mockFetch(handler: Handler) {
  const itemCounts: number[] = []
  const fn = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
    const items = JSON.parse(String(init?.body)).items as { key: string }[]
    itemCounts.push(items.length)
    const r = handler(items)
    if (r.status === 200) {
      const body = { written: items.length, skipped: 0, rejected: [] }
      return {
        ok: true, status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
      }
    }
    return {
      ok: false, status: r.status,
      json: async () => ({}),
      text: async () => 'An error occurred with your deployment FUNCTION_INVOCATION_TIMEOUT',
    }
  })
  vi.stubGlobal('fetch', fn)
  return { fn, itemCounts }
}

function seed(keys: string[]): void {
  keys.forEach((k, i) => {
    localStorage.setItem(k, `"v${i}"`)
    stampKey(k, 1000 + i)
  })
}

describe('pushAll split-and-retry on function timeout', () => {
  it('halves a 504ing chunk until every item lands (backlog drains)', async () => {
    const keys = ['ba_soreness_t', 'ba_journal_notes_t', 'ba_plan_edits_t', 'ba_day_swaps_t']
    seed(keys)
    // The server can only survive single-item writes today.
    const { itemCounts } = mockFetch(items => ({ status: items.length > 1 ? 504 : 200 }))

    const r = await pushAll(session)

    expect(r.written).toBe(4)
    for (const k of keys) expect(readLastUploadedStamp(k)).toBeGreaterThan(0)
    expect(getLastSyncError()).toBeNull()
    // [4]→504, [2]→504, [1]✓ [1]✓, [2]→504, [1]✓ [1]✓ — and crucially no
    // same-size backoff retries of a split-eligible failure.
    expect(itemCounts).toEqual([4, 2, 1, 1, 2, 1, 1])
  })

  it('stamps the half that landed even when the other half keeps failing', async () => {
    seed(['ba_soreness_t', 'ba_journal_notes_bad'])
    // One key times out even alone (e.g. a single oversized value).
    mockFetch(items => ({
      status: items.some(i => i.key.includes('bad')) ? 504 : 200,
    }))

    vi.useFakeTimers()
    const outcome = pushAll(session).then(() => null, (e: Error) => e)
    await vi.runAllTimersAsync()
    const err = await outcome

    expect(err).toBeInstanceOf(Error)
    expect(err?.message).toContain('504')
    // The good key's progress persisted; the bad key retries next sync.
    expect(readLastUploadedStamp('ba_soreness_t')).toBeGreaterThan(0)
    expect(readLastUploadedStamp('ba_journal_notes_bad')).toBe(0)
    expect(getLastSyncError()?.message).toContain('504')
  })

  it('a network failure does NOT split — no request storm when offline', async () => {
    seed(['ba_soreness_t', 'ba_journal_notes_t', 'ba_plan_edits_t'])
    const fn = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', fn)

    vi.useFakeTimers()
    const outcome = pushAll(session).then(() => null, (e: Error) => e)
    await vi.runAllTimersAsync()
    const err = await outcome

    expect(err).toBeInstanceOf(TypeError)
    // One chunk × 3 backoff attempts — NOT 2N−1 split attempts.
    expect(fn).toHaveBeenCalledTimes(3)
    expect(getLastSyncError()).not.toBeNull()
  })

  it('caps items per chunk so huge backlogs ship as multiple requests', async () => {
    seed(Array.from({ length: 121 }, (_, i) => `ba_soreness_k${i}`))
    const { itemCounts } = mockFetch(() => ({ status: 200 }))

    const r = await pushAll(session)

    expect(r.written).toBe(121)
    expect(itemCounts).toEqual([120, 1])
  })
})
