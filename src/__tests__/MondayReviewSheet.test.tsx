/**
 * Adaptive engine PR 3 — the Monday Review sheet and its cadence hook.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import MondayReviewSheet from '../components/MondayReviewSheet'
import { reviewWeekKey, shouldShowReview } from '../hooks/useMondayReview'
import type { WeeklyReview } from '../engines/adaptive/weeklyReview'

afterEach(cleanup)

function review(over: Partial<WeeklyReview> = {}): WeeklyReview {
  return {
    reviewedWeekNum: 3,
    nextWeekNum: 4,
    execution: {
      weekNum: 3, scored: [], plannedSessions: 4, completedSessions: 3,
      keyHit: 1, keyTotal: 2, struggledKeys: 1,
      medianPaceDeltaFrac: 0.05, longRunDriftPct: 9.2,
      verdict: 'hold', reasons: ['1 key session struggled'],
    },
    gap: { days: 2, lastActivityIso: '2026-09-12', tier: 'none', volumeFactor: 1, guidance: '' },
    adjustments: [
      {
        id: 'hold-long-run', kind: 'structure',
        label: "Hold the long run — don't advance yet",
        before: 'Sat 9/19 · 7 mi', after: 'Sat 9/19 · 6 mi (repeat)',
        why: 'HR drifted 9.2% across last week\'s long run.',
        ops: [{ op: { kind: 'updateDay', weekNum: 4, dayIndex: 2, updates: { zone: '6 mi · Z2 (130–148)' } } }],
      },
      {
        id: 'ease-paces', kind: 'targets',
        label: 'Ease the pace targets',
        before: 'current pace targets', after: 'all future paces +3%',
        why: 'Median 5% slower than target last week.',
        ops: [{ op: { kind: 'updateDay', weekNum: 4, dayIndex: 0, updates: { detail: 'Easy — 10:49 /mi.' } } }],
      },
    ],
    headline: 'Solid week with one flag — one tweak before advancing.',
    ...over,
  }
}

describe('MondayReviewSheet', () => {
  it('renders the evidence strip and adjustment diffs, applying the selected set', () => {
    const onApply = vi.fn()
    render(<MondayReviewSheet review={review()} onApply={onApply} onDismiss={vi.fn()} />)
    expect(screen.getByText('Monday review — Week 3')).toBeTruthy()
    expect(screen.getByText('3/4')).toBeTruthy()
    expect(screen.getByText('9.2%')).toBeTruthy()
    expect(screen.getByText(/HR drifted 9.2%/)).toBeTruthy()

    // Deselect one, apply the other.
    fireEvent.click(screen.getByTestId('adjustment-ease-paces'))
    fireEvent.click(screen.getByText('Apply 1 adjustment'))
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply.mock.calls[0][0].map((a: { id: string }) => a.id)).toEqual(['hold-long-run'])
  })

  it('with everything deselected, the primary action is a plain acknowledge', () => {
    const onDismiss = vi.fn()
    render(<MondayReviewSheet review={review()} onApply={vi.fn()} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByTestId('adjustment-hold-long-run'))
    fireEvent.click(screen.getByTestId('adjustment-ease-paces'))
    fireEvent.click(screen.getByText('Sounds good'))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('the gap variant leads with the resumption guidance', () => {
    const r = review({
      gap: {
        days: 17, lastActivityIso: '2026-08-28', tier: 'ease75', volumeFactor: 0.75,
        guidance: 'Rebuild the next two weeks at 75% volume.',
      },
      adjustments: [review().adjustments[0]],
      headline: "Back after 17 days — here's the way back in.",
    })
    render(<MondayReviewSheet review={r} onApply={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByText('Welcome back')).toBeTruthy()
    expect(screen.getByText(/17 days since your last recorded session/)).toBeTruthy()
    expect(screen.getByText('Resume as planned')).toBeTruthy()
  })

  it('the restart tier routes to the full rebuild', () => {
    const onRebuild = vi.fn()
    const r = review({
      gap: { days: 70, lastActivityIso: '2026-07-01', tier: 'restart', volumeFactor: 0, guidance: 'Rebuild the plan.' },
      adjustments: [],
      headline: 'Long time away — the plan should be rebuilt from where you are.',
    })
    render(<MondayReviewSheet review={r} onApply={vi.fn()} onDismiss={vi.fn()} onRebuild={onRebuild} />)
    fireEvent.click(screen.getByText('Rebuild my plan from here'))
    expect(onRebuild).toHaveBeenCalled()
  })
})

describe('useMondayReview cadence (pure decisions)', () => {
  const at = (iso: string, h: number) => {
    const d = new Date(`${iso}T00:00:00`)
    d.setHours(h, 0, 0, 0)
    return d
  }

  // 2026-09-14 is a Monday.
  it('opens Monday from 6am and stays alive 48h', () => {
    expect(reviewWeekKey(at('2026-09-14', 5))).toBeNull()
    expect(reviewWeekKey(at('2026-09-14', 6))).toBe('2026-09-14')
    expect(reviewWeekKey(at('2026-09-15', 22))).toBe('2026-09-14')  // Tuesday night
    expect(reviewWeekKey(at('2026-09-16', 7))).toBeNull()           // Wednesday
    expect(reviewWeekKey(at('2026-09-13', 12))).toBeNull()          // Sunday
  })

  it('shows fresh, honors dismissal, and never re-raises that week', () => {
    expect(shouldShowReview(null, at('2026-09-14', 8), null).show).toBe(true)
    const dismissed = { weekKey: '2026-09-14', shownAt: at('2026-09-14', 8).getTime(), dismissed: true }
    expect(shouldShowReview(dismissed, at('2026-09-14', 20), null).show).toBe(false)
    expect(shouldShowReview(dismissed, at('2026-09-15', 9), null).show).toBe(false)
  })

  it('an unacknowledged gap overrides the cadence any day of the week', () => {
    const d = shouldShowReview(null, at('2026-09-17', 9), '2026-08-28') // Thursday
    expect(d.show).toBe(true)
    expect(d.gapTriggered).toBe(true)
    // Acknowledged THIS gap → quiet; a NEW gap re-triggers.
    const acked = { weekKey: '2026-09-14', shownAt: 0, dismissed: true, gapAckIso: '2026-08-28' }
    expect(shouldShowReview(acked, at('2026-09-17', 9), '2026-08-28').show).toBe(false)
    expect(shouldShowReview(acked, at('2026-11-05', 9), '2026-10-10').show).toBe(true)
  })
})
