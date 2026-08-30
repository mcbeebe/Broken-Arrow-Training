import type { PlannedDay } from '../types'

/**
 * The ticket grammar (P12) — one small state vocabulary shared with the
 * Today tab's Rhythm strip, so a day reads the same on both pages.
 *
 * Doctrine carried over from Today: nothing is ever painted as failure.
 * There is no red and no "missed" — a today-or-past day still owed is
 * simply `open`; a rest or travel day kept is `resolved`, not a gap.
 * A future planned day has no chip (it's just upcoming, nothing to
 * resolve yet — the Rhythm strip's `future` state).
 *
 * Precedence: a logged day is resolved whatever else it is; then a travel
 * day is away; a kept rest resolves once it's past; a replanned day is
 * adjusted; today is today; a past unlogged day is open.
 */
export type TicketStateKey = 'resolved' | 'open' | 'today' | 'adjusted' | 'away'

export interface TicketState {
  key: TicketStateKey
  label: string
  /** Leading glyph for the chip ('' for Today, which needs none). */
  glyph: string
  /** Tailwind classes for the chip, light + dark. Never red. */
  chipClass: string
}

const RESOLVED: TicketState = {
  key: 'resolved', label: 'Resolved', glyph: '✓',
  chipClass: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200',
}
const AWAY: TicketState = {
  key: 'away', label: 'Away', glyph: '✈',
  chipClass: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
}
const ADJUSTED: TicketState = {
  key: 'adjusted', label: 'Adjusted', glyph: '↻',
  chipClass: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200',
}
const TODAY: TicketState = {
  key: 'today', label: 'Today', glyph: '',
  chipClass: 'bg-white text-teal-700 border border-teal-300 dark:bg-slate-800 dark:text-teal-300 dark:border-teal-700',
}
const OPEN: TicketState = {
  key: 'open', label: 'Open', glyph: '◯',
  chipClass: 'bg-white text-slate-600 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600',
}

export function dayTicketState(
  day: PlannedDay,
  opts: { isToday?: boolean; isPast?: boolean; hasReplan?: boolean } = {},
): TicketState | null {
  const { isToday, isPast, hasReplan } = opts
  if (day.actual) return RESOLVED
  if (day.type === 'travel') return AWAY
  if (day.type === 'rest') return isPast ? RESOLVED : null
  if (hasReplan) return ADJUSTED
  if (isToday) return TODAY
  if (isPast) return OPEN
  return null
}
