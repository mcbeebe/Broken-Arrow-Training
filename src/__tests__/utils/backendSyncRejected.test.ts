import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { AuthSession } from '../../utils/auth'
import { pushAll, getLastSyncError, clearSyncError } from '../../utils/backendSync'
import { stampKey, readLastUploadedStamp } from '../../utils/syncStamps'

/**
 * P0 sync-outage client half: when the server rejects individual items
 * (fail-soft `rejected` report), the rejected keys must NOT be marked
 * uploaded (they retry every sync), the failure must be persistently
 * visible, and — the guard — the healthy keys in the same batch must
 * still land. The old behavior was the inverse: one bad key 400'd the
 * whole batch and everything failed invisibly.
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
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function mockPut(response: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => response,
    text: async () => JSON.stringify(response),
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('pushAll fail-soft handling', () => {
  it('healthy keys advance lastUploaded; rejected keys retry and stay visible', async () => {
    localStorage.setItem('ba_soreness_t', '{"a":1}')
    localStorage.setItem('ba_journal_notes_t', '[{"id":"n1"}]')
    stampKey('ba_soreness_t', 1000)
    stampKey('ba_journal_notes_t', 2000)

    mockPut({
      written: 1,
      skipped: 0,
      rejected: [{ index: 1, key: 'ba_journal_notes_t', reason: 'not on allowlist' }],
    })

    const r = await pushAll(session)
    expect(r.written).toBe(1)
    expect(r.rejectedKeys).toEqual(['ba_journal_notes_t'])
    // The healthy key is marked uploaded…
    expect(readLastUploadedStamp('ba_soreness_t')).toBe(1000)
    // …the rejected key is NOT (it retries until the server accepts it)…
    expect(readLastUploadedStamp('ba_journal_notes_t')).toBe(0)
    // …and the failure is persistently visible, naming the key.
    expect(getLastSyncError()?.message).toContain('ba_journal_notes_t')
  })

  it('a fully clean push clears the persistent error', async () => {
    localStorage.setItem('ba_soreness_t', '{"a":2}')
    stampKey('ba_soreness_t', 3000)
    mockPut({ written: 1, skipped: 0, rejected: [] })

    const r = await pushAll(session)
    expect(r.rejectedKeys).toEqual([])
    expect(getLastSyncError()).toBeNull()
  })

  it('a transport failure records the error before rethrowing (never invisible)', async () => {
    localStorage.setItem('ba_soreness_t', '{"a":3}')
    stampKey('ba_soreness_t', 4000)
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 500, json: async () => ({}), text: async () => 'boom',
    })))

    await expect(pushAll(session)).rejects.toThrow()
    expect(getLastSyncError()?.message).toContain('500')
  })
})
