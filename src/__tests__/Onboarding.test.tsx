/**
 * Onboarding flow — verifies the race-distance step (Q1) shows for trail races
 * and is skipped for hyrox / general fitness, and that the resulting config
 * carries `raceDistance` only when applicable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import Onboarding from '../components/Onboarding'
import type { OnboardingConfig } from '../hooks/useOnboarding'

beforeEach(() => {
  cleanup()
})

/** Click the on-screen "Continue" button. */
function clickContinue() {
  fireEvent.click(screen.getByRole('button', { name: /continue|create my plan/i }))
}

/** Click an option card by its visible title text. */
function pickOption(title: string | RegExp) {
  fireEvent.click(screen.getByText(title).closest('button')!)
}

/** Type into the input that follows the given label. */
function typeInto(label: string | RegExp, value: string) {
  const labelEl = screen.getByText(label)
  const input = labelEl.parentElement!.querySelector('input')!
  fireEvent.change(input, { target: { value } })
}

describe('Onboarding — race-distance step', () => {
  it('shows the race-distance step when raceType is trail/road', () => {
    const onComplete = vi.fn()
    render(<Onboarding onComplete={onComplete} />)

    // Step 0: race type → Trail
    pickOption(/Trail \/ Road Race/)
    clickContinue()

    // Step 1: race name
    typeInto(/Race name/, 'Broken Arrow Skyrace 26K')
    clickContinue()

    // Step 2: race distance — should be visible for trail
    expect(screen.getByText(/race distance/i)).toBeInTheDocument()
    expect(screen.getByText(/^Marathon$/)).toBeInTheDocument()
    expect(screen.getByText(/100 Mile/)).toBeInTheDocument()
  })

  it('skips the race-distance step for Hyrox', () => {
    const onComplete = vi.fn()
    render(<Onboarding onComplete={onComplete} />)

    pickOption(/^Hyrox$/)
    clickContinue()
    typeInto(/Race name/, 'Hyrox SF')
    clickContinue()

    // We should now be on the experience step, NOT on the race-distance step.
    expect(screen.queryByText(/race distance/i)).not.toBeInTheDocument()
    expect(screen.getByText(/how would you rate your fitness/i)).toBeInTheDocument()
  })

  it('skips the race-distance step for General Fitness', () => {
    const onComplete = vi.fn()
    render(<Onboarding onComplete={onComplete} />)

    pickOption(/General Fitness/)
    clickContinue()
    typeInto(/Plan name/, 'Summer Block')
    clickContinue()

    expect(screen.queryByText(/race distance/i)).not.toBeInTheDocument()
    expect(screen.getByText(/how would you rate your fitness/i)).toBeInTheDocument()
  })

  it('includes raceDistance in the completed config for trail races', () => {
    const onComplete = vi.fn<(c: OnboardingConfig) => void>()
    render(<Onboarding onComplete={onComplete} />)

    pickOption(/Trail \/ Road Race/)
    clickContinue()
    typeInto(/Race name/, '50K Test')
    clickContinue()
    // race-distance step
    pickOption(/50K Ultra/)
    clickContinue()
    // experience
    pickOption(/Intermediate/)
    clickContinue()
    // days
    pickOption(/^4 Days$/)
    clickContinue()
    // variant — long-run day
    pickOption(/^Saturday$/)
    clickContinue()
    // wearable
    pickOption(/No wearable/)
    clickContinue()
    // profile
    typeInto(/Name/, 'Jenn')
    typeInto(/Age/, '40')
    clickContinue()

    expect(onComplete).toHaveBeenCalledTimes(1)
    const cfg = onComplete.mock.calls[0][0]
    expect(cfg.raceType).toBe('trail')
    expect(cfg.raceDistance).toBe('50k')
    expect(cfg.athleteName).toBe('Jenn')
  })

  it('omits raceDistance when raceType is Hyrox', () => {
    const onComplete = vi.fn<(c: OnboardingConfig) => void>()
    render(<Onboarding onComplete={onComplete} />)

    pickOption(/^Hyrox$/)
    clickContinue()
    typeInto(/Race name/, 'Hyrox SF')
    clickContinue()
    pickOption(/Intermediate/)
    clickContinue()
    pickOption(/^4 Days$/)
    clickContinue()
    pickOption(/^Wall Balls$/)
    clickContinue()
    pickOption(/No wearable/)
    clickContinue()
    typeInto(/Name/, 'Mike')
    typeInto(/Age/, '42')
    clickContinue()

    expect(onComplete).toHaveBeenCalledTimes(1)
    const cfg = onComplete.mock.calls[0][0]
    expect(cfg.raceType).toBe('hyrox')
    expect(cfg.raceDistance).toBeUndefined()
  })

  it('Back from experience returns to race-distance for trail (not to race-name)', () => {
    render(<Onboarding onComplete={vi.fn()} />)

    pickOption(/Trail \/ Road Race/)
    clickContinue()
    typeInto(/Race name/, 'Foo')
    clickContinue()
    pickOption(/^Marathon$/)
    clickContinue()
    // Now on experience step. Find the back arrow (first button in the header).
    const backArrow = document.querySelector('.fixed .flex.items-center.justify-between button') as HTMLButtonElement
    fireEvent.click(backArrow)
    expect(screen.getByText(/race distance/i)).toBeInTheDocument()
  })

  it('Back from experience returns to race-name for hyrox (race-distance is skipped)', () => {
    render(<Onboarding onComplete={vi.fn()} />)

    pickOption(/^Hyrox$/)
    clickContinue()
    typeInto(/Race name/, 'Foo')
    clickContinue()
    // Now on experience step (race-distance was skipped).
    const backArrow = document.querySelector('.fixed .flex.items-center.justify-between button') as HTMLButtonElement
    fireEvent.click(backArrow)
    expect(screen.getByText(/tell us about your race/i)).toBeInTheDocument()
    expect(screen.queryByText(/race distance/i)).not.toBeInTheDocument()
  })
})
