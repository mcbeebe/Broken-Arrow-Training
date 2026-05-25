import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import CoachWelcomeCard from '../components/CoachWelcomeCard'
import type { OnboardingConfig } from '../hooks/useOnboarding'

beforeEach(() => {
  cleanup()
})

function makeConfig(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'trail',
    raceName: 'Test',
    raceDate: '',
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5,
    wearable: 'none',
    athleteName: 'Jenn',
    age: 41,
    completedAt: '',
    ...overrides,
  }
}

describe('CoachWelcomeCard', () => {
  it('greets the athlete by name and invites them to chat', () => {
    render(<CoachWelcomeCard coachName="Coach" athleteName="Jenn" config={makeConfig()} />)
    expect(screen.getByText(/Hey Jenn/)).toBeInTheDocument()
    expect(screen.getByText(/welcome aboard/i)).toBeInTheDocument()
  })

  it('spells out what the coach can do (workouts, strategy, recovery)', () => {
    render(<CoachWelcomeCard coachName="Coach" athleteName="Jenn" config={makeConfig()} />)
    expect(screen.getByText(/Suggest and tweak workouts/i)).toBeInTheDocument()
    expect(screen.getByText(/race-day strategy/i)).toBeInTheDocument()
    expect(screen.getByText(/recovery/i)).toBeInTheDocument()
  })

  it('uses the custom coach name when one is set', () => {
    render(<CoachWelcomeCard coachName="Coach Chuck" athleteName="Jenn" config={makeConfig()} />)
    expect(screen.getByText(/Coach Chuck · Welcome/)).toBeInTheDocument()
    expect(screen.getByText(/I'm Coach Chuck, your coach/)).toBeInTheDocument()
  })

  it('offers a Settings shortcut that fires onCustomize', () => {
    const onCustomize = vi.fn()
    render(<CoachWelcomeCard coachName="Coach" config={makeConfig()} onCustomize={onCustomize} />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(onCustomize).toHaveBeenCalledTimes(1)
  })

  it('acknowledges a returning injury when present', () => {
    render(
      <CoachWelcomeCard
        coachName="Coach"
        athleteName="Jenn"
        config={makeConfig({
          injuryStatus: 'returning',
          injuryArea: 'knee',
          injuryTimeframe: 'Cleared 1-2 weeks ago',
        })}
      />,
    )
    expect(screen.getByText(/coming back from a knee injury/)).toBeInTheDocument()
    expect(screen.getByText(/build back gradually/i)).toBeInTheDocument()
  })

  it('says nothing about injury for a healthy athlete', () => {
    render(<CoachWelcomeCard coachName="Coach" athleteName="Jenn" config={makeConfig()} />)
    expect(screen.queryByText(/coming back from/)).not.toBeInTheDocument()
  })
})
