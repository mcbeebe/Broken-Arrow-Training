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
  const text = JSON.stringify(body)
  const res = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => text,
  } as Response
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res))
}

/** Mock a response whose body is raw (possibly non-JSON) text. */
function mockTextFetch(status: number, text: string) {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(text),
    text: async () => text,
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

describe('checkGarminAuth response handling', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns the parsed JSON body on success', async () => {
    const { checkGarminAuth } = await loadGarmin()
    mockFetch(200, { authenticated: true, displayName: 'Mike B' })

    const result = await checkGarminAuth('mike', { email: 'a@b.com', password: 'pw' })
    expect(result).toEqual({ authenticated: true, displayName: 'Mike B' })
  })

  it('surfaces a plain-text gateway error as a clean error instead of throwing a JSON parse error', async () => {
    // Regression for the sign-in form showing:
    //   Unexpected token 'A', "An error o"... is not valid JSON
    // A crashed serverless function / gateway returns plain text, not JSON.
    const { checkGarminAuth } = await loadGarmin()
    mockTextFetch(500, 'An error occurred with this application.')

    const result = await checkGarminAuth('mike', { email: 'a@b.com', password: 'pw' })
    expect(result.authenticated).toBe(false)
    expect(result.error).toBe('An error occurred with this application.')
    expect(result.error).not.toMatch(/is not valid JSON/)
  })

  it('falls back to a status-code message when the body is an HTML error page', async () => {
    const { checkGarminAuth } = await loadGarmin()
    mockTextFetch(502, '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>')

    const result = await checkGarminAuth('mike', { email: 'a@b.com', password: 'pw' })
    expect(result.authenticated).toBe(false)
    expect(result.error).toBe('Garmin authentication failed (502)')
  })

  it('handles an empty response body without throwing', async () => {
    const { checkGarminAuth } = await loadGarmin()
    mockTextFetch(503, '')

    const result = await checkGarminAuth('mike', { email: 'a@b.com', password: 'pw' })
    expect(result.authenticated).toBe(false)
    expect(result.error).toBe('Garmin authentication failed (503)')
  })
})
