/**
 * Settings → Benchmarks: the newest of each kind is current, a stale one
 * says retest and offers the re-entry, history is visible, and removing
 * says what the plan goes back to before it happens.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import BenchmarksSection from '../components/BenchmarksSection'
import type { Benchmark } from '../engines/benchmark/log'

afterEach(cleanup)

const live: Benchmark[] = [
  { id: 'b2', kind: 'race_5k', value: 1300, unit: 'seconds', dateIso: '2026-08-30', source: 'manual', at: 2, protocol: 'parkrun' },
  { id: 'b1', kind: 'race_5k', value: 1335, unit: 'seconds', dateIso: '2026-05-02', source: 'derived', at: 1 },
  { id: 'b3', kind: 'goblet_squat_8rm', value: 55, unit: 'lb', dateIso: '2026-06-03', source: 'logged', at: 3 },
]

describe('BenchmarksSection', () => {
  it('shows the current value of each kind with its source, age and history', () => {
    render(<BenchmarksSection plan="road" live={live} todayIso="2026-09-17" onAdd={() => {}} onRemove={() => {}} />)
    const row = screen.getByTestId('bm-row-race_5k').textContent ?? ''
    expect(row).toContain('5K · 21:40')
    expect(row).toContain('parkrun')
    expect(row).toContain('entered by you')
    expect(row).toContain('current')
    // The change against the previous entry sits beside the current value.
    expect(screen.getByTestId('bm-delta').textContent).toBe('−0:35 ▲')
    // Every entry is one tap away.
    expect(screen.getByTestId('bm-history-toggle').textContent).toBe('History · 2 entries')
  })

  it('History opens the trend and every entry with its change vs the one before', () => {
    const onRemove = vi.fn()
    render(<BenchmarksSection plan="road" live={live} todayIso="2026-09-17" onAdd={() => {}} onRemove={onRemove} />)
    fireEvent.click(screen.getByTestId('bm-history-toggle'))
    expect(screen.getByTestId('bm-trend')).toBeTruthy()
    expect(screen.getByTestId('bm-since-first').textContent).toMatch(/Since your first 5K \(2026-05-02\): −0:35 over 17 wk · your best yet/)
    const newest = screen.getByTestId('bm-entry-b2').textContent ?? ''
    expect(newest).toContain('21:40')
    expect(newest).toContain('current')
    expect(newest).toContain('−0:35 ▲')
    const oldest = screen.getByTestId('bm-entry-b1').textContent ?? ''
    expect(oldest).toContain('22:15')
    expect(oldest).not.toContain('▲')
    // An older entry can be removed on its own, after a confirm.
    fireEvent.click(screen.getByLabelText('Remove 22:15 from 2026-05-02'))
    fireEvent.click(screen.getByText('Yes'))
    expect(onRemove).toHaveBeenCalledWith('b1')
    fireEvent.click(screen.getByText('Hide history'))
    expect(screen.queryByTestId('bm-trend')).toBeNull()
  })

  it('every row offers a new entry, not only a stale one, and a custom series reopens on its own label', () => {
    const onAdd = vi.fn()
    const custom: Benchmark[] = [
      ...live,
      { id: 'c1', kind: 'other', label: 'murph', value: 50 * 60, unit: 'seconds', dateIso: '2026-06-01', source: 'manual', at: 4 },
      { id: 'c2', kind: 'other', label: 'Murph', value: 47 * 60, unit: 'seconds', dateIso: '2026-09-01', source: 'manual', at: 5 },
      { id: 'c3', kind: 'other', label: 'Dead hang', value: 70, unit: 'seconds', dateIso: '2026-09-01', source: 'manual', at: 6 },
    ]
    render(<BenchmarksSection plan="road" live={custom} todayIso="2026-09-17" onAdd={onAdd} onRemove={() => {}} />)
    // Murph (two spellings) is one series; Dead hang is another.
    const murph = screen.getByTestId('bm-row-other-murph')
    expect(murph.textContent).toContain('Murph · 47:00')
    expect(murph.textContent).toContain('History · 2 entries')
    expect(screen.getByTestId('bm-row-other-dead-hang').textContent).toContain('One entry so far')
    fireEvent.click(screen.getByText('+ Log a new 5K'))
    expect(onAdd).toHaveBeenCalledWith('race_5k')
    fireEvent.click(screen.getByText('+ Log a new Murph'))
    expect(onAdd).toHaveBeenCalledWith('other', { label: 'Murph', unit: 'seconds' })
  })

  it('a stale strength number says retest and offers the re-entry for that kind', () => {
    const onAdd = vi.fn()
    render(<BenchmarksSection plan="general" live={live} todayIso="2026-09-17" onAdd={onAdd} onRemove={() => {}} />)
    const row = screen.getByTestId('bm-row-goblet_squat_8rm')
    expect(row.textContent).toContain('retest')
    fireEvent.click(screen.getByText('Enter a new Goblet squat 8RM'))
    expect(onAdd).toHaveBeenCalledWith('goblet_squat_8rm')
  })

  it('removing says what the plan goes back to, then removes only on confirm', () => {
    const onRemove = vi.fn()
    render(<BenchmarksSection plan="road" live={live} todayIso="2026-09-17" onAdd={() => {}} onRemove={onRemove} />)
    fireEvent.click(screen.getAllByText('Remove')[0])
    const confirm = screen.getByTestId('bm-remove-confirm')
    expect(confirm.textContent).toMatch(/goes back to 22:15 \(2026-05-02\)/)
    fireEvent.click(screen.getByText('Keep'))
    expect(onRemove).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByText('Remove')[0])
    fireEvent.click(screen.getByText('Remove', { selector: 'button.font-semibold' }))
    expect(onRemove).toHaveBeenCalledWith('b2')
  })

  it('the add button opens the sheet with no preset', () => {
    const onAdd = vi.fn()
    render(<BenchmarksSection plan="road" live={[]} todayIso="2026-09-17" onAdd={onAdd} onRemove={() => {}} />)
    expect(screen.getByTestId('bm-empty')).toBeTruthy()
    fireEvent.click(screen.getByTestId('bm-add'))
    expect(onAdd).toHaveBeenCalledWith()
  })
})
