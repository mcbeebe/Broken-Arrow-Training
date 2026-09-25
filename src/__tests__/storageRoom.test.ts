/**
 * Field bug (2026-09-24): Settings → Garmin read "The quota has been
 * exceeded." Cached per-second workout streams had filled Safari's
 * localStorage; the Garmin sync's cache write threw, and the sync stopped
 * before it updated the app ("Last synced" froze). jsdom has no quota, so
 * these tests install one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { act } from '@testing-library/react'
import {
  STREAM_CACHE_CAP, STREAM_CACHE_BUDGET, STORAGE_FULL_MESSAGE, cacheStreamBounded, evictStreamCaches, isQuotaError, isStreamCacheKey, setItemWithRoom,
} from '../utils/storageRoom'
import { cacheGarminActivities, cacheActivityDetails, cacheHealthData, healthSyncDays } from '../utils/garmin'
import { cacheActivities } from '../utils/strava'
import { cacheAppleHealth, cacheAppleActivities } from '../utils/apple'

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
    // Only as many stream copies as it took were freed…
    const left = Object.keys(localStorage).filter(isStreamCacheKey).length
    expect(left).toBeGreaterThan(0)
    expect(left).toBeLessThan(8)
    // …and the athlete's own data is never what gets freed.
    expect(localStorage.getItem('ba_manual_logs_mike')).toBe('{"2026-09-24":{}}')
  })

  it('never throws: too big even after freeing every stream copy → false', () => {
    for (let i = 0; i < 3; i++) localStorage.setItem(`ba_garmin_streams_mike_${i}`, blob(2_000))
    installQuota(10_000)
    expect(setItemWithRoom('ba_garmin_health_mike', blob(50_000))).toBe(false)
    expect(Object.keys(localStorage).some(isStreamCacheKey)).toBe(false) // it did try
  })

  it('frees oldest-first and stops as soon as the save fits — recent copies survive', () => {
    for (let i = 0; i < 5; i++) cacheStreamBounded(`ba_garmin_streams_mike_${i}`, blob(10_000))
    installQuota(55_000)
    expect(setItemWithRoom('ba_garmin_health_mike', blob(15_000))).toBe(true)
    const kept = Object.keys(localStorage).filter(isStreamCacheKey)
    expect(kept).toContain('ba_garmin_streams_mike_4')
    expect(kept).not.toContain('ba_garmin_streams_mike_0')
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

  it(`keeps the copies under ${STREAM_CACHE_BUDGET} characters, however few`, () => {
    const big = Math.floor(STREAM_CACHE_BUDGET / 3) + 1 // three of these break the budget
    for (let i = 0; i < 4; i++) cacheStreamBounded(`ba_strava_streams_${i}`, blob(big))
    const kept = Object.keys(localStorage).filter(isStreamCacheKey)
    expect(kept.sort()).toEqual(['ba_strava_streams_2', 'ba_strava_streams_3'])
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

describe('every sync cache makes room (review: only the health save was guarded)', () => {
  const fill = () => { for (let i = 0; i < 6; i++) localStorage.setItem(`ba_garmin_streams_mike_${i}`, blob(10_000)) }
  it.each([
    ['Garmin activities', () => cacheGarminActivities([{ date: '2026-09-24', note: blob(20_000) } as never], 'mike')],
    ['Garmin activity details', () => cacheActivityDetails({ '2026-09-24': [{ note: blob(20_000) } as never] }, 'mike')],
    ['Strava activities', () => cacheActivities([{ id: 1, note: blob(20_000) } as never], 'mike')],
    ['Apple health', () => cacheAppleHealth([{ date: '2026-09-24', note: blob(20_000) } as never], 'mike')],
    ['Apple activities', () => cacheAppleActivities([{ id: 'a', note: blob(20_000) } as never], 'mike')],
  ])('%s: saved after freeing stream copies, never a throw', (_label, save) => {
    fill()
    installQuota(70_000)
    expect(save()).toBe(true)
  })
})

describe('"Last synced" only with the data it describes (review: a fresh stamp hid stale data)', () => {
  it('Garmin: a health save that fails stamps nothing', () => {
    installQuota(500)
    expect(cacheHealthData([{ date: '2026-09-24', note: blob(5_000) } as never], 'mike')).toBe(false)
    expect(localStorage.getItem('ba_garmin_last_sync_mike')).toBeNull()
  })

  it('Strava: an activities save that fails stamps nothing', () => {
    installQuota(500)
    expect(cacheActivities([{ id: 1, note: blob(5_000) } as never], 'mike')).toBe(false)
    expect(localStorage.getItem('ba_strava_last_sync_mike')).toBeNull()
  })
})

describe('healthSyncDays: a sync closes the gap since the newest saved day', () => {
  const day = (date: string) => ({ date } as never)
  it('fresh cache → a week; a 15-day gap → 16 days; nothing cached or a huge gap → 120', () => {
    expect(healthSyncDays([day('2026-09-24')], '2026-09-25')).toBe(7)
    expect(healthSyncDays([day('2026-09-01'), day('2026-09-10')], '2026-09-25')).toBe(16)
    expect(healthSyncDays([], '2026-09-25')).toBe(120)
    expect(healthSyncDays([day('2026-01-01')], '2026-09-25')).toBe(120)
  })
})

describe('the auto-sync never loops (review HIGH: 1,697 fetches in 1.5 s on a full phone)', () => {
  it('a full phone with nothing to free syncs once on open, not forever', async () => {
    localStorage.setItem('ba_auth_session', JSON.stringify({ athleteId: 'mike', email: 'a@b.com', name: 'Mike', token: 'tok', provider: 'google' }))
    localStorage.setItem('ba_garmin_connected_mike', 'true')
    localStorage.setItem('ba_garmin_display_name_mike', 'Mike')
    const used = Object.keys(localStorage).reduce((n, k) => n + k.length + (localStorage.getItem(k)?.length ?? 0), 0)
    installQuota(used + 5)
    let healthCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/garmin/health')) healthCalls++
      const payload = String(url).includes('/api/garmin/health') ? { dates: [{ date: '2026-09-24', hrv: 50 }] } : { activities: [] }
      return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) } as Response
    }))
    vi.resetModules()
    vi.stubEnv('VITE_GARMIN_API_URL', 'https://api.example.test')
    const { useGarmin } = await import('../hooks/useGarmin')
    const { result } = renderHook(() => useGarmin('mike'))
    await waitFor(() => expect(result.current.error).toBe(STORAGE_FULL_MESSAGE))
    await act(async () => { await new Promise(r => setTimeout(r, 300)) })
    expect(healthCalls).toBe(1)
    expect(result.current.healthData).toHaveLength(1) // the app still has today's data
  })
})

describe('a workout log on a full phone never takes the app down (review: saveLogs threw inside a state updater)', () => {
  it('makes room from stream copies and saves', async () => {
    for (let i = 0; i < 4; i++) localStorage.setItem(`ba_strava_streams_${i}`, blob(10_000))
    installQuota(45_000)
    const { useManualLog } = await import('../hooks/useManualLog')
    const { result } = renderHook(() => useManualLog('mike'))
    act(() => result.current.logWorkout('Thu 9/24', { name: 'Strength', note: blob(8_000) } as never, '2026-09-24'))
    expect(JSON.parse(localStorage.getItem('ba_manual_logs_mike')!)['2026-09-24'].name).toBe('Strength')
  })

  it('with nothing to free, keeps the entry in memory instead of throwing', async () => {
    installQuota(100)
    const { useManualLog } = await import('../hooks/useManualLog')
    const { result } = renderHook(() => useManualLog('mike'))
    expect(() => act(() => result.current.logWorkout('Thu 9/24', { name: 'Strength' } as never, '2026-09-24'))).not.toThrow()
    expect(result.current.logs['2026-09-24']?.name).toBe('Strength')
  })
})
