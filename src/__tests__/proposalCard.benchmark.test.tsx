/**
 * The chat card for a benchmark the coach heard: every line the athlete is
 * confirming is on it (kind, value as parsed, date, protocol) plus the
 * engines' "what this changes"; Save applies, "Don't record" declines,
 * and the applied state offers the undo.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ProposalCard from '../components/ProposalCard'
import type { CoachAction } from '../types'

afterEach(cleanup)

const action: CoachAction = {
  type: 'propose_benchmark',
  label: 'Save benchmark',
  detail: '5K 21:40 · 2026-09-16 · parkrun',
  proposedBenchmarks: {
    entries: [{ kind: 'race_5k', value: 21 * 60 + 40, unit: 'seconds', dateIso: '2026-09-16', protocol: 'parkrun', rationale: 'A fresh 5K re-anchors every pace band' }],
    rationale: "Recording yesterday's 5K",
  },
}

describe('ProposalCard — benchmark', () => {
  it('shows the benchmark as parsed, its date and protocol, and what the plan will do with it', () => {
    const onApprove = vi.fn()
    render(
      <ProposalCard
        action={action} status="pending" onApprove={onApprove}
        previewBenchmark={() => ({ lines: ['VDOT 43.9 → 45.2', 'Easy: 8:52–9:20 → 8:38–9:05 /mi'], changesPlan: true })}
      />,
    )
    const card = screen.getByTestId('benchmark-proposal')
    expect(card.textContent).toContain('Benchmark to record')
    expect(card.textContent).toContain('5K')
    expect(card.textContent).toContain('21:40')
    expect(card.textContent).toContain('2026-09-16 · parkrun')
    expect(screen.getByTestId('benchmark-proposal-preview').textContent).toContain('What this changes')
    expect(card.textContent).toContain('VDOT 43.9 → 45.2')
    expect(card.textContent).toContain("Recording yesterday's 5K")
    fireEvent.click(screen.getByText('✓ Save benchmark'))
    expect(onApprove).toHaveBeenCalledWith(action)
  })

  it('"Don\'t record" declines, "Fix a detail" seeds the chat', () => {
    const onReject = vi.fn(), onAsk = vi.fn()
    render(<ProposalCard action={action} status="pending" onReject={onReject} onAsk={onAsk} />)
    fireEvent.click(screen.getByText('✎ Fix a detail'))
    expect(onAsk).toHaveBeenCalledWith(expect.stringContaining("isn't quite right"))
    fireEvent.click(screen.getByText("Don't record"))
    expect(onReject).toHaveBeenCalled()
  })

  it('applied state says the plan is using it and offers the undo with the token', () => {
    const onUndo = vi.fn()
    render(
      <ProposalCard action={action} status="applied" overrideId="bm:abc" onUndo={onUndo}
        previewBenchmark={() => ({ lines: ['VDOT 43.9 → 45.2'], changesPlan: true })} />,
    )
    expect(screen.getByTestId('benchmark-proposal').textContent).toContain('Recorded — the plan is using it')
    fireEvent.click(screen.getByText('↩ Undo — remove from your benchmarks'))
    expect(onUndo).toHaveBeenCalledWith('bm:abc')
  })

  it('a coach-only kind says it is saved for the coach; rejected collapses to one line', () => {
    const mile: CoachAction = { ...action, proposedBenchmarks: { entries: [{ kind: 'mile_tt', value: 6 * 60 + 12, unit: 'seconds', dateIso: '2026-09-16' }] } }
    const { unmount } = render(
      <ProposalCard action={mile} status="applied" overrideId="bm:x" onUndo={() => {}}
        previewBenchmark={() => ({ lines: ['Recorded for the coach; nothing in the plan changes.'], changesPlan: false })} />,
    )
    expect(screen.getByTestId('benchmark-proposal').textContent).toContain('saved for the coach')
    unmount()
    render(<ProposalCard action={action} status="rejected" />)
    expect(screen.getByText(/Not recorded — 5K 21:40/)).toBeTruthy()
  })

  it('benchmarks riding along with plan ops are listed under the ops', () => {
    const mixed: CoachAction = {
      type: 'propose_edit', label: 'Apply this change', detail: 'x',
      proposedEdit: { ops: [{ op: { kind: 'updateDay', weekNum: 6, dayIndex: 2, updates: { workout: 'Easy 40 min' } } }] },
      proposedBenchmarks: { entries: [{ kind: 'race_5k', value: 1300, unit: 'seconds', dateIso: '2026-09-16' }] },
    }
    render(<ProposalCard action={mixed} status="pending" previewBenchmark={() => ({ lines: ['VDOT 43.9 → 45.2'], changesPlan: true })} />)
    expect(screen.getByTestId('benchmark-riders').textContent).toContain('Record 5K 21:40 · 2026-09-16 — VDOT 43.9 → 45.2')
  })
})
