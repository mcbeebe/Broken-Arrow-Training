/**
 * The rhythm strip — consistency made visible, without shame.
 *
 * The unit of success is a RESOLVED day, not a completed one. A day you
 * trained is resolved. So is a day the plan called rest. A day the plan
 * asked for a session and nothing was logged is OPEN — not "missed",
 * which is a word this product does not use about a person.
 *
 * Open days are the only ones that ask for anything, and they ask once,
 * in neutral grey. Nothing here is ever red.
 */
import type { TrainingWeek } from '../types'

export type RhythmState = 'done' | 'rest' | 'open' | 'today' | 'future'

export interface RhythmDay {
  iso: string
  state: RhythmState
  /** Short day label for a11y and tooltips, e.g. 'Thu'. */
  label: string
  /** What the plan asked for, when it asked for something. */
  workout?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

function isoOf(startIso: string, offset: number): string {
  const d = new Date(`${startIso}T12:00:00`)
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

function labelOf(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
}

/**
 * The last `days` calendar days ending today, oldest first. Days the plan
 * does not cover at all are omitted rather than guessed at.
 */
export function buildRhythm(
  weeks: TrainingWeek[] | undefined,
  todayIso: string,
  days = 12,
): RhythmDay[] {
  if (!weeks?.length) return []

  // Flatten the plan into a date-keyed lookup. Weeks without startIso carry
  // no year signal, so they are skipped rather than mis-dated.
  const planned = new Map<string, TrainingWeek['days'][number]>()
  for (const week of weeks) {
    if (!week.startIso) continue
    week.days.forEach((day, i) => planned.set(isoOf(week.startIso!, i), day))
  }
  if (planned.size === 0) return []

  const out: RhythmDay[] = []
  const todayMs = new Date(`${todayIso}T12:00:00`).getTime()

  for (let back = days - 1; back >= 0; back--) {
    const iso = new Date(todayMs - back * DAY_MS).toISOString().slice(0, 10)
    const day = planned.get(iso)
    if (!day) continue

    let state: RhythmState
    if (iso === todayIso) state = 'today'
    else if (iso > todayIso) state = 'future'
    else if (day.actual) state = 'done'
    else if (day.type === 'rest') state = 'rest'
    else state = 'open'

    out.push({ iso, state, label: labelOf(iso), workout: day.workout })
  }
  return out
}

/** Resolved = done OR rested as planned. Both are the athlete keeping their
 *  side of the bargain; only an open day is outstanding. */
export function resolvedCount(rhythm: RhythmDay[]): { resolved: number; of: number } {
  const past = rhythm.filter(d => d.state !== 'future' && d.state !== 'today')
  return {
    resolved: past.filter(d => d.state === 'done' || d.state === 'rest').length,
    of: past.length,
  }
}

/** The most recent open day, if there is one — what the resolve strip asks
 *  about. Returns the newest, because that is the one still fresh enough to
 *  remember. */
export function newestOpenDay(rhythm: RhythmDay[]): RhythmDay | null {
  for (let i = rhythm.length - 1; i >= 0; i--) {
    if (rhythm[i].state === 'open') return rhythm[i]
  }
  return null
}
