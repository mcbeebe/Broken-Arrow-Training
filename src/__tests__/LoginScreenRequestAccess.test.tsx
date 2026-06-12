/**
 * LoginScreen — "Request access" flow for visitors who aren't on the allowlist
 * yet. Verifies the form reveals, validates the email client-side BEFORE any
 * network call, POSTs the request to the athletes endpoint with the right
 * shape, and confirms on success.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import LoginScreen from '../components/LoginScreen'

// Empty Google client id → the component skips loading Google's gsi script
// (the effect early-returns), so the request-access path renders cleanly with
// no network dependency on Google.
vi.mock('../utils/auth', () => ({
  getGoogleClientId: () => '',
  loginWithGoogle: vi.fn(),
}))

vi.mock('../utils/coachApi', () => ({
  coachApiBase: () => 'https://api.test',
}))

function mockFetch(status: number, body: unknown) {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
  const fn = vi.fn().mockResolvedValue(res)
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('LoginScreen — request access', () => {
  it('reveals the form and POSTs a valid request, then confirms', async () => {
    const fetchMock = mockFetch(200, { ok: true })
    render(<LoginScreen onLogin={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /request access/i }))

    fireEvent.change(screen.getByPlaceholderText(/you@email\.com/i), {
      target: { value: 'newathlete@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText(/anything mike should know/i), {
      target: { value: 'Coach referred me' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.test/api/auth/athletes')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      action: 'request_access',
      email: 'newathlete@example.com',
      note: 'Coach referred me',
    })
    expect(await screen.findByText(/request sent/i)).toBeInTheDocument()
  })

  it('rejects an invalid email without calling the API', async () => {
    const fetchMock = mockFetch(200, { ok: true })
    render(<LoginScreen onLogin={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /request access/i }))
    fireEvent.change(screen.getByPlaceholderText(/you@email\.com/i), {
      target: { value: 'not-an-email' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces a server error message on a failed request', async () => {
    const fetchMock = mockFetch(503, { error: 'Requests are temporarily unavailable — please email Mike directly.' })
    render(<LoginScreen onLogin={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /request access/i }))
    fireEvent.change(screen.getByPlaceholderText(/you@email\.com/i), {
      target: { value: 'newathlete@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument()
  })
})
