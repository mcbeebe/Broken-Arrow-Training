import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ReviewQueuePanel, { type ApplyResult } from '../components/ReviewQueuePanel'
import type { QueueItem } from '../utils/reviewQueue'
import {
  addReceipt, readReceipts, receiptsKey, writeReceipts,
  MAX_RECEIPTS, RECEIPT_TTL_MS, type StoredReceipt,
} from '../utils/applyReceipts'

/**
 * M7 / "Undo missing" — the athlete who runs the 20-minute test could not
 * actually undo Apply after navigating away.
 *
 * Two independent failures stacked. The undo SNAPSHOT was a `useRef`
 * (covered in engines/benchmark/undoSnapshot.test.ts), and the RECEIPT that
 * carries the Undo button was `useState` inside this panel — so applying
 * from Today, which routes to the Coach review tab, remounted the panel and
 * the button was simply not there. Both surfaces, same gap.
 */

const NOW = Date.parse('2026-08-29T20:00:00')
const ATHLETE = 'mike'
const item = (id: string, over: Partial<QueueItem> = {}): QueueItem => ({
  id, kind: 'benchmark', title: `Proposal ${id}`,
  consequence: `what ${id} does`, raisedAt: NOW - 2 * 86400000, ...over,
})

beforeEach(() => { localStorage.clear(); cleanup() })

describe('the receipt outlives the screen', () => {
  it('a receipt applied on one mount is there on the next', () => {
    const onApply = (): ApplyResult => ({
      undo: vi.fn(), undoToken: { kind: 'benchmark', batchId: 'b1' },
    })
    const first = render(
      <ReviewQueuePanel items={[item('a')]} onApply={onApply} onSnooze={vi.fn()} now={NOW}
        athleteId={ATHLETE} onUndoToken={() => true} />,
    )
    fireEvent.click(screen.getByTestId('queue-apply-a'))
    expect(screen.getByTestId('queue-receipt-a')).toBeInTheDocument()
    first.unmount() // ← navigated away

    render(
      <ReviewQueuePanel items={[]} onApply={onApply} onSnooze={vi.fn()} now={NOW}
        athleteId={ATHLETE} onUndoToken={() => true} />,
    )
    expect(screen.getByTestId('queue-receipt-a').textContent).toContain('Applied')
    expect(screen.getByTestId('queue-undo-a')).toBeInTheDocument()
  })

  it('the rebuilt Undo calls back with the stored token, not a dead closure', () => {
    const onUndoToken = vi.fn(() => true)
    writeReceipts(ATHLETE, [{
      id: 'a', title: 'Proposal a', appliedAt: NOW - 60_000,
      undoToken: { kind: 'benchmark', batchId: 'b1' },
    }])
    render(
      <ReviewQueuePanel items={[]} onApply={() => ({})} onSnooze={vi.fn()} now={NOW}
        athleteId={ATHLETE} onUndoToken={onUndoToken} />,
    )
    fireEvent.click(screen.getByTestId('queue-undo-a'))
    expect(onUndoToken).toHaveBeenCalledWith({ kind: 'benchmark', batchId: 'b1' })
    // Undone → gone, from storage too.
    expect(screen.queryByTestId('queue-receipt-a')).toBeNull()
    expect(readReceipts(ATHLETE, NOW)).toEqual([])
  })

  it('when the way back is genuinely gone it SAYS so, and keeps the receipt', () => {
    // A later apply replaced the snapshot, or storage was cleared. The old
    // code would have removed the receipt and let the athlete believe the
    // change had been reversed.
    writeReceipts(ATHLETE, [{
      id: 'a', title: 'Proposal a', appliedAt: NOW - 60_000,
      undoToken: { kind: 'benchmark', batchId: 'gone' },
    }])
    render(
      <ReviewQueuePanel items={[]} onApply={() => ({})} onSnooze={vi.fn()} now={NOW}
        athleteId={ATHLETE} onUndoToken={() => false} />,
    )
    fireEvent.click(screen.getByTestId('queue-undo-a'))
    const receipt = screen.getByTestId('queue-receipt-a')
    expect(receipt).toBeInTheDocument()
    expect(receipt.textContent).toContain('The way back is gone')
    expect(screen.queryByTestId('queue-undo-a')).toBeNull()
  })

  it('a receipt with no token still says it cannot be taken back', () => {
    render(
      <ReviewQueuePanel items={[item('a', { kind: 'mim' })]} onApply={() => ({})} onSnooze={vi.fn()} now={NOW}
        athleteId={ATHLETE} onUndoToken={() => true} />,
    )
    fireEvent.click(screen.getByTestId('queue-apply-a'))
    expect(screen.getByTestId('queue-receipt-a').textContent).toContain('cannot be taken back')
    expect(screen.queryByTestId('queue-undo-a')).toBeNull()
  })

  it('GUARD: without athleteId the panel keeps its old session-only behaviour', () => {
    const first = render(
      <ReviewQueuePanel items={[item('a')]} onApply={() => ({ undo: vi.fn() })} onSnooze={vi.fn()} now={NOW} />,
    )
    fireEvent.click(screen.getByTestId('queue-apply-a'))
    expect(screen.getByTestId('queue-receipt-a')).toBeInTheDocument()
    first.unmount()
    render(<ReviewQueuePanel items={[]} onApply={() => ({})} onSnooze={vi.fn()} now={NOW} />)
    expect(screen.queryByTestId('queue-receipt-a')).toBeNull()
    expect(localStorage.getItem(receiptsKey(ATHLETE))).toBeNull()
  })
})

describe('the receipt store', () => {
  const r = (id: string, appliedAt: number): StoredReceipt => ({ id, title: id, appliedAt })

  it('expires receipts older than the TTL — an Undo for a fortnight ago is not a real choice', () => {
    writeReceipts(ATHLETE, [r('fresh', NOW - 1000), r('stale', NOW - RECEIPT_TTL_MS - 1)])
    expect(readReceipts(ATHLETE, NOW).map(x => x.id)).toEqual(['fresh'])
  })

  it('caps at MAX_RECEIPTS, newest first', () => {
    const many = Array.from({ length: MAX_RECEIPTS + 4 }, (_, i) => r(`r${i}`, NOW - i * 1000))
    let acc: StoredReceipt[] = []
    for (const one of [...many].reverse()) acc = addReceipt(acc, one)
    expect(acc).toHaveLength(MAX_RECEIPTS)
    expect(acc[0].id).toBe('r0') // most recently added
  })

  it('re-applying the same proposal is one event, not two', () => {
    const acc = addReceipt(addReceipt([], r('a', NOW - 5000)), r('a', NOW))
    expect(acc).toHaveLength(1)
    expect(acc[0].appliedAt).toBe(NOW)
  })

  it('a corrupt payload reads as no receipts, never a throw on render', () => {
    localStorage.setItem(receiptsKey(ATHLETE), '{not json')
    expect(readReceipts(ATHLETE, NOW)).toEqual([])
    localStorage.setItem(receiptsKey(ATHLETE), '{"not":"an array"}')
    expect(readReceipts(ATHLETE, NOW)).toEqual([])
    localStorage.setItem(receiptsKey(ATHLETE), '[null,{"id":1}]')
    expect(readReceipts(ATHLETE, NOW)).toEqual([])
  })

  it('is per-athlete', () => {
    writeReceipts(ATHLETE, [r('a', NOW)])
    expect(readReceipts('someone-else', NOW)).toEqual([])
  })
})
