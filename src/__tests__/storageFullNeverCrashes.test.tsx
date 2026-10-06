/**
 * Field bug (2026-10-06): the whole app went to "Something went wrong —
 * QuotaExceededError: The quota has been exceeded." on an iPhone. The
 * stack (mapped through a rebuilt bundle's sourcemap) was useDaySwap's
 * saveSwaps → a bare localStorage.setItem inside a setSwaps updater, so
 * the throw landed in React's render and the error boundary took over.
 * Storage had filled with coach insight copies (a fresh set per day, read
 * only for 48 h) and per-day briefing logs (only today's is read), none
 * ever deleted. jsdom has no quota, so these tests install one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  BRIEFING_LOG_PREFIX, INSIGHT_CACHE_MAX_AGE_MS, INSIGHT_CACHE_PREFIX,
  isExpiredInsightCopy, setItemWithRoom, setSyncedItemWithRoom, setSyncedItemWithRoomOrThrow,
  sweepExpiredCaches,
} from '../utils/storageRoom'
import { useDaySwap } from '../hooks/useDaySwap'
import { useOnboarding, type OnboardingConfig } from '../hooks/useOnboarding'
import { useSoreness } from '../hooks/useSoreness'
import { useMaxHR } from '../hooks/useMaxHR'
import { useHRZones } from '../hooks/useHRZones'
import { useTheme } from '../hooks/useTheme'

const STAMP = '__attune_meta:__stamp:'
const LAST_UP = '__attune_meta:__lastUpload:'
const NOW = new Date(2026, 9, 6, 18, 0).getTime() // 2026-10-06 18:00 local
const HOUR = 60 * 60 * 1000

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

function usedChars(): number {
  let n = 0
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!
    n += k.length + (localStorage.getItem(k)?.length ?? 0)
  }
  return n
}

const blob = (n: number) => 'x'.repeat(n)
const insightKey = (hash: string) => `${INSIGHT_CACHE_PREFIX}mike:daily:${hash}`
const insight = (generatedAt: number, size = 100) => JSON.stringify({ text: blob(size), generatedAt })
const briefingKey = (date: string) => `${BRIEFING_LOG_PREFIX}mike:${date}`

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  localStorage.clear()
})

describe('the field bug: swapping two days on a full phone', () => {
  it('with nothing to free, the swap stays in memory and nothing throws', () => {
    const { result } = renderHook(() => useDaySwap('mike'))
    installQuota(10)
    expect(() => act(() => result.current.swapDays(3, 0, 2))).not.toThrow()
    expect(result.current.hasSwaps(3)).toBe(true)
    // Nothing was saved, so nothing is stamped: a stamp would make sync
    // push the old value as if it were new.
    expect(localStorage.getItem(`${STAMP}ba_day_swaps_mike`)).toBeNull()
  })

  it('reset-week on a full phone does not throw either', () => {
    const { result } = renderHook(() => useDaySwap('mike'))
    installQuota(10)
    expect(() => act(() => result.current.resetWeek(3))).not.toThrow()
  })

  it('frees stale coach insight copies and saves the swap', () => {
    for (let i = 0; i < 5; i++) localStorage.setItem(insightKey(`h${i}`), insight(1000 + i, 2_000))
    installQuota(usedChars() + 50)
    const { result } = renderHook(() => useDaySwap('mike'))
    act(() => result.current.swapDays(3, 0, 2))
    expect(JSON.parse(localStorage.getItem('ba_day_swaps_mike')!)).toHaveLength(1)
    expect(localStorage.getItem(`${STAMP}ba_day_swaps_mike`)).not.toBeNull()
  })
})

describe('sweepExpiredCaches (runs at boot)', () => {
  it('drops insight copies past the 48 h read window and unreadable ones, keeps fresh ones', () => {
    localStorage.setItem(insightKey('fresh'), insight(NOW - 47 * HOUR))
    localStorage.setItem(insightKey('expired'), insight(NOW - INSIGHT_CACHE_MAX_AGE_MS))
    localStorage.setItem(insightKey('ancient'), insight(NOW - 90 * 24 * HOUR))
    localStorage.setItem(insightKey('garbage'), '{not json')
    localStorage.setItem(insightKey('no-stamp'), JSON.stringify({ text: 'hi' }))

    for (const h of ['fresh', 'expired']) {
      localStorage.setItem(STAMP + insightKey(h), '1')
      localStorage.setItem(LAST_UP + insightKey(h), '1')
    }

    expect(sweepExpiredCaches(NOW)).toBe(4)
    expect(localStorage.getItem(insightKey('fresh'))).not.toBeNull()
    // An expired copy's sync meta goes with it (adversary #1: the stamps
    // were left behind forever); a live copy's stays.
    expect(localStorage.getItem(STAMP + insightKey('expired'))).toBeNull()
    expect(localStorage.getItem(LAST_UP + insightKey('expired'))).toBeNull()
    expect(localStorage.getItem(STAMP + insightKey('fresh'))).toBe('1')
    expect(localStorage.getItem(insightKey('expired'))).toBeNull()
    expect(localStorage.getItem(insightKey('garbage'))).toBeNull()
  })

  it('drops briefing logs older than yesterday; today and yesterday stay', () => {
    for (const d of ['2026-10-06', '2026-10-05', '2026-10-04', '2026-03-01']) {
      localStorage.setItem(briefingKey(d), '[]')
    }
    expect(sweepExpiredCaches(NOW)).toBe(2)
    expect(localStorage.getItem(briefingKey('2026-10-06'))).toBe('[]')
    expect(localStorage.getItem(briefingKey('2026-10-05'))).toBe('[]')
    expect(localStorage.getItem(briefingKey('2026-10-04'))).toBeNull()
  })

  it('touches nothing else: plan data, streams and look-alike keys survive', () => {
    const keep = {
      'ba_day_swaps_mike': '[]',
      'ba_plan_edits_mike': '[]',
      'ba_strava_streams_1': 'x',
      'ba_coach_insight_proposal_v1:mike:1': '{}',
      [`${BRIEFING_LOG_PREFIX}mike:not-a-date`]: '[]',
    }
    for (const [k, v] of Object.entries(keep)) localStorage.setItem(k, v)
    expect(sweepExpiredCaches(NOW)).toBe(0)
    for (const [k, v] of Object.entries(keep)) expect(localStorage.getItem(k)).toBe(v)
  })

  it('never throws when storage itself is unavailable', () => {
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => { throw new Error('SecurityError') })
    expect(sweepExpiredCaches(NOW)).toBe(0)
  })
})

describe('setItemWithRoom: what a full storage gives up, cheapest first', () => {
  it('unread copies, then streams, then live insight copies — never today’s log or user data', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    localStorage.setItem(insightKey('live-old'), insight(NOW - 10 * HOUR, 1_000))
    localStorage.setItem(insightKey('live-new'), insight(NOW - 1 * HOUR, 1_000))
    localStorage.setItem('ba_strava_streams_1', blob(1_000))
    localStorage.setItem(briefingKey('2026-10-05'), blob(1_000))
    localStorage.setItem(insightKey('expired'), insight(NOW - 72 * HOUR, 1_000))
    localStorage.setItem(briefingKey('2026-10-06'), blob(1_000))
    localStorage.setItem('ba_manual_logs_mike', blob(1_000))
    installQuota(usedChars() + 900)

    // Two victims' worth: the copies nothing reads go first.
    expect(setItemWithRoom('ba_plan_edits_mike', blob(2_500))).toBe(true)
    expect(localStorage.getItem(insightKey('expired'))).toBeNull()
    expect(localStorage.getItem(briefingKey('2026-10-05'))).toBeNull()
    expect(localStorage.getItem('ba_strava_streams_1')).not.toBeNull()

    // One more: the stream copy, before any live insight copy.
    expect(setItemWithRoom('ba_plan_edits_mike', blob(3_500))).toBe(true)
    expect(localStorage.getItem('ba_strava_streams_1')).toBeNull()
    expect(localStorage.getItem(insightKey('live-old'))).not.toBeNull()

    // Then live insight copies oldest-first.
    expect(setItemWithRoom('ba_plan_edits_mike', blob(4_500))).toBe(true)
    expect(localStorage.getItem(insightKey('live-old'))).toBeNull()
    expect(localStorage.getItem(insightKey('live-new'))).not.toBeNull()

    // Nothing regenerable left: today's log and user data are never touched.
    expect(setItemWithRoom('ba_plan_edits_mike', blob(20_000))).toBe(false)
    expect(localStorage.getItem(briefingKey('2026-10-06'))).not.toBeNull()
    expect(localStorage.getItem('ba_manual_logs_mike')).not.toBeNull()
  })
})

describe('setSyncedItemWithRoom: a value and its sync stamp succeed or fail together', () => {
  it('saves both, making room for both', () => {
    localStorage.setItem(insightKey('expired'), insight(1, 2_000))
    installQuota(usedChars() + 50)
    expect(setSyncedItemWithRoom('ba_plan_edits_mike', blob(1_000))).toBe(true)
    expect(localStorage.getItem('ba_plan_edits_mike')).toHaveLength(1_000)
    expect(Number(localStorage.getItem(STAMP + 'ba_plan_edits_mike'))).toBeGreaterThan(0)
  })

  it('adversary #2: when the stamp cannot fit, the value is rolled back — no unstamped edit for a pull to overwrite', () => {
    localStorage.setItem('ba_plan_edits_mike', 'old')
    // Room for the new value but not the ~50-char stamp beside it.
    installQuota(usedChars() + 20)
    expect(setSyncedItemWithRoom('ba_plan_edits_mike', 'old' + blob(15))).toBe(false)
    expect(localStorage.getItem('ba_plan_edits_mike')).toBe('old')
    expect(localStorage.getItem(STAMP + 'ba_plan_edits_mike')).toBeNull()
  })

  it('a brand-new key that cannot be stamped is removed again', () => {
    installQuota(usedChars() + 30)
    expect(setSyncedItemWithRoom('ba_day_swaps_mike', '[]')).toBe(false)
    expect(localStorage.getItem('ba_day_swaps_mike')).toBeNull()
  })

  it('the OrThrow variant throws only when it truly cannot save', () => {
    expect(() => setSyncedItemWithRoomOrThrow('a', '1')).not.toThrow()
    expect(localStorage.getItem('a')).toBe('1')
    installQuota(10)
    expect(() => setSyncedItemWithRoomOrThrow('b', blob(100))).toThrow(/storage is full/)
  })
})

describe('adversary #1: sync never brings back insight copies nothing reads', () => {
  const session = { token: 'tok', athleteId: 'mike' } as never
  function serveItems(items: { key: string; value: string; updatedAt: string }[]) {
    const pushed: string[] = []
    vi.stubEnv('VITE_GARMIN_API_URL', 'https://api.test')
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET').toUpperCase() === 'GET') {
        const body = { items, serverNow: new Date().toISOString() }
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response
      }
      for (const it of JSON.parse(init!.body as string).items) pushed.push(it.key)
      const body = { written: pushed.length, skipped: 0 }
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response
    }))
    return pushed
  }
  const at = new Date().toISOString()
  const items = () => [
    { key: insightKey('expired'), value: insight(Date.now() - 72 * HOUR), updatedAt: at },
    { key: insightKey('live'), value: insight(Date.now() - HOUR), updatedAt: at },
  ]

  it('isExpiredInsightCopy: only insight keys, past 48 h or unreadable', () => {
    expect(isExpiredInsightCopy(insightKey('a'), insight(NOW - 48 * HOUR), NOW)).toBe(true)
    expect(isExpiredInsightCopy(insightKey('a'), '{bad', NOW)).toBe(true)
    expect(isExpiredInsightCopy(insightKey('a'), insight(NOW - 47 * HOUR), NOW)).toBe(false)
    expect(isExpiredInsightCopy('ba_plan_edits_mike', '{bad', NOW)).toBe(false)
  })

  it('hydrate skips expired copies and still pulls live ones', async () => {
    serveItems(items())
    const { hydrateFromServer } = await import('../utils/backendSync')
    await hydrateFromServer(session)
    expect(localStorage.getItem(insightKey('expired'))).toBeNull()
    expect(localStorage.getItem(STAMP + insightKey('expired'))).toBeNull()
    expect(localStorage.getItem(insightKey('live'))).not.toBeNull()
  })

  it('"Pull from server" skips them too', async () => {
    serveItems(items())
    const { pullFromServer } = await import('../utils/backendSync')
    await pullFromServer(session)
    expect(localStorage.getItem(insightKey('expired'))).toBeNull()
    expect(localStorage.getItem(insightKey('live'))).not.toBeNull()
  })

  it('push does not upload an expired, unstamped copy', async () => {
    localStorage.setItem(insightKey('expired'), insight(Date.now() - 72 * HOUR))
    localStorage.setItem(insightKey('live'), insight(Date.now() - HOUR))
    const pushed = serveItems([])
    const { pushAll } = await import('../utils/backendSync')
    await pushAll(session)
    expect(pushed).toContain(insightKey('live'))
    expect(pushed).not.toContain(insightKey('expired'))
  })
})

describe('a plan rebuild on a full phone never half-applies', () => {
  const CFG_KEY = 'ba_onboarding_mike'
  const EDITS_KEY = 'ba_plan_edits_mike'
  const cfg = (over: Partial<OnboardingConfig> = {}) => ({
    raceType: 'hyrox', raceName: 'Anaheim Hyrox', raceDate: '2026-11-30',
    experienceLevel: 'intermediate', trainingDaysPerWeek: 5, wearable: 'garmin',
    athleteName: 'Mike', age: 45, maxHR: 200, completedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  } as OnboardingConfig)

  it('if the new plan cannot be saved, the old plan’s edits are NOT deleted', () => {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg()))
    localStorage.setItem(EDITS_KEY, '[{"id":"e1"}]')
    const { result } = renderHook(() => useOnboarding('mike'))
    installQuota(usedChars() + 200)
    expect(() => act(() => result.current.save(cfg({ raceName: blob(5_000) })))).not.toThrow()
    expect(localStorage.getItem(EDITS_KEY)).toBe('[{"id":"e1"}]')
    expect(JSON.parse(localStorage.getItem(CFG_KEY)!).raceName).toBe('Anaheim Hyrox')
  })

  it('with room to make, the new plan saves and the old edits are cleared as before', () => {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg()))
    localStorage.setItem(EDITS_KEY, '[{"id":"e1"}]')
    localStorage.setItem(insightKey('stale'), insight(1, 8_000))
    const { result } = renderHook(() => useOnboarding('mike'))
    installQuota(usedChars() + 200)
    act(() => result.current.save(cfg({ raceName: 'Big Race' + blob(2_000) })))
    expect(JSON.parse(localStorage.getItem(CFG_KEY)!).raceName).toMatch(/^Big Race/)
    expect(localStorage.getItem(EDITS_KEY)).toBeNull()
  })

  it('adversary #4: a redo is not blocked by the previous-plan snapshot not fitting', () => {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg({ raceName: blob(3_000) })))
    const { result } = renderHook(() => useOnboarding('mike'))
    // Room for the redo flag, not for a second copy of the big config.
    installQuota(usedChars() + 200)
    act(() => result.current.requestRedo())
    expect(localStorage.getItem('ba_onboarding_redo_mike')).toBe('1')
    expect(localStorage.getItem(CFG_KEY)).toBeNull()
    expect(localStorage.getItem('ba_onboarding_prev_mike')).toBeNull()
  })

  it('adversary #5: a restore that cannot save the plan changes nothing and says so', () => {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg()))
    const { result } = renderHook(() => useOnboarding('mike'))
    act(() => result.current.save(cfg({ raceName: 'Second Race' })))
    const backup = result.current.planBackups.find(b => b.savedAt)!
    expect(backup).toBeDefined()
    installQuota(10)
    let ok = true
    act(() => { ok = result.current.restorePlan(backup.savedAt) })
    expect(ok).toBe(false)
    expect(result.current.config?.raceName).toBe('Second Race')
    expect(JSON.parse(localStorage.getItem(CFG_KEY)!).raceName).toBe('Second Race')
  })
})

describe('the other writes that had no guard at all', () => {
  it('soreness check-in, max HR, HR zones and theme survive a full phone', () => {
    const sore = renderHook(() => useSoreness('mike'))
    const maxHR = renderHook(() => useMaxHR('mike', 190))
    const zones = renderHook(() => useHRZones('mike', []))
    const theme = renderHook(() => useTheme())
    installQuota(10)

    expect(() => act(() => sore.result.current.logCheckIn('2026-10-06', 'morning' as never, 2 as never))).not.toThrow()
    expect(() => act(() => maxHR.result.current.save(185))).not.toThrow()
    expect(maxHR.result.current.maxHR).toBe(185)
    expect(() => act(() => zones.result.current.save([]))).not.toThrow()
    expect(() => act(() => theme.result.current.setMode('dark'))).not.toThrow()
    expect(theme.result.current.mode).toBe('dark')
  })
})
