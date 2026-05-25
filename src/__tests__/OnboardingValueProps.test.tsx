import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import OnboardingValueProps from '../components/OnboardingValueProps'

beforeEach(() => {
  cleanup()
})

describe('OnboardingValueProps', () => {
  it('leads with the coach-in-your-pocket framing', () => {
    render(<OnboardingValueProps onContinue={vi.fn()} athleteName="Joe" />)
    expect(screen.getByText(/A coach in your pocket/i)).toBeInTheDocument()
    expect(screen.getByText(/You're in, Joe/i)).toBeInTheDocument()
  })

  it('emphasizes the unique features (personalization, editing, coach suggestions, display)', () => {
    render(<OnboardingValueProps onContinue={vi.fn()} />)
    expect(screen.getByText(/Personalized to you/i)).toBeInTheDocument()
    expect(screen.getByText(/Edit any workout yourself, or let your coach propose changes/i)).toBeInTheDocument()
    expect(screen.getByText(/See it your way/i)).toBeInTheDocument()
  })

  it('fires onContinue from the CTA', () => {
    const onContinue = vi.fn()
    render(<OnboardingValueProps onContinue={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: /let's go/i }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })
})
