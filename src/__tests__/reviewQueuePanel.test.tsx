/**
 * The queue as the athlete meets it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ReviewQueuePanel from '../components/ReviewQueuePanel'
import { QUEUE_CAP, STALE_DAYS, type QueueItem } from '../utils/reviewQueue'

afterEach(cleanup)

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 7, 29, 12)
const item = (id: string, daysAgo: number): QueueItem => ({
  id, kind: 'mim', title: `Proposal ${id}`,
  consequence: 'Future erg days get slightly harder.',
  raisedAt: NOW - daysAgo * DAY,
})
const props = { onApply: vi.fn(), onSnooze: vi.fn(), now: NOW }

describe('an item', () => {
  it('states its consequence before asking for a decision', () => {
    render(<ReviewQueuePanel {...props} items={[item('a', 1)]} />)
    expect(screen.getByTestId('queue-item-a').textContent).toContain('Future erg days get slightly harder')
  })

  it('shows how long it has waited, and flags it once that is too long', () => {
    render(<ReviewQueuePanel {...props} items={[item('fresh', 1), item('old', STALE_DAYS + 2)]} />)
    expect(screen.getByTestId('queue-age-fresh').textContent).toBe('waiting 1 day')
    expect(screen.getByTestId('queue-age-old').textContent).toBe(`waiting ${STALE_DAYS + 2} days`)
    expect(screen.getByTestId('queue-age-old').className).toMatch(/amber/)
  })

  it('offers apply and snooze — never a permanent dismissal', () => {
    const onApply = vi.fn(); const onSnooze = vi.fn()
    render(<ReviewQueuePanel {...props} items={[item('a', 1)]} onApply={onApply} onSnooze={onSnooze} />)
    expect(screen.getByTestId('queue-snooze-a').textContent).toBe('Snooze 30 days')
    fireEvent.click(screen.getByTestId('queue-apply-a'))
    fireEvent.click(screen.getByTestId('queue-snooze-a'))
    expect(onApply).toHaveBeenCalledOnce()
    expect(onSnooze).toHaveBeenCalledOnce()
    expect(screen.getByTestId('queue-item-a').textContent.toLowerCase()).not.toContain('never show')
  })

  it('says it will expire on its own, so nothing follows the athlete forever', () => {
    render(<ReviewQueuePanel {...props} items={[item('a', 1)]} />)
    expect(screen.getByTestId('queue-item-a').textContent).toContain('Expires on its own in a fortnight')
  })
})

describe('the cap', () => {
  it('shows what it is holding back rather than swallowing it', () => {
    const many = Array.from({ length: QUEUE_CAP + 3 }, (_, i) => item(`i${i}`, i + 1))
    render(<ReviewQueuePanel {...props} items={many} />)
    expect(screen.getByTestId('queue-overflow').textContent).toContain('3 more waiting')
  })

  it('says nothing about overflow when everything fits', () => {
    render(<ReviewQueuePanel {...props} items={[item('a', 1)]} />)
    expect(screen.queryByTestId('queue-overflow')).toBeNull()
  })
})

describe('an empty queue', () => {
  it('reassures rather than inventing work, and says when the next one comes', () => {
    render(<ReviewQueuePanel {...props} items={[]} />)
    const text = screen.getByTestId('review-queue').textContent ?? ''
    expect(text).toContain('Nothing waiting on you')
    expect(text).toContain('evening close')
  })
})
