import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { refusedOnUploadedPlan, UPLOADED_PLAN_REFUSAL } from '../../utils/planImport/guardrails'
import ProposalCard, { type ShapeContext } from '../../components/ProposalCard'
import MondayReviewSheet from '../../components/MondayReviewSheet'
import CoachToolsPanel from '../../components/CoachToolsPanel'
import { isSimDay } from '../../utils/simSession'
import type { CoachAction, PlanEditOp, PlannedDay } from '../../types'
import type { WeeklyReview } from '../../engines/adaptive/weeklyReview'

/**
 * Initiative 004, D1: an uploaded plan is followed as written. The coach may
 * edit single days with the athlete's approval; nothing reshapes the plan.
 */

afterEach(cleanup)

const edit = (...ops: PlanEditOp[]): CoachAction => ({
  type: 'propose_edit', label: 'Edit', detail: '', proposedEdit: { ops: ops.map(op => ({ op })) },
} as CoachAction)

describe('refusedOnUploadedPlan', () => {
  it('refuses a week layout, in place or rebuilt', () => {
    const shape = { 1: 'rest', 2: 'run', 3: 'run', 4: 'quality', 5: 'rest', 6: 'run', 7: 'long' } as const
    expect(refusedOnUploadedPlan({ type: 'propose_reshape', label: '', detail: '', proposedReshape: { shape } } as CoachAction)).toBe(true)
    expect(refusedOnUploadedPlan({ type: 'propose_reshape', label: '', detail: '', proposedReshape: { shape, mode: 'rebuild' } } as CoachAction)).toBe(true)
  })

  it('refuses any whole-week op, even beside day edits', () => {
    const day = { kind: 'updateDay', weekNum: 3, dayIndex: 1, updates: { workout: 'Easy' } } as PlanEditOp
    expect(refusedOnUploadedPlan(edit({ kind: 'deleteWeek', weekNum: 4 }))).toBe(true)
    expect(refusedOnUploadedPlan(edit({ kind: 'addWeek', atNum: 4, week: {} as never }))).toBe(true)
    expect(refusedOnUploadedPlan(edit({ kind: 'updateWeek', weekNum: 4, updates: { focus: 'Recovery' } }))).toBe(true)
    expect(refusedOnUploadedPlan(edit(day, { kind: 'deleteWeek', weekNum: 4 }))).toBe(true)
  })

  it('allows edits to single days, and actions that change no plan', () => {
    expect(refusedOnUploadedPlan(edit(
      { kind: 'updateDay', weekNum: 3, dayIndex: 1, updates: { workout: 'Easy' } },
      { kind: 'addDay', weekNum: 3, atIndex: 2, day: {} as PlannedDay },
      { kind: 'deleteDay', weekNum: 3, dayIndex: 4 },
    ))).toBe(false)
    expect(refusedOnUploadedPlan({ type: 'propose_benchmark', label: '', detail: '' } as CoachAction)).toBe(false)
    expect(refusedOnUploadedPlan({ type: 'skip', label: '', detail: '' } as CoachAction)).toBe(false)
  })
})

