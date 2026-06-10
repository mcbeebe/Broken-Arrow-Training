import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { stampKey } from '../utils/syncStamps'

/**
 * Regression for the "halfway through redoing onboarding I get warped back to
 * my old plan" report.
 *
 * "Redo onboarding" deletes the local `ba_onboarding_<id>` config, but the
 * previously-completed config still lives on the server. The 60s background
 * sync (`useBackendSync`) runs `hydrateFromServer`, and the OLD merge rule
 * (`localRaw === null || serverMs > localStamp`) treated "absent locally" as
 * "server wins" — so it rewrote the old config back, fired a synthetic
 * `storage` event, flipped `isOnboarded` true, and unmounted the in-progress
 * Onboarding flow.
 *
 * The fix: `requestRedo`/`clear`/`save` stamp the deletion (a tombstone), and
 * `hydrateFromServer` only pulls when the server is STRICTLY newer than the
 * local stamp. A fresh device (no stamp) must still hydrate normally.
 *
 * VITE_GARMIN_API_URL is read at module load, so we stub it and import the
 * module dynamically inside each test.
 */

const CONFIG_KEY = 'ba_onboarding_mbeebe'
const SERVER_AT = 1_700_000_000_000 // when onboarding originally completed
const oldConfig = JSON.stringify({ raceType: 'general', athleteName: 'Old' })

async function loadSync() {
  vi.stubEnv('VITE_GARMIN_API_URL', 'https://api.test')
  return import('../utils/backendSync')
}

function mockServerState(items: Array<{ key: string; value: string; updatedAt: string }>) {
  const body = { items, serverNow: new Date(SERVER_AT).toISOString() }
  const res = {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res))
}

const session = { token: 'tok', athleteId: 'mbeebe' } as unknown as Parameters<
  typeof import('../utils/backendSync').hydrateFromServer
>[0]

describe('hydrateFromServer respects local deletion tombstones', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('does NOT resurrect a redo-deleted config (the warp bug)', async () => {
    // Post-redo state: config absent locally, but tombstoned with a stamp
    // newer than the server's copy (exactly what requestRedo now does).
    stampKey(CONFIG_KEY, SERVER_AT + 5_000)
    mockServerState([{ key: CONFIG_KEY, value: oldConfig, updatedAt: new Date(SERVER_AT).toISOString() }])

    const { hydrateFromServer } = await loadSync()
    const { pulled } = await hydrateFromServer(session)

    // The old config stays gone — the redo flow is not warped away.
    expect(localStorage.getItem(CONFIG_KEY)).toBeNull()
    expect(pulled).toBe(0)
  })

  it('still hydrates a genuinely fresh device (no local stamp)', async () => {
    // No stamp, no local value: a brand-new browser must pull server state.
    mockServerState([{ key: CONFIG_KEY, value: oldConfig, updatedAt: new Date(SERVER_AT).toISOString() }])

    const { hydrateFromServer } = await loadSync()
    const { pulled } = await hydrateFromServer(session)

    expect(localStorage.getItem(CONFIG_KEY)).toBe(oldConfig)
    expect(pulled).toBe(1)
  })

  it('still lets a strictly-newer server copy win (normal cross-device LWW)', async () => {
    // Local copy stamped older than the server's newer edit.
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ raceType: 'general', athleteName: 'Stale' }))
    stampKey(CONFIG_KEY, SERVER_AT - 5_000)
    const newer = JSON.stringify({ raceType: 'general', athleteName: 'Newer' })
    mockServerState([{ key: CONFIG_KEY, value: newer, updatedAt: new Date(SERVER_AT).toISOString() }])

    const { hydrateFromServer } = await loadSync()
    const { pulled } = await hydrateFromServer(session)

    expect(localStorage.getItem(CONFIG_KEY)).toBe(newer)
    expect(pulled).toBe(1)
  })
})
