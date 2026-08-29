/**
 * P4 — an open day gets asked about, on the page the athlete actually opens.
 *
 * A planned session nobody logged used to be invisible on Today: the page
 * moved on and the weekly narrative counted it as rest. The strip asks
 * once, in the athlete's words, and never accuses.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ResolveStrip from '../components/ResolveStrip'
import { plannedDayFor } from '../utils/rhythm'
import type { RhythmDay } from '../utils/rhythm'
import type { TrainingWeek, PlannedDay, WorkoutType } from '../types'

afterEach(cleanup)

const open = (): RhythmDay => ({
  iso: '2026-08-27', state: 'open', label: 'Thu', workout: 'Station intervals',
})

describe('the strip', () => {
  it('names the day and what was planned, using "open"', () => {
    render(<ResolveStrip day={open()} onResolve={vi.fn()} />)
    const text = screen.getByTestId('resolve-strip').textContent ?? ''
    expect(text).toContain('Thu')
    expect(text).toContain('Station intervals')
    expect(text).toContain('is still open')
  })

  it('never says "missed" and is never red', () => {
    const { container } = render(<ResolveStrip day={open()} onResolve={vi.fn()} />)
    expect((container.textContent ?? '').toLowerCase()).not.toContain('missed')
    expect(container.innerHTML).not.toMatch(/red-|rose-|amber-/)
  })

  it('hands back the day it asked about', () => {
    const onResolve = vi.fn()
    render(<ResolveStrip day={open()} onResolve={onResolve} />)
    fireEvent.click(screen.getByTestId('resolve-strip'))
    expect(onResolve).toHaveBeenCalledWith(open())
  })

  it('renders nothing when there is nothing open', () => {
    const { container } = render(<ResolveStrip day={null} onResolve={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('falls back gracefully when the plan named no workout', () => {
    render(<ResolveStrip day={{ ...open(), workout: undefined }} onResolve={vi.fn()} />)
    expect(screen.getByTestId('resolve-strip').textContent).toContain("Thu\u2019s session is still open")
  })
})

describe('finding the day the strip refers to', () => {
  const day = (type: WorkoutType, workout: string): PlannedDay => ({
    day: 'D', type, workout, detail: '', zone: 'Z2', route: '', time: '40 min',
  })
  const weeks = (): TrainingWeek[] => ([{
    num: 1, dates: '', miles: 20, focus: '', startIso: '2026-08-24',
    days: [
      day('run', 'Easy run'), day('quality', 'Repeats'), day('rest', 'Rest'),
      day('quality', 'Station intervals'), day('run', 'Easy run'),
      day('long', 'Long run'), day('rest', 'Rest'),
    ],
  }])

  it('matches by date, not by workout name', () => {
    // Two days share the title "Easy run"; only the date tells them apart.
    expect(plannedDayFor(weeks(), '2026-08-24')?.workout).toBe('Easy run')
    expect(plannedDayFor(weeks(), '2026-08-28')?.workout).toBe('Easy run')
    expect(plannedDayFor(weeks(), '2026-08-27')?.workout).toBe('Station intervals')
  })

  it('returns null for a date the plan does not cover', () => {
    expect(plannedDayFor(weeks(), '2026-09-30')).toBeNull()
    expect(plannedDayFor(undefined, '2026-08-24')).toBeNull()
  })
})
