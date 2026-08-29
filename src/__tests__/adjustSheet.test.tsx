/**
 * The tray's contract: preview → apply → stated outcome → working undo.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import AdjustSheet from '../components/AdjustSheet'
import { leversFor } from '../utils/adjustLevers'
import type { PlannedDay } from '../types'

afterEach(cleanup)

const tempo = (): PlannedDay => ({
  day: 'Fri', type: 'quality', workout: 'Tempo — 4×5min @ AnT',
  detail: '', zone: 'Z4', route: '', time: '50 min',
})

describe('before committing', () => {
  it('shows what each lever will do', () => {
    render(<AdjustSheet levers={leversFor(tempo())} applied={null} onApply={vi.fn()} onUndo={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByTestId('lever-fit30').textContent).toContain('50 min becomes 30')
    expect(screen.getByTestId('lever-easy').textContent).toContain('not made up later')
  })

  it('hands back the whole lever, so the caller applies exactly what was shown', () => {
    const onApply = vi.fn()
    const levers = leversFor(tempo())
    render(<AdjustSheet levers={levers} applied={null} onApply={onApply} onUndo={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('lever-fit30'))
    expect(onApply).toHaveBeenCalledWith(levers.find(l => l.id === 'fit30'))
  })
})

describe('after applying', () => {
  it('states what actually happened and offers Undo', () => {
    const onUndo = vi.fn()
    render(
      <AdjustSheet
        levers={leversFor(tempo())}
        applied="Trimmed to 30 min — the intervals are intact."
        onApply={vi.fn()} onUndo={onUndo} onClose={vi.fn()}
      />,
    )
    expect(screen.getByTestId('adjust-outcome').textContent).toContain('Trimmed to 30 min')
    fireEvent.click(screen.getByTestId('adjust-undo'))
    expect(onUndo).toHaveBeenCalledOnce()
  })

  it('stops offering the levers once one has been applied', () => {
    render(<AdjustSheet levers={leversFor(tempo())} applied="Done." onApply={vi.fn()} onUndo={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByTestId('lever-fit30')).toBeNull()
  })
})

describe('when there is nothing honest to offer', () => {
  it('says so rather than showing an empty tray', () => {
    render(<AdjustSheet levers={[]} applied={null} onApply={vi.fn()} onUndo={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByTestId('adjust-sheet').textContent).toContain('already as short and easy as it gets')
  })
})
