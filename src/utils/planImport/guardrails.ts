/**
 * What may change on an athlete's own uploaded plan (initiative 004, D1).
 *
 * An uploaded plan is followed as written. The coach may suggest edits to
 * single days, and the athlete approves each one. Anything that reshapes the
 * plan is refused here: a new week layout (in place or rebuilt), and adding,
 * removing or rewriting a whole week.
 *
 * The app's own engines are switched off at their source instead (App.tsx):
 * pace recalibration, the benchmark re-anchor, the Monday review's
 * adjustments, the morning autopilot, Level Up, weak-station reweighting,
 * realignment, rebuild and the season.
 */

import type { ShapeContext } from '../../components/ProposalCard'
import type { CoachAction, PlanEditOp } from '../../types'

/** Op kinds that act on whole weeks. Day edits (`updateDay`, `addDay`,
 *  `deleteDay`) stay allowed. */
const WEEK_OPS: ReadonlySet<PlanEditOp['kind']> = new Set(['addWeek', 'deleteWeek', 'updateWeek'])

/** What the athlete reads when a proposal can't apply to their own plan. */
export const UPLOADED_PLAN_REFUSAL =
  'Your own plan is followed as written, so its weeks stay as they are. Ask about a single day instead.'

/** The note the coach reads after refusing, so it stops proposing it. */
export const UPLOADED_PLAN_HANDOFF =
  "[CHANGE NOT APPLIED] The athlete follows their own uploaded plan as written. Week layouts, rebuilds and adding, removing or rewriting whole weeks are off. Suggest edits to single days only, and don't propose this again."

/**
 * True when `action` would reshape an uploaded plan rather than edit a day:
 * a proposed week layout, or any whole-week op. Pure; the caller decides it
 * applies only when the plan is an uploaded one.
 */
export function refusedOnUploadedPlan(action: CoachAction): boolean {
  if (action.type === 'propose_reshape') return true
  return (action.proposedEdit?.ops ?? []).some(o => WEEK_OPS.has(o.op.kind))
}

/** The reshape card's context on an uploaded plan: only the lock matters,
 *  so no generated layout is computed. Week numbers are filled in by the
 *  caller. */
export const UPLOADED_PLAN_SHAPE_CONTEXT: ShapeContext = {
  current: { 1: 'rest', 2: 'rest', 3: 'rest', 4: 'rest', 5: 'rest', 6: 'rest', 7: 'rest' },
  currentWeekNum: 1,
  lastWeekNum: 1,
  weekStarted: false,
  plan: 'road',
  uploadedPlan: true,
}
