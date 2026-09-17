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
    expect(row).toMatch(/History: 22:15 \(2026-05\)/)
    expect(row).toContain('current')
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
