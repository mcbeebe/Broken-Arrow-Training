/**
 * The ticket grammar (P12) — the shared day-state vocabulary, and its
 * chip on DayCard. Never red, never "missed".
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { ActualWorkout, PlannedDay } from '../types'
import { dayTicketState } from '../utils/ticketState'
import DayCard from '../components/DayCard'

afterEach(cleanup)

const logged: ActualWorkout = {
  stravaId: 1, source: 'strava', distance: 4, movingTime: 2400, elapsedTime: 2400,
  elevationGain: 0, type: 'Run', name: 'Run', startDate: '2026-09-14T07:00:00',
}
function day(over: Partial<PlannedDay> = {}): PlannedDay {
  return { day: 'Mon 9/7', type: 'run', workout: 'Easy run', detail: '', zone: '4 mi · Z2', route: '', time: '40 min', ...over }
}

describe('dayTicketState precedence', () => {
  it('a logged day is resolved, whatever else it is', () => {
    expect(dayTicketState(day({ actual: logged }), { isPast: true, hasReplan: true })?.key).toBe('resolved')
  })
  it('a travel day is away', () => {
    expect(dayTicketState(day({ type: 'travel' }))?.key).toBe('away')
  })
  it('a rest day resolves once past, and shows no chip while upcoming', () => {
    expect(dayTicketState(day({ type: 'rest' }), { isPast: true })?.key).toBe('resolved')
    expect(dayTicketState(day({ type: 'rest' }), { isPast: false })).toBeNull()
  })
  it('a replanned day is adjusted', () => {
    expect(dayTicketState(day(), { hasReplan: true })?.key).toBe('adjusted')
  })
  it('today (unlogged) is today; a past unlogged day is open; a future day has no chip', () => {
    expect(dayTicketState(day(), { isToday: true })?.key).toBe('today')
    expect(dayTicketState(day(), { isPast: true })?.key).toBe('open')
    expect(dayTicketState(day(), {})).toBeNull()
  })
  it('is never red — no state carries a red token', () => {
    for (const opts of [{ isPast: true }, { isToday: true }, { hasReplan: true }]) {
      const s = dayTicketState(day(), opts)
      expect(s?.chipClass).not.toMatch(/red/)
    }
    expect(dayTicketState(day({ actual: logged }))?.chipClass).not.toMatch(/red/)
  })
})

describe('DayCard renders the ticket chip', () => {
  it('shows Resolved on a logged day', () => {
    render(<DayCard day={day({ actual: logged })} onTap={() => {}} isPast />)
    const chip = screen.getByTestId('day-ticket-state')
    expect(chip.getAttribute('data-state')).toBe('resolved')
    expect(chip.textContent).toContain('Resolved')
  })
  it('shows Open on a past unlogged day', () => {
    render(<DayCard day={day()} onTap={() => {}} isPast />)
    expect(screen.getByTestId('day-ticket-state').getAttribute('data-state')).toBe('open')
  })
  it('shows no chip for a plain upcoming day', () => {
    render(<DayCard day={day()} onTap={() => {}} />)
    expect(screen.queryByTestId('day-ticket-state')).toBeNull()
  })
})
