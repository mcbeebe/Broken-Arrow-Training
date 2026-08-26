/**
 * Adaptive engine PR 9 — the Adaptation Log sheet: badges, undo routing,
 * and the empty state.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import AdaptationLogSheet from '../components/AdaptationLogSheet'
import type { AdaptationLogEntry } from '../hooks/useAdaptationLog'

afterEach(cleanup)

const ENTRIES: AdaptationLogEntry[] = [
  {
    id: 'a1', atMs: new Date('2026-09-16T06:02:00').getTime(), dateIso: '2026-09-16',
    source: 'autopilot', kind: 'auto',
    title: 'Swapped threshold intervals → easy 40 min',
    detail: '7-day HRV 12% below your band, 3rd down day.', batchId: 'batch_1',
  },
  {
    id: 'a2', atMs: new Date('2026-09-14T07:31:00').getTime(), dateIso: '2026-09-14',
    source: 'monday-review', kind: 'applied',
    title: 'Hold the long run', detail: '8 mi → 7 mi (repeat)', batchId: 'batch_2',
  },
  {
    id: 'a3', atMs: new Date('2026-09-04T06:00:00').getTime(), dateIso: '2026-09-04',
    source: 'autopilot', kind: 'reverted',
    title: 'Trimmed strength session', detail: 'Reverted within the morning window.',
  },
]

describe('AdaptationLogSheet', () => {
  it('renders entries with badges, counts, and undo only where a batch lives', () => {
    const onUndo = vi.fn()
    render(<AdaptationLogSheet entries={ENTRIES} onUndo={onUndo} onClose={() => {}} />)
    expect(screen.getByText(/3 this plan · 1 reverted/)).toBeTruthy()
    expect(screen.getByText('auto · today only')).toBeTruthy()
    expect(screen.getByText('you applied')).toBeTruthy()
    expect(screen.getByText('auto · reverted by you')).toBeTruthy()
    // Reverted entry has no undo; the two live batches do.
    expect(screen.queryByTestId('log-undo-a3')).toBeNull()
    fireEvent.click(screen.getByTestId('log-undo-a1'))
    expect(onUndo).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1', batchId: 'batch_1' }))
  })

  it('shows the guardrails and an honest empty state', () => {
    const onClose = vi.fn()
    render(<AdaptationLogSheet entries={[]} onUndo={() => {}} onClose={onClose} />)
    expect(screen.getByText(/Nothing yet/)).toBeTruthy()
    expect(screen.getByText(/Hard days move, never disappear/)).toBeTruthy()
    fireEvent.click(screen.getByText('Close'))
    expect(onClose).toHaveBeenCalled()
  })
})
