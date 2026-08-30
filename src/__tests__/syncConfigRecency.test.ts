/**
 * Regression for Mike's plan revert: opening a stale device (a month-old
 * config) re-uploaded it with a fresh push timestamp, and the sync's
 * last-write-wins-by-push-time believed the old plan was newest and spread
 * it to every device.
 *
 * The fix judges the onboarding config by its own `completedAt` (content
 * age), not the push stamp, so an OLDER config can never overwrite a NEWER
 * one — in either sync direction.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { contentVersion, isSyncedConfigKey } from '../utils/syncMerge'

const CFG = 'ba_onboarding_mike'
const day = (iso: string) => new Date(iso).getTime()
const cfg = (completedAt: string, race: string) =>
  JSON.stringify({ raceType: 'hyrox', raceName: race, completedAt })

function makeServer() {
  const table = new Map<string, { value: string; updatedAt: string }>()
  const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
    const method = (init?.method || 'GET').toUpperCase()
    if (method === 'GET') {
      const items = [...table.entries()].map(([key, r]) => ({ key, value: r.value, updatedAt: r.updatedAt }))
      const body = { items, serverNow: new Date().toISOString() }
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response
    }
    const parsed = JSON.parse(init!.body as string) as { items: Array<{ key: string; value: string; updatedAt: string }> }
    let written = 0, skipped = 0
    for (const it of parsed.items) {
      const cur = table.get(it.key)
      if (!cur || Date.parse(cur.updatedAt) < Date.parse(it.updatedAt)) {
        table.set(it.key, { value: it.value, updatedAt: it.updatedAt }); written++
      } else skipped++
    }
    const body = { written, skipped }
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response
  })
  return { table, fetchImpl }
}

const session = { token: 'tok', athleteId: 'mike' } as never
async function loadSync() {
  vi.stubEnv('VITE_GARMIN_API_URL', 'https://api.test')
  return import('../utils/backendSync')
}

describe('contentVersion / isSyncedConfigKey', () => {
  it('recognises the active config key, not the redo flag or prev snapshot', () => {
    expect(isSyncedConfigKey('ba_onboarding_mike')).toBe(true)
    expect(isSyncedConfigKey('ba_onboarding')).toBe(true)
    expect(isSyncedConfigKey('ba_onboarding_redo_mike')).toBe(false)
    expect(isSyncedConfigKey('ba_onboarding_prev_mike')).toBe(false)
    expect(isSyncedConfigKey('ba_manual_logs_mike')).toBe(false)
  })

  it('reads recency from completedAt, and is null when absent or unparseable', () => {
    expect(contentVersion(CFG, cfg('2026-08-28T00:00:00Z', 'Hyrox'))).toBe(day('2026-08-28T00:00:00Z'))
    expect(contentVersion(CFG, JSON.stringify({ raceType: 'hyrox' }))).toBeNull()
    expect(contentVersion(CFG, 'not json')).toBeNull()
    expect(contentVersion('ba_theme', cfg('2026-08-28T00:00:00Z', 'x'))).toBeNull()
  })
})

describe('the plan revert cannot happen: older config never overwrites newer', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules() })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('a stale device re-uploading a month-old config does NOT clobber the phone', async () => {
    const { table, fetchImpl } = makeServer()
    vi.stubGlobal('fetch', fetchImpl)
    const { pushAll, hydrateFromServer } = await loadSync()
    const { stampKey } = await import('../utils/syncStamps')

    // Server + phone hold the CURRENT config (2 days ago).
    const current = cfg('2026-08-28T00:00:00Z', 'Hyrox Anaheim')
    table.set(CFG, { value: current, updatedAt: '2026-08-28T00:00:00Z' })

    // The stale computer boots with a month-old, UNSTAMPED config and pushes.
    // Old bug: pushAll backfills it with updatedAt=now → it becomes "newest".
    localStorage.setItem(CFG, cfg('2026-07-28T00:00:00Z', 'Oakland Hills Half'))
    await pushAll(session)

    // With the fix, it was pushed with its OWN completedAt, so the server's
    // current config (Aug 28) still wins over the month-old (Jul 28).
    expect(JSON.parse(table.get(CFG)!.value).raceName).toBe('Hyrox Anaheim')

    // And the phone, hydrating, keeps its current config no matter what.
    localStorage.clear()
    localStorage.setItem(CFG, current)
    stampKey(CFG, day('2026-08-28T00:00:00Z'))
    await hydrateFromServer(session)
    expect(JSON.parse(localStorage.getItem(CFG)!).raceName).toBe('Hyrox Anaheim')
  })

  it('pull rejects an older-content config even when its push stamp is newer', async () => {
    const { table, fetchImpl } = makeServer()
    vi.stubGlobal('fetch', fetchImpl)
    const { hydrateFromServer } = await loadSync()
    const { stampKey } = await import('../utils/syncStamps')

    // Server got poisoned: OLD content, but a brand-new push timestamp.
    table.set(CFG, { value: cfg('2026-07-28T00:00:00Z', 'Oakland Hills Half'), updatedAt: '2026-08-30T12:00:00Z' })
    // Phone has the newer content, stamped when it was written (2 days ago).
    localStorage.setItem(CFG, cfg('2026-08-28T00:00:00Z', 'Hyrox Anaheim'))
    stampKey(CFG, day('2026-08-28T00:00:00Z'))

    await hydrateFromServer(session)
    // Push stamp says pull, content age says don't — content wins.
    expect(JSON.parse(localStorage.getItem(CFG)!).raceName).toBe('Hyrox Anaheim')
  })

  it('the stale device HEALS: it pulls the newer config instead of keeping its old one', async () => {
    const { table, fetchImpl } = makeServer()
    vi.stubGlobal('fetch', fetchImpl)
    const { hydrateFromServer } = await loadSync()

    // Server holds the current config; the computer has the month-old one.
    table.set(CFG, { value: cfg('2026-08-28T00:00:00Z', 'Hyrox Anaheim'), updatedAt: '2026-08-28T00:00:00Z' })
    localStorage.setItem(CFG, cfg('2026-07-28T00:00:00Z', 'Oakland Hills Half')) // unstamped stale

    await hydrateFromServer(session)
    expect(JSON.parse(localStorage.getItem(CFG)!).raceName).toBe('Hyrox Anaheim')
  })

  it('a genuinely newer config still propagates (a real redo is not blocked)', async () => {
    const { table, fetchImpl } = makeServer()
    vi.stubGlobal('fetch', fetchImpl)
    const { hydrateFromServer } = await loadSync()
    const { stampKey } = await import('../utils/syncStamps')

    // Phone did a real redo today → newest content on the server.
    table.set(CFG, { value: cfg('2026-08-30T12:00:00Z', 'Hyrox Anaheim'), updatedAt: '2026-08-30T12:00:00Z' })
    // Other device holds an older config.
    localStorage.setItem(CFG, cfg('2026-08-28T00:00:00Z', 'Oakland Hills Half'))
    stampKey(CFG, day('2026-08-28T00:00:00Z'))

    await hydrateFromServer(session)
    expect(JSON.parse(localStorage.getItem(CFG)!).raceName).toBe('Hyrox Anaheim')
  })
})
