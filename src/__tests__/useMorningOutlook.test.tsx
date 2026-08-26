/**
 * Adaptive engine PR 8 — the Daily Autopilot's consent tier: auto-apply
 * once per morning, snapshot card, one-tap revert, one push per session.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { MorningOutlook } from '../engines/adaptive/morningOutlook'
import { useMorningOutlook, shouldActNow, type OutlookState } from '../hooks/useMorningOutlook'
import MorningOutlookCard from '../components/MorningOutlookCard'

afterEach(cleanup)
beforeEach(() => localStorage.clear())

const NOW = new Date('2026-09-16T09:00:00')

const OUTLOOK: MorningOutlook = {
  dateIso: '2026-09-16',
  verdict: 'swap',
  headline: 'Back off today — the hard session moves, it doesn\'t disappear.',
  why: 'Recovery signals down for a 3rd straight day.',
  before: 'Threshold intervals · 50 min',
  after: 'Easy run · 40 min',
  movedToDay: 'Fri 9/18',
  evidence: [
    { label: '7-day HRV vs your band', value: '13% below' },
    { label: 'Sleep last night', value: '5h 41m' },
    { label: 'Resting HR vs baseline', value: '+6 bpm' },
  ],
  ops: [
    { op: { kind: 'updateDay', weekNum: 1, dayIndex: 1, updates: { workout: 'Easy run' } } },
    { op: { kind: 'updateDay', weekNum: 1, dayIndex: 2, updates: { workout: 'Threshold intervals' } } },
  ],
}

function mkDeps() {
  return {
    applyBatch: vi.fn(() => 'batch_x'),
    undoBatch: vi.fn(),
    appendLog: vi.fn(() => 'log_1'),
    markLogReverted: vi.fn(),
    onArchive: vi.fn(),
    now: () => NOW,
  }
}

describe('useMorningOutlook', () => {
  it('auto-applies exactly once and shows the snapshot card', () => {
    const deps = mkDeps()
    const { result, rerender } = renderHook(() => useMorningOutlook('mike', OUTLOOK, deps))
    expect(deps.applyBatch).toHaveBeenCalledTimes(1)
    expect(deps.appendLog).toHaveBeenCalledWith(expect.objectContaining({
      source: 'autopilot', kind: 'auto', batchId: 'batch_x',
    }))
    expect(result.current.visible).toBe(true)
    expect(result.current.card?.verdict).toBe('swap')
    rerender()
    expect(deps.applyBatch).toHaveBeenCalledTimes(1)
  })

  it('one push per session — a fresh mount the same day never re-applies', () => {
    const deps = mkDeps()
    renderHook(() => useMorningOutlook('mike', OUTLOOK, deps))
    const again = mkDeps()
    const { result } = renderHook(() => useMorningOutlook('mike', OUTLOOK, again))
    expect(again.applyBatch).not.toHaveBeenCalled()
    expect(result.current.visible).toBe(true) // card persists until dismissed
  })

  it('revert undoes the batch, marks the log, and closes the card', () => {
    const deps = mkDeps()
    const { result } = renderHook(() => useMorningOutlook('mike', OUTLOOK, deps))
    act(() => result.current.revert())
    expect(deps.undoBatch).toHaveBeenCalledWith('batch_x')
    expect(deps.markLogReverted).toHaveBeenCalledWith('log_1')
    expect(result.current.visible).toBe(false)
    expect(result.current.reverted).toBe(true)
  })

  it('"Sounds right" keeps the change and closes the card', () => {
    const deps = mkDeps()
    const { result } = renderHook(() => useMorningOutlook('mike', OUTLOOK, deps))
    act(() => result.current.dismiss())
    expect(result.current.visible).toBe(false)
    expect(deps.undoBatch).not.toHaveBeenCalled()
  })
})

describe('shouldActNow', () => {
  const acted: OutlookState = {
    dateIso: '2026-09-16', card: { ...OUTLOOK }, batchId: 'batch_x',
  }

  it('acts only on an actionable, current-day outlook after 5am with no record', () => {
    expect(shouldActNow(null, OUTLOOK, NOW)).toBe(true)
    expect(shouldActNow(acted, OUTLOOK, NOW)).toBe(false)
    expect(shouldActNow(null, OUTLOOK, new Date('2026-09-16T04:30:00'))).toBe(false)
    expect(shouldActNow(null, { ...OUTLOOK, verdict: 'confirm', ops: [] }, NOW)).toBe(false)
    expect(shouldActNow(null, { ...OUTLOOK, dateIso: '2026-09-15' }, NOW)).toBe(false)
    expect(shouldActNow(null, null, NOW)).toBe(false)
  })
})

describe('MorningOutlookCard', () => {
  it('renders the adjustment, the evidence, and routes both buttons', () => {
    const onSoundsRight = vi.fn()
    const onRevert = vi.fn()
    const { ops, ...card } = OUTLOOK
    void ops
    render(<MorningOutlookCard card={card} score={38} onSoundsRight={onSoundsRight} onRevert={onRevert} />)
    expect(screen.getByText(/Back off today/)).toBeTruthy()
    expect(screen.getByText('13% below')).toBeTruthy()
    expect(screen.getByText(/moved to/i)).toBeTruthy()
    expect(screen.getByText('38')).toBeTruthy()
    fireEvent.click(screen.getByText('Sounds right'))
    expect(onSoundsRight).toHaveBeenCalled()
    fireEvent.click(screen.getByText('Do the hard session anyway'))
    expect(onRevert).toHaveBeenCalled()
  })
})
