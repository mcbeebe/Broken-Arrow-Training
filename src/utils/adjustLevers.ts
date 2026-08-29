/**
 * The Adjust tray — the athlete's side of the conversation.
 *
 * The engine could already move a session; the athlete could not, short of
 * editing the plan by hand. Every persona with a job hit the same wall: a
 * 50-minute tempo on a day with 30 minutes in it, and nothing between
 * "do it all" and "skip it". The audit rated the missing time lever a 4.
 *
 * Each lever states what it will do BEFORE it does it, applies as one
 * undoable batch, and ends in a sentence describing what actually
 * happened. Preview and outcome are built from the same value, so the two
 * can never disagree — the failure that made "move it later" untrustworthy.
 */
import type { PlannedDay, PlanEditOpInput, DayUpdates } from '../types'

export type LeverId = 'fit30' | 'easy'

export interface Lever {
  id: LeverId
  title: string
  /** Shown under the title, before the athlete commits. */
  preview: string
  /** Stated after it is applied, alongside an Undo. */
  outcome: string
  updates: DayUpdates
}

/** Minutes in a session, from the plan's own "50 min" style time string. */
export function minutesOf(day: PlannedDay | null | undefined): number | null {
  if (!day?.time) return null
  const m = /(\d+)\s*min/i.exec(day.time)
  if (m) return Number(m[1])
  const h = /(\d+(?:\.\d+)?)\s*h/i.exec(day.time)
  return h ? Math.round(Number(h[1]) * 60) : null
}

const TRIM_TO = 30

/**
 * The levers that apply to a given day. A lever that cannot honestly do
 * anything is not offered: trimming a 25-minute run to 30 minutes would
 * make it longer, and easing a rest day is meaningless.
 */
export function leversFor(day: PlannedDay | null | undefined): Lever[] {
  if (!day || day.type === 'rest' || day.type === 'race') return []
  const mins = minutesOf(day)
  const out: Lever[] = []

  if (mins != null && mins > TRIM_TO + 5) {
    out.push({
      id: 'fit30',
      title: 'Fit it into 30 minutes',
      preview: `Keeps the hard part, drops the padding — ${mins} min becomes ${TRIM_TO}.`,
      outcome: `Trimmed to ${TRIM_TO} min — the intervals are intact, the warm-up and cool-down are shorter.`,
      updates: {
        time: `${TRIM_TO} min`,
        detail: `${day.detail ? `${day.detail} · ` : ''}Trimmed to ${TRIM_TO} min — intervals kept, warm-up and cool-down shortened.`,
      },
    })
  }

  if (day.type !== 'run') {
    out.push({
      id: 'easy',
      title: 'Make today easy',
      preview: 'Swaps the session for an easy run of the same length. The hard work is not made up later.',
      outcome: 'Made easy — an easy run instead. Nothing is owed back; the plan bends forward.',
      updates: {
        type: 'run',
        workout: 'Easy run',
        zone: 'Z2',
        detail: `Eased by you${mins != null ? ` · ${mins} min conversational` : ''}. The original session is not rescheduled — the plan bends forward, never back.`,
      },
    })
  }

  return out
}

/** One lever, as an undoable batch carrying its own rationale. */
export function opsForLever(
  lever: Lever,
  weekNum: number,
  dayIndex: number,
): PlanEditOpInput[] {
  return [{
    op: { kind: 'updateDay', weekNum, dayIndex, updates: lever.updates },
    rationale: lever.outcome,
  }]
}
