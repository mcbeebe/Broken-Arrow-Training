/**
 * The chat card for a week layout the coach proposes: the seven days with
 * the changed ones marked, each change as from → to, the week it starts
 * and how it applies; the engines' laws gate Apply; "Adjust in the sheet"
 * hands the proposal to the Plan tab's sheet.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ProposalCard, { type ShapeContext } from '../components/ProposalCard'
import { defaultReshapeFromWeek } from '../engines/planGenerator/weekShape'
import type { CoachAction } from '../types'

afterEach(cleanup)

const ctx: ShapeContext = {
  current: { 1: 'rest', 2: 'quality', 3: 'run', 4: 'strength', 5: 'run', 6: 'run', 7: 'long' },
  currentWeekNum: 6, lastWeekNum: 18, weekStarted: true, plan: 'road',
}
const action: CoachAction = {
  type: 'propose_reshape', label: 'Shape my week', detail: '',
  proposedReshape: { shape: { ...ctx.current, 6: 'long', 7: 'rest' }, rationale: 'Sunday is family day' },
}

describe('ProposalCard — reshape', () => {
  it('shows the changes against the layout in force, the default start week, and applies in place', () => {
    const onApprove = vi.fn(), onAdjust = vi.fn()
    render(<ProposalCard action={action} status="pending" shapeContext={ctx} onApprove={onApprove} onAdjustReshape={onAdjust} />)
    const changes = screen.getByTestId('reshape-changes').textContent ?? ''
    expect(changes).toContain('Saturday: Easy run → Long run')
    expect(changes).toContain('Sunday: Long run → Rest')
    expect(changes).toContain('Applies to weeks 7–18; weeks before 7 stay as they were')
    expect(changes).toContain('hand-edited days stay exactly as you edited them')
    expect(screen.getByTestId('reshape-day-6').className).toContain('ring-2')
    expect(screen.getByTestId('reshape-day-3').className).not.toContain('ring-2')
    const apply = screen.getByTestId('reshape-apply') as HTMLButtonElement
    expect(apply.textContent).toBe('✓ Rewrite weeks 7–18, keep my edits')
    fireEvent.click(apply)
    expect(onApprove).toHaveBeenCalledWith(action)
    fireEvent.click(screen.getByTestId('reshape-adjust'))
    expect(onAdjust).toHaveBeenCalledWith(action.proposedReshape)
    expect(defaultReshapeFromWeek(ctx)).toBe(7)
    expect(defaultReshapeFromWeek({ ...ctx, weekStarted: false })).toBe(6)
  })

  it('a layout that breaks a law is shown with the reason and cannot be applied; rebuild mode says what it drops', () => {
    const bad: CoachAction = { ...action, proposedReshape: { shape: { ...ctx.current, 1: 'run' }, fromWeek: 8, mode: 'rebuild' } }
    render(<ProposalCard action={bad} status="pending" shapeContext={ctx} />)
    expect(screen.getByTestId('reshape-issues').textContent).toContain('Keep at least one full rest day')
    expect((screen.getByTestId('reshape-apply') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('reshape-changes').textContent).toContain('hand-edited days and swaps are dropped')
  })

  it('applied in place offers the undo; rejected collapses to one line', () => {
    const onUndo = vi.fn()
    const { unmount } = render(<ProposalCard action={action} status="applied" overrideId="rs:in_place:7" shapeContext={ctx} onUndo={onUndo} />)
    expect(screen.getByTestId('reshape-proposal').textContent).toContain('Week reshaped — weeks 7–18, your edits kept')
    fireEvent.click(screen.getByText('↩ Undo — put the week back'))
    expect(onUndo).toHaveBeenCalledWith('rs:in_place:7')
    unmount()
    render(<ProposalCard action={action} status="rejected" shapeContext={ctx} />)
    expect(screen.getByText('Kept your week as it is')).toBeTruthy()
  })
})
