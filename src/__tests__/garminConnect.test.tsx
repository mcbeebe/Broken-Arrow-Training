/**
 * The Garmin connect card and the app session.
 *
 * The Garmin endpoints identify the athlete by the app session token, so a
 * signed-out browser cannot connect Garmin no matter what credentials it
 * types — the request 401s before Garmin is contacted. The card must say so
 * up front instead of rendering a credentials form that can only fail with
 * an error that blames the wrong password. Same for a stored token the
 * server rejects: presence can't prove validity, but a mapped 401 arriving
 * in the error prop just did.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import GarminConnect from '../components/GarminConnect'
import { GARMIN_SIGN_IN_REQUIRED } from '../utils/garmin'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const baseProps = {
  connected: false,
  configured: true,
  loading: false,
  error: null,
  displayName: null,
  lastSync: null,
  mfaRequired: false,
  onConnect: async () => {},
  onSubmitMfa: async () => {},
  onDisconnect: () => {},
  onSync: async () => {},
}

function signIn() {
  localStorage.setItem('ba_auth_session', JSON.stringify({
    athleteId: 'mike', email: 'a@b.com', name: 'Mike', token: 'tok', provider: 'google',
  }))
}

describe('GarminConnect app-session guard', () => {
  it('shows a sign-in prompt instead of the credentials form when signed out', () => {
    render(<GarminConnect {...baseProps} />)

    expect(screen.getByText(GARMIN_SIGN_IN_REQUIRED)).toBeTruthy()
    expect(screen.queryByPlaceholderText('Garmin password')).toBeNull()
    expect(screen.queryByText('Connect Garmin')).toBeNull()
  })

  it('shows the credentials form when a session token is present', () => {
    signIn()
    render(<GarminConnect {...baseProps} />)

    expect(screen.getByPlaceholderText('Garmin email')).toBeTruthy()
    expect(screen.getByPlaceholderText('Garmin password')).toBeTruthy()
    expect(screen.queryByText(GARMIN_SIGN_IN_REQUIRED)).toBeNull()
  })

  it('shows the sign-in prompt, not the form, when a stored token was rejected by the server', () => {
    // Token present locally but the backend 401'd it (rotation, revocation):
    // the mapped message lands in the error prop, and re-rendering the
    // credentials form under it would restart the retype-the-password loop.
    signIn()
    render(<GarminConnect {...baseProps} error={GARMIN_SIGN_IN_REQUIRED} />)

    expect(screen.getByText(GARMIN_SIGN_IN_REQUIRED)).toBeTruthy()
    expect(screen.queryByPlaceholderText('Garmin password')).toBeNull()
  })

  it('still shows the connected state (cached data, sync, disconnect) when signed out', () => {
    // A connected athlete whose app session lapsed keeps their card — the
    // failing sync surfaces the sign-in message through the error prop, and
    // the disconnected re-render then hits the guard above.
    render(<GarminConnect {...baseProps} connected={true} displayName="Mike B" />)

    expect(screen.getByText(/Connected · Mike B/)).toBeTruthy()
  })

  it('keeps the not-configured notice ahead of the session guard', () => {
    render(<GarminConnect {...baseProps} configured={false} />)

    expect(screen.getByText(/Garmin integration not configured/)).toBeTruthy()
    expect(screen.queryByText(GARMIN_SIGN_IN_REQUIRED)).toBeNull()
  })
})
