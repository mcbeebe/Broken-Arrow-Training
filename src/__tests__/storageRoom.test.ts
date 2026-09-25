/**
 * Field bug (2026-09-24): Settings → Garmin read "The quota has been
 * exceeded." Cached per-second workout streams had filled Safari's
 * localStorage; the Garmin sync's cache write threw, and the sync stopped
 * before it updated the app ("Last synced" froze). jsdom has no quota, so
 * these tests install one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  STREAM_CACHE_CAP, STORAGE_FULL_MESSAGE, cacheStreamBounded, evictStreamCaches, isQuotaError, isStreamCacheKey, setItemWithRoom,
} from '../utils/storageRoom'

/** Make localStorage throw Safari's QuotaExceededError past `limit` chars. */
function installQuota(limit: number) {
  const original = Storage.prototype.setItem
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    let used = 0
    for (let i = 0; i < this.length; i++) {
      const k = this.key(i)!
      if (k !== key) used += k.length + (this.getItem(k)?.length ?? 0)
    }
    if (used + key.length + value.length > limit) {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    }
    original.call(this, key, value)
  })
}

const blob = (n: number) => 'x'.repeat(n)

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  localStorage.clear()
})

describe('isQuotaError', () => {
  it('knows Safari and Firefox quota errors, and nothing else', () => {
    expect(isQuotaError(new DOMException('The quota has been exceeded.', 'QuotaExceededError'))).toBe(true)
    expect(isQuotaError(Object.assign(new Error('x'), { code: 22 }))).toBe(true)
    expect(isQuotaError(new Error('Garmin health fetch failed: 500'))).toBe(false)
    expect(isQuotaError('nope')).toBe(false)
  })
})

describe('setItemWithRoom', () => {
  it('a full storage frees the stream copies and the save goes through', () => {
    for (let i = 0; i < 8; i++) localStorage.setItem(`ba_garmin_streams_mike_${i}`, blob(10_000))
    localStorage.setItem('ba_manual_logs_mike', '{"2026-09-24":{}}')
    installQuota(85_000)
    expect(setItemWithRoom('ba_garmin_health_mike', blob(20_000))).toBe(true)
    expect(localStorage.getItem('ba_garmin_health_mike')).toHaveLength(20_000)
    expect(Object.keys(localStorage).some(isStreamCacheKey)).toBe(false)
    // The athlete's own data is never what gets freed.
    expect(localStorage.getItem('ba_manual_logs_mike')).toBe('{"2026-09-24":{}}')
  })

  it('never throws: too big even after freeing → false', () => {
    installQuota(10_000)
    expect(setItemWithRoom('ba_garmin_health_mike', blob(50_000))).toBe(false)
  })

  it('a non-quota failure is not answered by deleting streams', () => {
    localStorage.setItem('ba_strava_streams_1', blob(10))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('SecurityError') })
    expect(setItemWithRoom('k', 'v')).toBe(false)
    expect(localStorage.getItem('ba_strava_streams_1')).toBe(blob(10))
  })
})

describe('cacheStreamBounded', () => {
  it(`keeps only the ${STREAM_CACHE_CAP} newest copies, and pre-cap copies go first`, () => {
    for (let i = 0; i < 5; i++) localStorage.setItem(`ba_strava_streams_legacy${i}`, blob(10)) // written before the cap
    for (let i = 0; i < STREAM_CACHE_CAP + 3; i++) cacheStreamBounded(`ba_garmin_streams_mike_${i}`, blob(10))
    const kept = Object.keys(localStorage).filter(isStreamCacheKey)
    expect(kept).toHaveLength(STREAM_CACHE_CAP)
    expect(kept.some(k => k.includes('legacy'))).toBe(false)
    expect(kept).toContain(`ba_garmin_streams_mike_${STREAM_CACHE_CAP + 2}`)
    expect(kept).not.toContain('ba_garmin_streams_mike_0')
  })

  it('never throws on a full storage', () => {
    installQuota(100)
    expect(() => cacheStreamBounded('ba_garmin_streams_mike_1', blob(1_000))).not.toThrow()
  })

  it('evictStreamCaches removes every copy and nothing else', () => {
    localStorage.setItem('ba_strava_streams_1', 'a')
    localStorage.setItem('ba_garmin_streams_mike_2', 'b')
    localStorage.setItem('ba_plan_edits_mike', '[]')
    expect(evictStreamCaches()).toBe(2)
    expect(Object.keys(localStorage)).toEqual(['ba_plan_edits_mike'])
  })
})

describe('the field bug: a Garmin sync on a full phone', () => {
  const HEALTH = Array.from({ length: 120 }, (_, i) => ({
    date: `2026-05-${String((i % 28) + 1).padStart(2, '0')}-${i}`, hrv: 50, restingHR: 48, sleepScore: 80, note: blob(200),
  }))

  async function renderSync() {
    localStorage.setItem('ba_auth_session', JSON.stringify({ athleteId: 'mike', email: 'a@b.com', name: 'Mike', token: 'tok', provider: 'google' }))
    localStorage.setItem('ba_garmin_connected_mike', 'true')
    // Months of opened workouts: stream copies from before the cap.
    for (let i = 0; i < 30; i++) localStorage.setItem(`ba_garmin_streams_mike_${i}`, blob(3_000))
    installQuota(100_000)
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const payload = String(url).includes('/api/garmin/health') ? { dates: HEALTH } : { activities: [] }
      return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) } as Response
    }))
    vi.resetModules()
    vi.stubEnv('VITE_GARMIN_API_URL', 'https://api.example.test')
    const { useGarmin } = await import('../hooks/useGarmin')
    return renderHook(() => useGarmin('mike'))
  }

  it('syncs, saves, and says nothing about quotas', async () => {
    const { result } = await renderSync()
    await waitFor(() => expect(result.current.lastSync).not.toBeNull())
    expect(result.current.error).toBeNull()
    expect(result.current.healthData).toHaveLength(HEALTH.length)
    expect(JSON.parse(localStorage.getItem('ba_garmin_health_mike')!)).toHaveLength(HEALTH.length)
  })

  it('when even freed storage cannot hold it, the app still updates and the message is plain English', async () => {
    const { result } = await renderSync()
    vi.restoreAllMocks()
    installQuota(1_000) // tighter than the health data itself
    await result.current.sync()
    await waitFor(() => expect(result.current.error).toBe(STORAGE_FULL_MESSAGE))
    expect(result.current.healthData).toHaveLength(HEALTH.length)
    expect(result.current.error).not.toMatch(/quota/i)
  })
})
