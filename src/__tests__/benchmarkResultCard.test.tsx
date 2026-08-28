/**
 * N17 — the benchmark card's three field bugs: a "null bpm" headline on
 * erg-only results, Apply vanishing without confirmation (the assessment
 * stops qualifying the moment its suggestion is saved), and labels that
 * promised zone changes that weren't on offer.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import BenchmarkResultCard from '../components/BenchmarkResultCard'
import type { BenchmarkResultAssessment } from '../engines/planGenerator/benchmarkResult'

afterEach(cleanup)

const ergOnly: BenchmarkResultAssessment = {
  qualifies: true, source: 'hyrox_1km_tt', isoDate: '2026-08-25',
  workout: 'BENCHMARK: 1km erg time trial', ttAvgHR: 169, observedMaxHR: null,
  suggestedLthr: null, suggestedMaxHR: null, suggestedErg500Sec: 107, suggestedErg1kSec: 214,
  currentMaxHR: 185, currentLthr: 150,
  evidence: ['Erg baseline (2026-08-25): 1:47 /500m read from the recording — saved to your measured benchmarks on Apply'],
}

describe('BenchmarkResultCard — erg-only result', () => {
  it('never says "null bpm": the headline is the erg baseline itself', () => {
    render(<BenchmarkResultCard assessment={ergOnly} onApply={() => 'b1'} onDismiss={vi.fn()} onUndo={vi.fn()} />)
    expect(screen.getByText('Erg baseline captured — 1:47 /500m')).toBeTruthy()
    expect(screen.queryByText(/null/)).toBeNull()
    expect(screen.getByTestId('benchmark-apply').textContent).toBe('Save to my benchmarks')
  })

  it('Apply shows a confirmation that SURVIVES the assessment re-deriving', () => {
    const { rerender } = render(
      <BenchmarkResultCard assessment={ergOnly} onApply={() => 'b1'} onDismiss={vi.fn()} onUndo={vi.fn()} />,
    )
    fireEvent.click(screen.getByTestId('benchmark-apply'))
    expect(screen.getByTestId('benchmark-applied').textContent).toContain('erg baseline 1:47 /500m saved')
    // Saving the suggestion makes the next assessment non-qualifying —
    // the confirmation must not vanish (the field bug).
    rerender(
      <BenchmarkResultCard
        assessment={{ ...ergOnly, qualifies: false, suggestedErg500Sec: null }}
        onApply={() => 'b1'} onDismiss={vi.fn()} onUndo={vi.fn()}
      />,
    )
    expect(screen.getByTestId('benchmark-applied')).toBeTruthy()
  })

  it('a max-HR result keeps the zones language', () => {
    render(
      <BenchmarkResultCard
        assessment={{ ...ergOnly, suggestedMaxHR: 193, observedMaxHR: 193 }}
        onApply={() => 'b1'} onDismiss={vi.fn()} onUndo={vi.fn()}
      />,
    )
    expect(screen.getByText(/193 bpm — above your configured max/)).toBeTruthy()
    expect(screen.getByTestId('benchmark-apply').textContent).toBe('Update my zones')
  })
})
