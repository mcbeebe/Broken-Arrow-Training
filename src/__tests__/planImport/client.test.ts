import { describe, it, expect, vi, afterEach } from 'vitest'
import { requestPlanImport, PLAN_IMPORT_PATH, SERVER_ERROR_CODES } from '../../utils/planImport/client'
import type { PlanImportBody } from '../../utils/planImport/prepareUpload'
import { CLIENT_TIMEOUT_MS } from '../../utils/planImport/uploadLimits'

/**
 * Initiative 004, PR 5: the one call to the plan-import endpoint. Never
 * throws; every outcome is a value the sheet can show.
 */

const BODY: PlanImportBody = { kind: 'text', text: 'Week 1: Tue easy 4 mi' }
const BASE = 'https://api.example.test'
const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const text = (status: number, body: string) => new Response(body, { status, headers: { 'Content-Type': 'text/plain' } })

afterEach(() => { vi.useRealTimers() })

describe('a read that works', () => {
  it('posts the body as JSON with the session token, and returns the extraction', async () => {
    const fetchImpl = vi.fn(async () => json(200, { extraction: { status: 'ok' }, warnings: ['w'], usage: { input: 1, output: 2 }, importsLeft: 4 }))
    const r = await requestPlanImport(BODY, { fetchImpl, base: BASE, headers: { Authorization: 'Bearer t0k' } })
    expect(r).toEqual({ ok: true, extraction: { status: 'ok' }, warnings: ['w'], importsLeft: 4 })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${BASE}${PLAN_IMPORT_PATH}`)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer t0k' })
    expect(JSON.parse(init.body as string)).toEqual(BODY)
  })

  it('sends the stored session token by default', async () => {
    localStorage.setItem('ba_auth_session', JSON.stringify({ athleteId: 'mike', email: '', name: '', token: 'sess-1', provider: 'google' }))
    const fetchImpl = vi.fn(async () => json(200, { extraction: {}, importsLeft: 2 }))
    await requestPlanImport(BODY, { fetchImpl, base: BASE })
    expect(((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>).Authorization).toBe('Bearer sess-1')
    localStorage.removeItem('ba_auth_session')
  })

  it('a reply with no extraction is a server error, not a plan', async () => {
    const r = await requestPlanImport(BODY, { fetchImpl: async () => json(200, { nope: 1 }), base: BASE, headers: {} })
    expect(r).toEqual({ ok: false, code: 'server_error' })
  })
})

describe('every error the server sends', () => {
  const STATUS: Record<string, number> = {
    bad_request: 400, data_required: 400, bad_data: 400, text_required: 400,
    too_large: 413, too_long: 413, unsupported_kind: 415, not_a_pdf: 415, unsupported_image: 415,
    not_available: 403, import_limit: 429, budget_exceeded: 429,
    plan_too_long: 422, file_unreadable: 422, read_failed: 502, timeout: 504, busy: 503, llm_unavailable: 503,
  }

  it.each([...SERVER_ERROR_CODES])('%s comes back as itself', async code => {
    const r = await requestPlanImport(BODY, { fetchImpl: async () => json(STATUS[code], { error: code }), base: BASE, headers: {} })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe(code)
  })

  it('the daily cap carries how many were used and the limit', async () => {
    const r = await requestPlanImport(BODY, { fetchImpl: async () => json(429, { error: 'import_limit', used: 5, limit: 5 }), base: BASE, headers: {} })
    expect(r).toEqual({ ok: false, code: 'import_limit', used: 5, limit: 5 })
  })

  it('a 401 is signed out, whatever sentence it carries', async () => {
    const r = await requestPlanImport(BODY, { fetchImpl: async () => json(401, { error: 'invalid or expired session token' }), base: BASE, headers: {} })
    expect(r).toEqual({ ok: false, code: 'signed_out' })
  })
})

describe('Vercel\'s own answers, which are not JSON', () => {
  it.each([
    [404, 'The page could not be found\n\nNOT_FOUND', 'not_deployed'],
    [413, 'Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE', 'too_large'],
    [504, 'An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT', 'timeout'],
    [503, 'server misconfigured', 'unavailable'],
    [500, 'Internal Server Error', 'server_error'],
  ])('%i → %s', async (status, body, code) => {
    const r = await requestPlanImport(BODY, { fetchImpl: async () => text(status, body), base: BASE, headers: {} })
    expect(r).toEqual({ ok: false, code })
  })

  it('an unknown error code falls back to the status', async () => {
    const r = await requestPlanImport(BODY, { fetchImpl: async () => json(503, { error: 'something_new' }), base: BASE, headers: {} })
    expect(r).toEqual({ ok: false, code: 'unavailable' })
  })
})

describe('when no answer comes', () => {
  it('a failed connection is a network error', async () => {
    const r = await requestPlanImport(BODY, { fetchImpl: async () => { throw new TypeError('Failed to fetch') }, base: BASE, headers: {} })
    expect(r).toEqual({ ok: false, code: 'network' })
  })

  it('the athlete cancelling is "aborted", before or during the request', async () => {
    const pre = new AbortController()
    pre.abort()
    const fetchImpl = vi.fn()
    expect(await requestPlanImport(BODY, { signal: pre.signal, fetchImpl, base: BASE, headers: {} })).toEqual({ ok: false, code: 'aborted' })
    expect(fetchImpl).not.toHaveBeenCalled()

    const during = new AbortController()
    const hanging = (_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })
    const pending = requestPlanImport(BODY, { signal: during.signal, fetchImpl: hanging as typeof fetch, base: BASE, headers: {} })
    during.abort()
    expect(await pending).toEqual({ ok: false, code: 'aborted' })
  })

  it('gives up after CLIENT_TIMEOUT_MS, which outlasts the server\'s own limits', async () => {
    expect(CLIENT_TIMEOUT_MS).toBeGreaterThan(300_000)
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const hanging = (_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      signal = init?.signal ?? undefined
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })
    const pending = requestPlanImport(BODY, { fetchImpl: hanging as typeof fetch, base: BASE, headers: {} })
    await vi.advanceTimersByTimeAsync(CLIENT_TIMEOUT_MS - 1)
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await pending).toEqual({ ok: false, code: 'timeout' })
  })

  it('with no API configured, nothing is sent', async () => {
    const fetchImpl = vi.fn()
    expect(await requestPlanImport(BODY, { fetchImpl, base: '' })).toEqual({ ok: false, code: 'unavailable' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
