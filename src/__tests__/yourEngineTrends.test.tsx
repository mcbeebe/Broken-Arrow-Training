/**
 * Progress → Your engine: every benchmark with a second entry is drawn as
 * a trend with its change since the first, and offers the next test.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import YourEngineSection from '../components/YourEngineSection'
import type { Benchmark } from '../engines/benchmark/log'

afterEach(cleanup)

const log: Benchmark[] = [
  { id: 'b2', kind: 'race_5k', value: 1300, unit: 'seconds', dateIso: '2026-08-30', source: 'manual', at: 2 },
  { id: 'b1', kind: 'race_5k', value: 1335, unit: 'seconds', dateIso: '2026-05-02', source: 'derived', at: 1 },
  { id: 'l1', kind: 'lthr', value: 168, unit: 'bpm', dateIso: '2026-06-03', source: 'logged', at: 3 },
]

describe('YourEngineSection benchmark trends', () => {
  it('draws a trend for each series with two entries and names the ones still waiting on a second', () => {
    const onAdd = vi.fn()
    render(<YourEngineSection weeks={[]} capacity={null} config={null} onAddBenchmark={onAdd} benchmarkLog={log} />)
    const card = screen.getByTestId('engine-benchmark-trends')
    expect(card.textContent).toContain('5K')
    expect(card.textContent).toContain('21:40')
    expect(card.textContent).toContain('−0:35 in 17 wk')
    expect(screen.getByTestId('engine-trend-race_5k').querySelector('[data-testid="bm-trend"]')).toBeTruthy()
    expect(card.textContent).toContain('One entry so far for Threshold HR')
    fireEvent.click(screen.getByText('+ Log a new 5K'))
    expect(onAdd).toHaveBeenCalledWith('race_5k')
  })

  it('shows nothing until some benchmark has been measured twice', () => {
    render(<YourEngineSection weeks={[]} capacity={null} config={null} benchmarkLog={[log[2]]} />)
    expect(screen.queryByTestId('engine-benchmark-trends')).toBeNull()
  })
})
