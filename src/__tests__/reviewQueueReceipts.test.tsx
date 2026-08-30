/**
 * P15 — applying a proposal from the queue must leave a receipt, and an
 * undoable one must be undoable.
 *
 * The four calibration cards each showed an "applied ✓ / Undo" confirmation.
 * Folding them into the queue must not lose that: an applied item leaves the
 * queue on the next render (its source stops qualifying), so without a
 * receipt the only evidence anything happened is a card vanishing.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ReviewQueuePanel, { type ApplyResult } from '../components/ReviewQueuePanel'
import type { QueueItem } from '../utils/reviewQueue'

const NOW = Date.parse('2026-08-29T20:00:00')
const item = (id: string, over: Partial<QueueItem> = {}): QueueItem => ({
  id, kind: 'recalibration', title: `Proposal ${id}`,
  consequence: `what ${id} does`, raisedAt: NOW - 2 * 86400000, ...over,
})

describe('applying leaves a receipt', () => {
  it('shows an Applied receipt after Sounds right', () => {
    render(<ReviewQueuePanel items={[item('a')]} onApply={() => ({})} onSnooze={vi.fn()} now={NOW} />)
    fireEvent.click(screen.getByTestId('queue-apply-a'))
    expect(screen.getByTestId('queue-receipt-a').textContent).toContain('Applied')
  })

  it('offers Undo when the apply returns one, and calls it', () => {
    const undo = vi.fn()
    const onApply = (): ApplyResult => ({ undo })
    render(<ReviewQueuePanel items={[item('a')]} onApply={onApply} onSnooze={vi.fn()} now={NOW} />)
    fireEvent.click(screen.getByTestId('queue-apply-a'))
    const undoBtn = screen.getByTestId('queue-undo-a')
    fireEvent.click(undoBtn)
    expect(undo).toHaveBeenCalledOnce()
    // The receipt clears once undone — the change is no longer in effect.
    expect(screen.queryByTestId('queue-receipt-a')).toBeNull()
  })

  it('says a change cannot be taken back rather than offering a dead button', () => {
    render(<ReviewQueuePanel items={[item('a')]} onApply={() => ({})} onSnooze={vi.fn()} now={NOW} />)
    fireEvent.click(screen.getByTestId('queue-apply-a'))
    expect(screen.getByTestId('queue-receipt-a').textContent).toContain('cannot be taken back')
    expect(screen.queryByTestId('queue-undo-a')).toBeNull()
  })

  it('survives the item leaving the queue, which is what applying does', () => {
    // Apply, then re-render with the item gone (its source stopped
    // qualifying). The receipt is the only remaining evidence, and it stays.
    const { rerender } = render(
      <ReviewQueuePanel items={[item('a')]} onApply={() => ({ undo: vi.fn() })} onSnooze={vi.fn()} now={NOW} />,
    )
    fireEvent.click(screen.getByTestId('queue-apply-a'))
    rerender(<ReviewQueuePanel items={[]} onApply={() => ({})} onSnooze={vi.fn()} now={NOW} />)
    expect(screen.getByTestId('queue-receipt-a')).toBeTruthy()
    expect(screen.getByTestId('queue-undo-a')).toBeTruthy()
  })

  it('keeps a receipt per apply, newest first', () => {
    render(
      <ReviewQueuePanel items={[item('a'), item('b')]} onApply={() => ({})} onSnooze={vi.fn()} now={NOW} />,
    )
    fireEvent.click(screen.getByTestId('queue-apply-a'))
    fireEvent.click(screen.getByTestId('queue-apply-b'))
    const receipts = screen.getByTestId('queue-receipts')
    const ids = [...receipts.querySelectorAll('[data-testid^="queue-receipt-"]')]
      .map(el => el.getAttribute('data-testid'))
    expect(ids).toEqual(['queue-receipt-b', 'queue-receipt-a'])
  })
})
