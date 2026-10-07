/**
 * Initiative 003: requestInvite() is the landing page's only network call. It
 * posts to the existing access queue (PR 2 hardened it) and maps every answer
 * to a state the form can show.
 */
import { describe, it, expect, vi } from 'vitest'
import { requestInvite, resolveApiBase, INVITE_PATH, INVITE_TIMEOUT_MS } from '../../landing/api'

const INPUT = { email: 'new@example.com', note: 'A spring half', source: 'tool-heat', hp_contact_ref: '' }

function respond(status: number, body: unknown = {}) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

describe('resolveApiBase mirrors src/utils/coachApi.ts', () => {
  it('prefers VITE_COACH_API_URL', () => {
    expect(resolveApiBase({ VITE_COACH_API_URL: 'https://a.example', VITE_GARMIN_API_URL: 'https://b.example' }))
      .toBe('https://a.example')
  })

  it('falls back to VITE_GARMIN_API_URL', () => {
    expect(resolveApiBase({ VITE_GARMIN_API_URL: 'https://b.example' })).toBe('https://b.example')
  })

  it('strips one trailing slash', () => {
    expect(resolveApiBase({ VITE_COACH_API_URL: 'https://a.example/' })).toBe('https://a.example')
  })

  it('is empty when neither is set', () => {
    expect(resolveApiBase({})).toBe('')
  })

  it('posts to /api/auth/athletes', () => {
    expect(INVITE_PATH).toBe('/api/auth/athletes')
  })
})

describe('requestInvite', () => {
  it('posts the access-request body, honeypot and source included', async () => {
    const fetch = respond(200, { ok: true })
    await requestInvite(INPUT, { fetch, base: 'https://api.example' })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example/api/auth/athletes')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(String(init.body))).toEqual({
      action: 'request_access',
      email: 'new@example.com',
      note: 'A spring half',
      source: 'tool-heat',
      hp_contact_ref: '',
    })
  })

  it('sends a null source as null, never the text "null"', async () => {
    const fetch = respond(200)
    await requestInvite({ ...INPUT, source: null }, { fetch, base: '' })
    const body = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body.source).toBeNull()
  })

  it('200 → ok', async () => {
    expect(await requestInvite(INPUT, { fetch: respond(200, { ok: true }), base: '' })).toEqual({ ok: true })
  })

  it('400 → invalid, with the server’s message as is', async () => {
    const r = await requestInvite(INPUT, { fetch: respond(400, { error: 'Please enter a valid email address.' }), base: '' })
    expect(r).toEqual({ ok: false, kind: 'invalid', message: 'Please enter a valid email address.' })
  })

  it('400 without a usable message → invalid, no message', async () => {
    const r = await requestInvite(INPUT, {
      fetch: vi.fn(async () => new Response('not json', { status: 400 })),
      base: '',
    })
    expect(r).toEqual({ ok: false, kind: 'invalid' })
  })

  it('429 → throttled', async () => {
    expect(await requestInvite(INPUT, { fetch: respond(429, { error: 'Too many requests' }), base: '' }))
      .toEqual({ ok: false, kind: 'throttled' })
  })

  it.each([503, 500, 502, 504])('%i → unavailable', async status => {
    expect(await requestInvite(INPUT, { fetch: respond(status, { error: 'x' }), base: '' }))
      .toEqual({ ok: false, kind: 'unavailable' })
  })

  it('any other unexpected status → unavailable', async () => {
    expect(await requestInvite(INPUT, { fetch: respond(404), base: '' })).toEqual({ ok: false, kind: 'unavailable' })
  })

  it('a thrown fetch → network', async () => {
    const fetch = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    expect(await requestInvite(INPUT, { fetch, base: '' })).toEqual({ ok: false, kind: 'network' })
  })

  it('times out after 10 s → network, and aborts the request', async () => {
    vi.useFakeTimers()
    try {
      let signal: AbortSignal | undefined
      const fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        signal = init?.signal ?? undefined
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      })
      const pending = requestInvite(INPUT, { fetch, base: '' })
      await vi.advanceTimersByTimeAsync(INVITE_TIMEOUT_MS)
      expect(await pending).toEqual({ ok: false, kind: 'network' })
      expect(signal?.aborted).toBe(true)
      expect(INVITE_TIMEOUT_MS).toBe(10_000)
    } finally {
      vi.useRealTimers()
    }
  })
})
