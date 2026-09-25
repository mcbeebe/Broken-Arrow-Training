import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import WeekReviewCard from '../components/WeekReviewCard'
import type { WeekReview } from '../utils/weekReview'

const base: WeekReview = {
  fromIso: '2026-09-19',
  toIso: '2026-09-25',
  stats: {
    planned: { done: 4, due: 5 },
    daysTrained: 5,
    trainingMinutes: 320,
    fitnessDelta: 3,
    hardest: { iso: '2026-09-23', name: 'Hill repeats' },
  },
  wins: ['✅ 4 of 5 planned sessions done — solid consistency.', '📈 Fitness up 3 points — the work is adding up.'],
  fixes: ['⭕ 1 planned session isn’t logged — if you did it, log it; if not, don’t cram it in.'],
}

afterEach(cleanup)

const renderCard = (review: WeekReview = base, open = true) =>
  render(<WeekReviewCard review={review} open={open} onToggle={() => {}} />)

describe('WeekReviewCard', () => {
  it('leads with the window and three plain numbers', () => {
    renderCard()
    expect(screen.getByText('Your last 7 days')).toBeTruthy()
    expect(screen.getByText('Sep 19 – 25')).toBeTruthy()
    expect(screen.getByText('4 of 5')).toBeTruthy()
    expect(screen.getByText('Sessions done')).toBeTruthy()
    expect(screen.getByText('5h 20m')).toBeTruthy()
    expect(screen.getByText('+3')).toBeTruthy()
    expect(screen.getByText('Wed · Hill repeats')).toBeTruthy()
  })

  it('sorts lines into Going well and To improve, emoji kept apart from the words', () => {
    renderCard()
    const good = within(screen.getByRole('region', { name: 'Going well' }))
    expect(good.getAllByRole('listitem')).toHaveLength(2)
    expect(good.getByText('4 of 5 planned sessions done — solid consistency.')).toBeTruthy()
    expect(good.getByText('✅')).toBeTruthy()
    const improve = within(screen.getByRole('region', { name: 'To improve' }))
    expect(improve.getAllByRole('listitem')).toHaveLength(1)
    expect(improve.getByText('⭕')).toBeTruthy()
  })

  it('says so when there is nothing to fix or nothing logged yet', () => {
    renderCard({ ...base, wins: [], fixes: [] })
    expect(within(screen.getByRole('region', { name: 'To improve' })).getByText('Nothing to fix — keep it up.')).toBeTruthy()
    // Five days trained: "log a few sessions" would be wrong.
    expect(within(screen.getByRole('region', { name: 'Going well' })).getByText(/Nothing stands out yet/)).toBeTruthy()
    cleanup()
    renderCard({ ...base, stats: { ...base.stats, daysTrained: 0 }, wins: [], fixes: [] })
    expect(within(screen.getByRole('region', { name: 'Going well' })).getByText(/Log a few sessions/)).toBeTruthy()
  })

  it('falls back to days trained without a dated plan, and hides an unknown training time', () => {
    renderCard({ ...base, stats: { ...base.stats, planned: null, daysTrained: 1, trainingMinutes: null, fitnessDelta: -2 } })
    expect(screen.getByText('Day trained')).toBeTruthy()
    expect(screen.queryByText('Training time')).toBeNull()
    expect(screen.getByText('−2')).toBeTruthy()
  })

  it('collapses to the header and reports its state', () => {
    const onToggle = vi.fn()
    render(<WeekReviewCard review={base} open={false} onToggle={onToggle} />)
    const button = screen.getByRole('button', { name: /Your last 7 days/ })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Going well')).toBeNull()
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalledOnce()
  })
})
