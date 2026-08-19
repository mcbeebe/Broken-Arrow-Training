/**
 * Phase 5 surface (PRD-110) — the replan op-log.
 *
 * The four rules in replan.ts are pure functions over a plan. This file
 * is how the app REMEMBERS that an athlete invoked one: an ordered log of
 * {kind, dateIso} records replayed over the base weeks on every render,
 * exactly like the swap and plan-edit logs beside it. Nothing about a
 * replan is ever baked into stored plan content — undo is "drop the
 * record", and a regenerated plan simply drops the whole log.
 *
 * Replaying the real rules (rather than persisting their output as day
 * diffs) keeps replan.ts the single source of truth: the mandate
 * re-checks, the never-make-up doctrine, and the "· replanned" tagging
 * all run again on every render, over whatever the weeks currently are.
 */
import type { TrainingPlan, TrainingWeek } from '../../types'
import { replanShortGap, replanMissedKeySession, replanAfterIllness } from './replan'

export type ReplanKind = 'skip' | 'move' | 'illness'

export interface ReplanRecord {
  id: string
  kind: ReplanKind
  /** The day the athlete acted on (YYYY-MM-DD). For 'illness' this is the
   *  day they resume from. */
  dateIso: string
  appliedAt: number
}

/** The rules read and return a whole plan but only ever touch `weeks`.
 *  This is the one place that adapts them to a bare week list. */
function runRule(weeks: TrainingWeek[], rec: ReplanRecord): TrainingWeek[] {
  const plan = { weeks } as TrainingPlan
  switch (rec.kind) {
    case 'skip': return replanShortGap(plan, [rec.dateIso]).weeks
    case 'move': return replanMissedKeySession(plan, rec.dateIso).weeks
    case 'illness': return replanAfterIllness(plan, rec.dateIso).weeks
  }
}

/**
 * Replay the log in application order. A record whose target day no
 * longer exists (a since-regenerated plan, a deleted day) is a no-op —
 * the rules already locate-or-return-unchanged. A record that throws is
 * dropped for this render rather than taking the plan view down.
 */
export function applyReplanLog(weeks: TrainingWeek[], log: ReplanRecord[]): TrainingWeek[] {
  if (log.length === 0) return weeks
  let out = weeks
  for (const rec of [...log].sort((a, b) => a.appliedAt - b.appliedAt)) {
    try {
      out = runRule(out, rec)
    } catch (err) {
      console.error('[replan] rule failed — leaving the plan as it was:', rec.kind, err)
    }
  }
  return out
}

/** Whether a day already carries a replan record (drives the card tint). */
export function hasReplanFor(log: ReplanRecord[], dateIso: string): boolean {
  return log.some(r => r.dateIso === dateIso)
}
