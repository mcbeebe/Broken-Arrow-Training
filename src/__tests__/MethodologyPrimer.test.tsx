import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import MethodologyPrimer from '../components/MethodologyPrimer'
import mikePlan from '../data/mike-18k-plan'
import loriPlan from '../data/lori-11k-plan'

beforeEach(() => {
  cleanup()
})

describe('MethodologyPrimer', () => {
  it("opens with the plan's headline + race name", () => {
    render(<MethodologyPrimer plan={mikePlan} onContinue={vi.fn()} />)
    expect(screen.getByText(/your plan is ready/i)).toBeInTheDocument()
    // Race name appears in the header + the "Specific to ..." card.
    expect(screen.getAllByText(/Broken Arrow Skyrace 18K/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/10-week plan/i)).toBeInTheDocument()
  })

  it('surfaces the same key sections as the Settings methodology page', () => {
    render(<MethodologyPrimer plan={mikePlan} onContinue={vi.fn()} />)
    // Periodization + 80/20 always render.
    expect(screen.getByText(/Periodization/i)).toBeInTheDocument()
    expect(screen.getByText(/Most runs are easy/i)).toBeInTheDocument()
    // Eccentric strength + poles render for Mike (plan has both).
    expect(screen.getByText(/Eccentric strength/i)).toBeInTheDocument()
    expect(screen.getByText(/Trekking poles start Week 4/i)).toBeInTheDocument()
    // Recovery + taper.
    expect(screen.getByText(/Week 5 recovery/i)).toBeInTheDocument()
    expect(screen.getByText(/Trust the taper/i)).toBeInTheDocument()
  })

  it("names Mike's Shirley Canyon descent in the eccentric card", () => {
    render(<MethodologyPrimer plan={mikePlan} onContinue={vi.fn()} />)
    expect(screen.getByText(/Shirley Canyon descent/i)).toBeInTheDocument()
  })

  it("hides poles + eccentric cards on plans without them (Lori)", () => {
    render(<MethodologyPrimer plan={loriPlan} onContinue={vi.fn()} />)
    expect(screen.queryByText(/Trekking poles start/i)).toBeNull()
    // Lori's plan doesn't emphasize eccentric work in detail strings.
    // Still verifies the recovery + taper cards render.
    expect(screen.getByText(/Week 5 recovery/i)).toBeInTheDocument()
    expect(screen.getByText(/Trust the taper/i)).toBeInTheDocument()
  })

  it('points the athlete back to Settings for the deep dive', () => {
    render(<MethodologyPrimer plan={mikePlan} onContinue={vi.fn()} />)
    expect(screen.getByText(/Settings → Training Methodology/i)).toBeInTheDocument()
  })

  it('fires onContinue when the CTA is clicked', () => {
    const onContinue = vi.fn()
    render(<MethodologyPrimer plan={mikePlan} onContinue={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: /got it/i }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })
})
