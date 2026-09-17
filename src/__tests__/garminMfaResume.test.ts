/**
 * The client half of the Garmin MFA handshake.
 *
 * The server parks the sign-in that asked for a code and resumes it when
 * the code arrives. Serverless memory is not durable, so when that parked
 * sign-in is gone the server issues a fresh code and answers
 * {mfa_required, code_resent, message}. The hook must then STAY on the
 * code screen and show that message as guidance, not as an error — the
 * old client showed Garmin's rejection text and left the athlete typing a
 * dead code forever.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

function seedAppSession() {
  localStorage.setItem('ba_auth_session', JSON.stringify({
    athleteId: 'mike', email: 'a@b.com', name: 'Mike', token: 'tok', provider: 'google',
  }))
}

type Scripted = { status?: number; body: unknown }

/** Answer /api/garmin/auth from a queue; everything else gets an empty list. */
function scriptAuth(queue: Scripted[]) {
  const calls: { url: string; body: Record<string, unknown> | undefined }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined
    calls.push({ url, body })
    const next = url.includes('/api/garmin/auth') ? queue.shift() : undefined
    const payload = next?.body ?? []
    const status = next?.status ?? 200
    const text = JSON.stringify(payload)
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
      text: async () => text,
    } as Response
  }))
  return calls
}

async function loadHook() {
  vi.resetModules()
  vi.stubEnv('VITE_GARMIN_API_URL', 'https://api.example.test')
  const { useGarmin } = await import('../hooks/useGarmin')
  return useGarmin
}

beforeEach(() => {
  localStorage.clear()
  seedAppSession()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  localStorage.clear()
})

const CHALLENGE = 'Garmin sent a verification code — by text, email or the Garmin authenticator app, depending on your Garmin security settings. Enter it below.'
const RESENT = 'That code is no longer valid, so Garmin has sent a new one. Enter the newest code you received.'

describe('useGarmin MFA handshake', () => {
  it('connect: a challenge puts the hook on the code screen with the server notice', async () => {
    scriptAuth([{ body: { authenticated: false, mfa_required: true, reason: 'challenge_sent', message: CHALLENGE } }])
    const useGarmin = await loadHook()
    const { result } = renderHook(() => useGarmin('mike'))

    await act(async () => { await result.current.connect('a@b.com', 'pw') })

    expect(result.current.mfaRequired).toBe(true)
    expect(result.current.mfaNotice).toBe(CHALLENGE)
    expect(result.current.error).toBeNull()
  })

  it('submitMfa: a resent code keeps the code screen and shows guidance, not an error', async () => {
    const calls = scriptAuth([
      { body: { authenticated: false, mfa_required: true, message: CHALLENGE } },
      { body: { authenticated: false, mfa_required: true, code_resent: true, reason: 'no_challenge', message: RESENT } },
    ])
    const useGarmin = await loadHook()
    const { result } = renderHook(() => useGarmin('mike'))
    await act(async () => { await result.current.connect('a@b.com', 'pw') })

    await act(async () => { await result.current.submitMfa('111111') })

    expect(result.current.mfaRequired, 'must not bounce back to the password form').toBe(true)
    expect(result.current.mfaNotice).toBe(RESENT)
    expect(result.current.error).toBeNull()
    // The code step sends the code AND the credentials — the server needs
    // them to start a new sign-in when the parked one is gone.
    const codeCall = calls.find(c => c.body?.mfa_code)
    expect(codeCall?.body).toMatchObject({ email: 'a@b.com', password: 'pw', mfa_code: '111111' })
  })

  it('submitMfa: a rejected code is an error on the same screen, and the notice is untouched', async () => {
    scriptAuth([
      { body: { authenticated: false, mfa_required: true, message: CHALLENGE } },
      { body: { authenticated: false, mfa_required: true, reason: 'rejected', error: 'Garmin did not accept that code. 1 attempt left.' } },
    ])
    const useGarmin = await loadHook()
    const { result } = renderHook(() => useGarmin('mike'))
    await act(async () => { await result.current.connect('a@b.com', 'pw') })

    await act(async () => { await result.current.submitMfa('000000') })

    expect(result.current.mfaRequired).toBe(true)
    expect(result.current.error).toMatch(/did not accept/)
    expect(result.current.mfaNotice).toBe(CHALLENGE)
  })

  it('resendMfa: asks the server explicitly, with resend:true and the saved credentials', async () => {
    const calls = scriptAuth([
      { body: { authenticated: false, mfa_required: true, message: CHALLENGE } },
      { body: { authenticated: false, mfa_required: true, code_resent: true, reason: 'resent', message: RESENT } },
    ])
    const useGarmin = await loadHook()
    const { result } = renderHook(() => useGarmin('mike'))
    await act(async () => { await result.current.connect('a@b.com', 'pw') })

    await act(async () => { await result.current.resendMfa() })

    const resend = calls.find(c => c.body?.resend === true)
    expect(resend?.body).toMatchObject({ email: 'a@b.com', password: 'pw', resend: true })
    expect(resend?.body?.mfa_code).toBeUndefined()
    expect(result.current.mfaNotice).toBe(RESENT)
    expect(result.current.mfaRequired).toBe(true)
  })

  it('submitMfa: the right code connects and leaves the code screen', async () => {
    scriptAuth([
      { body: { authenticated: false, mfa_required: true, message: CHALLENGE } },
      { body: { authenticated: true, displayName: 'Mike Beebe', session_saved: true } },
    ])
    const useGarmin = await loadHook()
    const { result } = renderHook(() => useGarmin('mike'))
    await act(async () => { await result.current.connect('a@b.com', 'pw') })

    await act(async () => { await result.current.submitMfa('123456') })

    await waitFor(() => expect(result.current.connected).toBe(true))
    expect(result.current.mfaRequired).toBe(false)
    expect(result.current.mfaNotice).toBeNull()
    expect(result.current.displayName).toBe('Mike Beebe')
  })

  it('submitMfa without a pending sign-in sends the athlete back to start', async () => {
    scriptAuth([])
    const useGarmin = await loadHook()
    const { result } = renderHook(() => useGarmin('mike'))

    await act(async () => { await result.current.submitMfa('123456') })

    expect(result.current.mfaRequired).toBe(false)
    expect(result.current.error).toMatch(/start over/)
  })
})
