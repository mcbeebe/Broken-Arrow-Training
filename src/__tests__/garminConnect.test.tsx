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
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
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
  mfaNotice: null as string | null,
  onConnect: async () => {},
  onSubmitMfa: async () => {},
  onResendMfa: async () => {},
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

/**
 * The verification step. Garmin's MFA is a two-request handshake; the
 * server parks the sign-in and the code step resumes it. When that parked
 * sign-in is lost the server sends a fresh code and says so through
 * `mfaNotice` — the card must show exactly that, and must never claim to
 * know how Garmin delivered the code.
 */
describe('GarminConnect verification step', () => {
  it('does not claim the code went to a phone — Garmin may use email or its app', () => {
    signIn()
    render(<GarminConnect {...baseProps} mfaRequired={true} />)
    expect(screen.getByText('Garmin Verification')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/phone/i)
    expect(document.body.textContent).toMatch(/authenticator app/i)
  })

  it('renders the server notice once — the notice is a complete sentence, nothing is appended', () => {
    signIn()
    const notice = 'That code is no longer valid, so Garmin has sent a new one. Enter the newest code you received.'
    render(<GarminConnect {...baseProps} mfaRequired={true} mfaNotice={notice} />)
    const hits = document.body.textContent?.match(/Enter the newest code you received\./g) ?? []
    expect(hits).toHaveLength(1)
  })

  it('shows the server notice when a fresh code has been sent', () => {
    signIn()
    const notice = 'That code is no longer valid, so Garmin has sent a new one. Enter the newest code you received.'
    render(<GarminConnect {...baseProps} mfaRequired={true} mfaNotice={notice} />)
    expect(screen.getByText(new RegExp(notice.slice(0, 40)))).toBeTruthy()
  })

  it('offers a resend, and only that button asks for a new code', async () => {
    signIn()
    let resends = 0
    let submits = 0
    render(
      <GarminConnect
        {...baseProps}
        mfaRequired={true}
        onResendMfa={async () => { resends += 1 }}
        onSubmitMfa={async () => { submits += 1 }}
      />,
    )
    fireEvent.click(screen.getByText(/send a new code/i))
    expect(resends).toBe(1)
    expect(submits).toBe(0)
  })

  it('keeps Verify disabled until six digits are typed', () => {
    signIn()
    render(<GarminConnect {...baseProps} mfaRequired={true} />)
    const verify = screen.getByText('Verify Code') as HTMLButtonElement
    expect(verify.disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '12345' } })
    expect(verify.disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } })
    expect(verify.disabled).toBe(false)
  })
})
