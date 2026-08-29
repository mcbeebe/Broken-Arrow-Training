/**
 * The rhythm strip renders consistency without shame.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import RhythmStrip from '../components/RhythmStrip'
import type { RhythmDay } from '../utils/rhythm'

afterEach(cleanup)

const days = (states: RhythmDay['state'][]): RhythmDay[] =>
  states.map((state, i) => ({ iso: `2026-08-${String(18 + i).padStart(2, '0')}`, state, label: 'Day' }))

describe('the dots', () => {
  it('counts a rested day as resolved alongside a trained one', () => {
    render(<RhythmStrip rhythm={days(['done', 'rest', 'done', 'today'])} />)
    expect(screen.getByTestId('rhythm-summary').textContent).toBe('3 of your last 3 days resolved')
  })

  it('leaves an open day out of the resolved count without calling it a failure', () => {
    render(<RhythmStrip rhythm={days(['done', 'open', 'done', 'today'])} />)
    expect(screen.getByTestId('rhythm-summary').textContent).toBe('2 of your last 3 days resolved')
    const strip = screen.getByTestId('rhythm-strip')
    // Nothing in the strip is red — an open day asks, it does not accuse.
    expect(strip.innerHTML).not.toMatch(/red|rose-|danger/)
  })

  it('renders one dot per day, each carrying its state', () => {
    const { container } = render(<RhythmStrip rhythm={days(['done', 'open', 'rest', 'today', 'future'])} />)
    const dots = container.querySelectorAll('[data-state]')
    expect(dots.length).toBe(5)
    expect([...dots].map(d => d.getAttribute('data-state')))
      .toEqual(['done', 'open', 'rest', 'today', 'future'])
  })

  it('opens the plan when tapped', () => {
    const onOpenPlan = vi.fn()
    render(<RhythmStrip rhythm={days(['done', 'today'])} onOpenPlan={onOpenPlan} />)
    fireEvent.click(screen.getByTestId('rhythm-strip'))
    expect(onOpenPlan).toHaveBeenCalledOnce()
  })

  it('renders nothing at all rather than an empty strip', () => {
    const { container } = render(<RhythmStrip rhythm={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
