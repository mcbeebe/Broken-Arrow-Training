import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Regression for the cryptic "Garmin health fetch failed: 500" report.
 *
 * When a saved Garmin session expires, the backend now returns 401 with
 * `{ error, reauth: true }` instead of a generic 500. The frontend must
 * translate that into a typed GarminAuthError carrying the human-readable
 * message, so the UI can prompt the athlete to reconnect rather than show a
 * raw status code.
 *
 * VITE_GARMIN_API_URL is read at module load, so we stub it and import the
 * module dynamically inside each test.
 */

async function loadGarmin() {
  vi.stubEnv('VITE_GARMIN_API_URL', 'https://api.test')
  return import('../utils/garmin')
}

function mockFetch(status: number, body: unknown) {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res))
}

describe('Garmin fetch error handling', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('throws a typed GarminAuthError with the backend message on a 401 reauth response', async () => {
    const { fetchHealthData, GarminAuthError } = await loadGarmin()
    mockFetch(401, {
      error: 'Garmin session expired. Please reconnect your Garmin account.',
      reauth: true,
    })

    await expect(fetchHealthData(7, 'mike')).rejects.toBeInstanceOf(GarminAuthError)
    await expect(fetchHealthData(7, 'mike')).rejects.toThrow(/session expired/i)
  })

  it('treats a 500 as a generic error, not an auth error', async () => {
    const { fetchHealthData, GarminAuthError } = await loadGarmin()
    mockFetch(500, { error: 'Failed to fetch health data: boom' })

    await expect(fetchHealthData(7, 'mike')).rejects.toThrow(/Failed to fetch health data/)
    await expect(fetchHealthData(7, 'mike')).rejects.not.toBeInstanceOf(GarminAuthError)
  })

  it('falls back to a status-code message when the error body is not JSON', async () => {
    const { fetchHealthData } = await loadGarmin()
    const res = {
      ok: false,
      status: 502,
      json: async () => { throw new Error('not json') },
    } as unknown as Response
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res))

    await expect(fetchHealthData(7, 'mike')).rejects.toThrow(/Garmin health fetch failed: 502/)
  })
})
