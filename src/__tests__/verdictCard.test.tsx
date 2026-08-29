/**
 * P2 — the Verdict card renders on EVERY morning.
 *
 * The page's one hard component gets the page's one hard test: each state
 * asserted explicitly, because a wrong verdict at 6am has no second card
 * behind it to catch the mistake.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import VerdictCard from '../components/VerdictCard'
import type { Verdict } from '../utils/verdict'
import type { OutlookCard } from '../hooks/useMorningOutlook'
import type { PlannedDay } from '../types'

afterEach(cleanup)

const clear = (): Verdict => ({
  tone: 'clear',
  headline: 'All clear — go as planned.',
  sub: 'Your body backed up the plan overnight.',
  score: 82,
  evidence: [
    { label: 'Sleep', value: '7.8h', sub: 'above your 7.2h baseline' },
    { label: 'HRV', value: '64', sub: 'at baseline' },
  ],
  footer: 'Checked against 21 nights of your baselines · nothing was changed.',
})

const tempo = (): PlannedDay => ({
  day: 'Fri', type: 'quality', workout: 'Tempo — 4×5min @ AnT',
  detail: 'Last hard running touch before station week.', zone: 'Z4', route: '', time: '50 min',
})

const acted = (): OutlookCard => ({
  dateIso: '2026-08-29',
  verdict: 'trim',
  headline: 'Rough night — I made today easy.',
  why: 'HRV has sat under your baseline three mornings running.',
  before: 'Tempo — 4×5min @ AnT · 50 min',
  after: 'Easy run · 40 min · Z2',
  evidence: [{ label: 'HRV', value: '48' }],
})

describe('the ordinary morning', () => {
  it('answers the question and shows the session behind it', () => {
    render(<VerdictCard verdict={clear()} today={tempo()} />)
    expect(screen.getByTestId('verdict-headline').textContent).toBe('All clear — go as planned.')
    expect(screen.getByTestId('verdict-ticket').textContent).toContain('Tempo — 4×5min @ AnT')
    expect(screen.getByTestId('verdict-ticket').textContent).toContain('50 min')
  })

  it('shows each number against the athlete\'s own baseline', () => {
    render(<VerdictCard verdict={clear()} today={tempo()} />)
    const ev = screen.getByTestId('verdict-evidence').textContent ?? ''
    expect(ev).toContain('above your 7.2h baseline')
    expect(ev).toContain('at baseline')
  })

  it('offers Locked in and Adjust, not the autopilot buttons', () => {
    render(<VerdictCard verdict={clear()} today={tempo()} />)
    expect(screen.getByTestId('verdict-lock-in')).toBeTruthy()
    expect(screen.getByTestId('verdict-adjust')).toBeTruthy()
    expect(screen.queryByText('Sounds right')).toBeNull()
  })

  it('confirms a commitment once it is made', () => {
    const onLockIn = vi.fn()
    const { rerender } = render(<VerdictCard verdict={clear()} today={tempo()} onLockIn={onLockIn} />)
    fireEvent.click(screen.getByTestId('verdict-lock-in'))
    expect(onLockIn).toHaveBeenCalledOnce()
    rerender(<VerdictCard verdict={clear()} today={tempo()} lockedIn />)
    expect(screen.getByTestId('verdict-lock-in').textContent).toContain('Locked in ✓')
  })

  it('promises nothing was moved', () => {
    render(<VerdictCard verdict={clear()} today={tempo()} />)
    expect(screen.getByTestId('verdict-footer').textContent).toContain('nothing was changed')
  })
})

describe('the morning the autopilot acted', () => {
  it('leads with what it did and why, not with the green verdict', () => {
    render(<VerdictCard verdict={clear()} outlook={acted()} today={tempo()} />)
    expect(screen.getByTestId('verdict-headline').textContent).toBe('Rough night — I made today easy.')
    expect(screen.getByTestId('verdict-card').getAttribute('data-tone')).toBe('acted')
  })

  it('shows the before struck through and the after in full', () => {
    const { container } = render(<VerdictCard verdict={clear()} outlook={acted()} today={tempo()} />)
    const struck = container.querySelector('.line-through')
    expect(struck?.textContent).toContain('Tempo — 4×5min @ AnT')
    expect(container.textContent).toContain('Easy run · 40 min · Z2')
  })

  it('offers the typed revert, worded for what it actually undoes', () => {
    const onRevert = vi.fn()
    render(<VerdictCard verdict={clear()} outlook={acted()} onRevert={onRevert} />)
    const revert = screen.getByTestId('outlook-revert')
    expect(revert.textContent).toBe('Do the full session')
    fireEvent.click(revert)
    expect(onRevert).toHaveBeenCalledOnce()
  })

  it('never shows the ticket and the adjustment at once', () => {
    render(<VerdictCard verdict={clear()} outlook={acted()} today={tempo()} />)
    expect(screen.queryByTestId('verdict-ticket')).toBeNull()
  })
})

describe('the mornings that used to be silent', () => {
  it('counts the nights while it is still learning', () => {
    const arming: Verdict = {
      ...clear(), tone: 'arming', headline: 'Learning your normal.',
      sub: '12 of 21 nights in.', footer: 'Autopilot arms in 9 nights.',
    }
    render(<VerdictCard verdict={arming} today={tempo()} />)
    expect(screen.getByTestId('verdict-card').getAttribute('data-tone')).toBe('arming')
    expect(screen.getByTestId('verdict-footer').textContent).toContain('arms in 9 nights')
  })

  it('shows a dash rather than a fake score with no wearable', () => {
    const none: Verdict = { ...clear(), tone: 'unknown', score: null, headline: 'Go by feel today.' }
    render(<VerdictCard verdict={none} today={tempo()} />)
    expect(screen.getByTestId('verdict-bubble').textContent).toBe('—')
  })
})

describe('the doors out', () => {
  it('opens readiness from the bubble and the session from the ticket', () => {
    const onOpenReadiness = vi.fn()
    const onOpenSession = vi.fn()
    render(
      <VerdictCard verdict={clear()} today={tempo()}
        onOpenReadiness={onOpenReadiness} onOpenSession={onOpenSession} />,
    )
    fireEvent.click(screen.getByTestId('verdict-bubble'))
    fireEvent.click(screen.getByTestId('verdict-ticket'))
    expect(onOpenReadiness).toHaveBeenCalledOnce()
    expect(onOpenSession).toHaveBeenCalledOnce()
  })
})
