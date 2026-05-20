import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CoachInsightPreview from '../components/CoachInsightPreview'
import type { CoachInsight } from '../types'

function insight(text: string, overrides: Partial<CoachInsight> = {}): CoachInsight {
  return { text, generatedAt: Date.now(), ...overrides }
}

describe('<CoachInsightPreview>', () => {
  it('renders coach name, trigger pill and first-sentence preview', () => {
    const onOpen = vi.fn()
    render(
      <CoachInsightPreview
        insight={insight(
          'Triggered by: YELLOW readiness + 4.9h sleep\n\nYour body is screaming for a break. Sleep 8+ hours tonight.',
        )}
        loading={false}
        coachName="Coach Phil English"
        onOpenCoachTab={onOpen}
      />,
    )

    expect(screen.getByText(/coach phil english/i)).toBeInTheDocument()
    expect(screen.getByText(/YELLOW readiness \+ 4\.9h sleep/i)).toBeInTheDocument()
    expect(screen.getByText(/your body is screaming for a break/i)).toBeInTheDocument()
    expect(screen.getByText(/read full message in coach/i)).toBeInTheDocument()
  })

  it('does NOT show the full multi-paragraph body (only the first sentence)', () => {
    render(
      <CoachInsightPreview
        insight={insight(
          "Triggered by: signal\n\nFirst sentence here. Second paragraph with much more detail that should not appear on Summary.",
        )}
        loading={false}
        onOpenCoachTab={vi.fn()}
      />,
    )
    expect(screen.getByText(/first sentence here\./i)).toBeInTheDocument()
    expect(screen.queryByText(/second paragraph/i)).not.toBeInTheDocument()
  })

  it('opens the Coach tab when the card is tapped', () => {
    const onOpen = vi.fn()
    render(
      <CoachInsightPreview
        insight={insight('Triggered by: x\n\nGo run.')}
        loading={false}
        onOpenCoachTab={onOpen}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /open coach tab/i }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when the insight is silent', () => {
    const { container } = render(
      <CoachInsightPreview
        insight={insight('hidden', { silent: true })}
        loading={false}
        onOpenCoachTab={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when there is no insight and not loading', () => {
    const { container } = render(
      <CoachInsightPreview insight={null} loading={false} onOpenCoachTab={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
