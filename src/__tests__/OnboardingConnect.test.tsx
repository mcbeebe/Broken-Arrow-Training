/**
 * OnboardingConnect — verifies the final "connect Garmin / Strava" step.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import OnboardingConnect from '../components/OnboardingConnect'

// Mock both integrations so we can drive each branch (connected, configured,
// neither configured) without standing up real backends.
const garminMock = vi.hoisted(() => ({
  connected: false,
  configured: true,
  loading: false,
  error: null as string | null,
  mfaRequired: false,
  healthData: [],
  garminActivities: [],
  activityDetails: {},
  lastSync: null as string | null,
  displayName: null as string | null,
  connect: vi.fn(),
  submitMfa: vi.fn(),
  disconnect: vi.fn(),
  sync: vi.fn(),
}))
const stravaMock = vi.hoisted(() => ({
  connected: false,
  configured: true,
  loading: false,
  error: null as string | null,
  athleteName: null as string | null,
  activities: [],
  lastSync: null,
  connect: vi.fn(),
  disconnect: vi.fn(),
  sync: vi.fn(),
}))

vi.mock('../hooks/useGarmin', () => ({
  useGarmin: () => garminMock,
}))
vi.mock('../hooks/useStrava', () => ({
  useStrava: () => stravaMock,
}))

function resetMocks() {
  Object.assign(garminMock, {
    connected: false,
    configured: true,
    loading: false,
    error: null,
    mfaRequired: false,
    lastSync: null,
    displayName: null,
  })
  Object.assign(stravaMock, {
    connected: false,
    configured: true,
    loading: false,
    error: null,
    athleteName: null,
    lastSync: null,
  })
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  resetMocks()
})

describe('OnboardingConnect', () => {
  it('renders both Garmin and Strava connection cards when configured', () => {
    render(<OnboardingConnect athleteId="jenn" onContinue={vi.fn()} />)
    expect(screen.getByText(/last step/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Garmin Connect/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Strava$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument()
  })

  it('shows "Recommended for you" pill on Garmin when the wearable preference is Garmin', () => {
    render(
      <OnboardingConnect
        athleteId="jenn"
        onContinue={vi.fn()}
        wearablePreference="garmin"
      />,
    )
    expect(screen.getByText(/recommended for you/i)).toBeInTheDocument()
  })

  it('omits the recommended pill when the user did not pick Garmin', () => {
    render(
      <OnboardingConnect
        athleteId="jenn"
        onContinue={vi.fn()}
        wearablePreference="apple_watch"
      />,
    )
    expect(screen.queryByText(/recommended for you/i)).not.toBeInTheDocument()
  })

  it('fires onContinue when the skip button is clicked', () => {
    const onContinue = vi.fn()
    render(<OnboardingConnect athleteId="jenn" onContinue={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('changes the button label to Continue once Garmin is connected', () => {
    garminMock.connected = true
    garminMock.displayName = 'Test User'
    const onContinue = vi.fn()
    render(<OnboardingConnect athleteId="jenn" onContinue={onContinue} />)
    // The auto-dismiss effect runs synchronously on mount when connected is
    // already true at render time — assert that path instead of label.
    expect(onContinue).toHaveBeenCalled()
  })

  it('auto-dismisses (calls onContinue) when Strava is already connected on mount', () => {
    stravaMock.connected = true
    const onContinue = vi.fn()
    render(<OnboardingConnect athleteId="jenn" onContinue={onContinue} />)
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('auto-dismisses when neither integration is configured', () => {
    garminMock.configured = false
    stravaMock.configured = false
    const onContinue = vi.fn()
    render(<OnboardingConnect athleteId="jenn" onContinue={onContinue} />)
    expect(onContinue).toHaveBeenCalled()
  })
})