describe('a coach reshape on an uploaded plan', () => {
  const ctx: ShapeContext = {
    current: { 1: 'rest', 2: 'quality', 3: 'run', 4: 'strength', 5: 'run', 6: 'run', 7: 'long' },
    currentWeekNum: 6, lastWeekNum: 18, weekStarted: true, plan: 'road',
  }
  const action: CoachAction = {
    type: 'propose_reshape', label: 'Shape my week', detail: '',
    proposedReshape: { shape: { ...ctx.current, 6: 'long', 7: 'rest' } },
  }

  it('shows why it cannot apply, with no Apply and no Adjust', () => {
    const onApprove = vi.fn(), onReject = vi.fn()
    render(<ProposalCard action={action} status="pending" shapeContext={{ ...ctx, uploadedPlan: true }}
      onApprove={onApprove} onReject={onReject} onAdjustReshape={vi.fn()} />)
    expect(screen.getByTestId('reshape-locked').textContent).toContain(UPLOADED_PLAN_REFUSAL)
    expect(screen.queryByTestId('reshape-apply')).toBeNull()
    expect(screen.queryByTestId('reshape-adjust')).toBeNull()
    fireEvent.click(screen.getByText('OK'))
    expect(onReject).toHaveBeenCalled()
    expect(onApprove).not.toHaveBeenCalled()
  })

  it('leaves a generated plan\'s card as it was', () => {
    render(<ProposalCard action={action} status="pending" shapeContext={ctx} onApprove={vi.fn()} />)
    expect(screen.queryByTestId('reshape-locked')).toBeNull()
    expect(screen.getByTestId('reshape-apply')).toBeTruthy()
  })

  it('keeps a past turn\'s history as it was', () => {
    render(<ProposalCard action={action} status="applied" shapeContext={{ ...ctx, uploadedPlan: true }} />)
    expect(screen.queryByTestId('reshape-locked')).toBeNull()
  })
})

describe('the Monday review after a long break', () => {
  const restart = {
    reviewedWeekNum: 3, nextWeekNum: 4,
    execution: {
      weekNum: 3, scored: [], plannedSessions: 4, completedSessions: 0, keyHit: 0, keyTotal: 2,
      struggledKeys: 0, medianPaceDeltaFrac: null, longRunDriftPct: null, verdict: 'hold', reasons: [],
    },
    gap: { days: 70, lastActivityIso: '2026-07-01', tier: 'restart', volumeFactor: 0, guidance: 'Rebuild the plan.' },
    adjustments: [],
    headline: 'Long time away.',
  } as unknown as WeeklyReview

  it('offers no rebuild when there is none to offer, only resuming', () => {
    const onDismiss = vi.fn()
    render(<MondayReviewSheet review={restart} onApply={vi.fn()} onDismiss={onDismiss} />)
    expect(screen.queryByText('Rebuild my plan from here')).toBeNull()
    expect(screen.getAllByText('Resume as planned')).toHaveLength(1)
    fireEvent.click(screen.getByText('Resume as planned'))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('still offers it on a generated plan', () => {
    render(<MondayReviewSheet review={restart} onApply={vi.fn()} onDismiss={vi.fn()} onRebuild={vi.fn()} />)
    expect(screen.getByText('Rebuild my plan from here')).toBeTruthy()
  })
})

describe('Coach tools on an uploaded plan', () => {
  const base = {
    autopilot: { baselineNights: 30, baselineTarget: 21, healthConnected: true, lastAction: null },
    mondayReviewLive: false, logCount: 0, onOpenLog: vi.fn(), levers: [], onAskCoach: vi.fn(), onOpenEngine: vi.fn(),
  }

  it('hides Level Up and says the autopilot is off', () => {
    render(<CoachToolsPanel {...base} uploadedPlan />)
    expect(screen.queryByText(/Level up/i)).toBeNull()
    expect(screen.getByTestId('autopilot-own-plan')).toBeTruthy()
    expect(screen.queryByTestId('autopilot-armed')).toBeNull()
  })

  it('leaves a generated plan\'s tools as they were', () => {
    render(<CoachToolsPanel {...base} />)
    expect(screen.getAllByText(/Level up/i).length).toBeGreaterThan(0)
    expect(screen.getByTestId('autopilot-armed')).toBeTruthy()
  })
})

describe('simulation days', () => {
  const sim: PlannedDay = {
    day: 'Sat 10/10', type: 'long', workout: 'Marathon race simulation',
    detail: '18 mi with the last 10 at goal pace', zone: '18.0 mi · Z2–3', route: '', time: '—',
  }

  it('never turns an uploaded plan\'s own "simulation" into a HYROX circuit', () => {
    expect(isSimDay({ ...sim, verbatimDetail: true })).toBe(false)
    expect(isSimDay(sim)).toBe(true)
  })
})
