/**
 * MethodSelection — verifies the top-3 method picker UI rendered from
 * Onboarding inputs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import MethodSelection from '../components/MethodSelection'
import type { OnboardingConfig } from '../hooks/useOnboarding'

beforeEach(() => {
  cleanup()
})

function makeConfig(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'trail',
    raceName: 'Test Race',
    raceDate: '2026-09-01',
    raceDistance: 'marathon',
    experienceLevel: 'advanced',
    trainingDaysPerWeek: 5,
    wearable: 'none',
    athleteName: 'Test',
    age: 35,
    completedAt: '',
    ...overrides,
  }
}

describe('MethodSelection — rendering', () => {
  it('renders three method picks for an advanced marathoner', () => {
    render(<MethodSelection config={makeConfig()} onConfirm={vi.fn()} />)
    expect(screen.getByText(/pick your training method/i)).toBeInTheDocument()
    // Top-pick badge + two ranks
    expect(screen.getByText(/top pick/i)).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
    expect(screen.getByText('#3')).toBeInTheDocument()
  })

  it('renders each pick with method name, coach, and signature/rationale lines', () => {
    render(<MethodSelection config={makeConfig()} onConfirm={vi.fn()} />)
    // Daniels is in the top-3 for advanced marathoner on road
    expect(screen.getByText(/Daniels' Running Formula/i)).toBeInTheDocument()
    expect(screen.getByText(/Jack Daniels/i)).toBeInTheDocument()
    // Every pick shows the "Why we picked it" rationale line for strong axes
    expect(screen.getAllByText(/why we picked it/i).length).toBeGreaterThan(0)
  })

  it('renders Heads-up rationale lines when top-3 includes weak axes', () => {
    // A beginner doing 100-mile is an unusual profile — the best-distance
    // picks (koop, roche) are NOT_SUITED / OK on experience, and galloway is
    // CAUTION on distance — so the top-3 will surface Heads-up lines.
    render(
      <MethodSelection
        config={makeConfig({ raceDistance: '100_mile', experienceLevel: 'beginner' })}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getAllByText(/heads-up/i).length).toBeGreaterThan(0)
  })

  it('surfaces restriction warning messages in an amber callout for affected picks', () => {
    // Same profile: koop's experience axis is NOT_SUITED and it carries an
    // experience restriction; its warningMessage should show up.
    render(
      <MethodSelection
        config={makeConfig({ raceDistance: '100_mile', experienceLevel: 'beginner' })}
        onConfirm={vi.fn()}
      />,
    )
    // Restriction warnings render as separate prose lines (not "Heads-up:"
    // bullets). Look for any text that looks like the koop or galloway
    // restriction warning by anchoring on words that appear in those messages.
    const warnings = screen.queryAllByText((_, el) =>
      !!el && el.tagName === 'P' && /beginner|ultra|elite/i.test(el.textContent ?? ''),
    )
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('renders the no-distance fallback when raceDistance is undefined', () => {
    render(
      <MethodSelection
        config={makeConfig({ raceDistance: undefined, raceType: 'hyrox' })}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText(/no race distance set/i)).toBeInTheDocument()
    expect(screen.queryByText(/top pick/i)).not.toBeInTheDocument()
  })
})

describe('MethodSelection — interaction', () => {
  it('Continue button is disabled until a method is selected', () => {
    render(<MethodSelection config={makeConfig()} onConfirm={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /use this method/i })
    expect(btn).toBeDisabled()
  })

  it('Continue button enables after picking a method, then calls onConfirm with that id', () => {
    const onConfirm = vi.fn()
    render(<MethodSelection config={makeConfig()} onConfirm={onConfirm} />)

    // Click the top-pick card (first method card)
    const cards = screen.getAllByRole('button', { pressed: false }).filter(b =>
      b.textContent && /top pick|#\d/i.test(b.textContent),
    )
    expect(cards.length).toBeGreaterThanOrEqual(1)
    fireEvent.click(cards[0])

    const btn = screen.getByRole('button', { name: /use this method/i })
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    // Argument should be one of the eight known method ids
    const id = onConfirm.mock.calls[0][0]
    expect([
      'daniels', 'pfitzinger', 'hansons', 'higdon',
      'galloway', 'fitzgerald_8020', 'koop', 'roche_swap',
    ]).toContain(id)
  })

  it('selecting a different card updates the selection', () => {
    const onConfirm = vi.fn()
    render(<MethodSelection config={makeConfig()} onConfirm={onConfirm} />)

    const cards = screen.getAllByRole('button').filter(b =>
      b.textContent && /top pick|#2|#3/i.test(b.textContent),
    )
    fireEvent.click(cards[0])
    const firstId = (cards[0] as HTMLButtonElement).getAttribute('aria-pressed')
    expect(firstId).toBe('true')

    fireEvent.click(cards[1])
    expect((cards[0] as HTMLButtonElement).getAttribute('aria-pressed')).toBe('false')
    expect((cards[1] as HTMLButtonElement).getAttribute('aria-pressed')).toBe('true')
  })

  it('clicking back invokes onBack', () => {
    const onBack = vi.fn()
    render(<MethodSelection config={makeConfig()} onConfirm={vi.fn()} onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('MethodSelection — content alignment with engine output', () => {
  it('top pick for mountain ultra is koop or roche_swap', () => {
    const onConfirm = vi.fn()
    render(
      <MethodSelection
        config={makeConfig({ raceDistance: 'mountain_ultra', experienceLevel: 'advanced' })}
        onConfirm={onConfirm}
      />,
    )
    // Click the first card and check that onConfirm receives koop or roche_swap
    const cards = screen.getAllByRole('button').filter(b =>
      b.textContent && /top pick/i.test(b.textContent),
    )
    fireEvent.click(cards[0])
    fireEvent.click(screen.getByRole('button', { name: /use this method/i }))
    expect(['koop', 'roche_swap']).toContain(onConfirm.mock.calls[0][0])
  })
})
