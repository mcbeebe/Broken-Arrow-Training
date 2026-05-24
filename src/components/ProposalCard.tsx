import type { CoachAction, PlannedDay } from '../types'
import { summarizeOp } from '../utils/chatProposal'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export type ProposalStatus = 'pending' | 'applied' | 'rejected'

interface Props {
  action: CoachAction
  status: ProposalStatus
  overrideId?: string
  getPlannedDay?: (weekNum: number, dayIndex: number) => PlannedDay | null
  onApprove?: (action: CoachAction) => void
  onReject?: () => void
  onUndo?: (overrideId: string) => void
  /** Seed the chat with a follow-up question about this proposal so the
   *  athlete can ask "why this swap?" without losing context. */
  onAsk?: (seed: string) => void
}

export default function ProposalCard({
  action, status, overrideId, getPlannedDay, onApprove, onReject, onUndo, onAsk,
}: Props) {
  if (action.type !== 'propose_edit' || !action.proposedEdit) return null
  const pe = action.proposedEdit
  const ops = pe.ops ?? []
  if (ops.length === 0) return null

  // Single updateDay → keep the rich before→after card. Anything else
  // (multiple ops, or a structural add/delete/week op) → summary list.
  const single = ops.length === 1 && ops[0].op.kind === 'updateDay' ? ops[0].op : null
  const su = single ? { weekNum: single.weekNum, dayIndex: single.dayIndex, updates: single.updates } : null
  const original = su ? (getPlannedDay?.(su.weekNum, su.dayIndex) ?? null) : null
  const headerLabel = su
    ? (original?.day || `Wk ${su.weekNum} ${DAY_LABELS[su.dayIndex] ?? ''}`.trim())
    : `${ops.length} changes`

  if (status === 'applied') {
    return (
      <div
        className="mt-2 w-full flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900"
        onClick={e => e.stopPropagation()}
      >
        <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
          ✓ Applied {su ? `to ${headerLabel}` : `${ops.length} changes`}
        </span>
        {overrideId && onUndo && (
          <button
            onClick={() => onUndo(overrideId)}
            className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 underline"
          >
            Undo
          </button>
        )}
      </div>
    )
  }

  if (status === 'rejected') {
    return (
      <div
        className="mt-2 w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
        onClick={e => e.stopPropagation()}
      >
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {su ? `Kept original for ${headerLabel}` : 'Kept your plan unchanged'}
        </span>
      </div>
    )
  }

  return (
    <div
      className="mt-2 w-full rounded-xl bg-white dark:bg-slate-800 border-2 border-indigo-300 dark:border-indigo-700 overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-indigo-100 dark:border-slate-700 bg-indigo-50 dark:bg-indigo-950">
        <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
          📋 {su ? `Proposed change for ${headerLabel}` : `Proposed plan update · ${ops.length} changes`}
        </p>
      </div>

      <div className="px-3 py-2 space-y-1.5">
        {su ? (
          <>
            {original && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                <span className="font-semibold">Current:</span> {original.workout}
              </div>
            )}
            <div className="text-xs text-slate-700 dark:text-slate-200">
              <span className="font-semibold text-indigo-700 dark:text-indigo-300">New:</span>{' '}
              {su.updates.workout || action.detail}
            </div>
            {su.updates.detail && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                {su.updates.detail}
              </div>
            )}
            {su.updates.zone && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Zone: {su.updates.zone}{su.updates.time ? ` · ${su.updates.time}` : ''}
              </div>
            )}
          </>
        ) : (
          <ul className="space-y-1">
            {ops.map((o, i) => (
              <li key={i} className="text-[11px] text-slate-700 dark:text-slate-200 leading-snug flex gap-1.5">
                <span className="text-indigo-400 dark:text-indigo-500">•</span>
                <span>{summarizeOp(o.op, getPlannedDay)}</span>
              </li>
            ))}
          </ul>
        )}

        {pe.rationale && (
          <div className="text-[11px] italic text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-700">
            "{pe.rationale}"
          </div>
        )}

        {onAsk && (() => {
          const seed = su
            ? `Why this change for ${headerLabel}? Walk me through the mechanism, why it's right for me today, and cite a source.`
            : `Why these ${ops.length} changes? Walk me through your reasoning, how it fits my training philosophy, and cite a source.`
          return (
            <button
              onClick={() => onAsk(seed)}
              className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-indigo-100 pt-1"
            >
              🧠 Why? →
            </button>
          )
        })()}
      </div>

      <div className="flex gap-1 px-2 pb-2">
        <button
          onClick={() => onApprove?.(action)}
          className="flex-1 text-xs font-semibold py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          ✓ {ops.length > 1 ? 'Apply all' : 'Apply'}
        </button>
        {onAsk && (() => {
          const seed = su
            ? `I'd like to modify this change for ${headerLabel}. Here's what I want different: `
            : `I'd like to adjust these proposed changes. Here's what I want different: `
          return (
            <button
              onClick={() => onAsk(seed)}
              className="flex-1 text-xs font-medium py-2 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors border border-amber-200 dark:border-amber-900"
            >
              ✎ Modify
            </button>
          )
        })()}
        <button
          onClick={() => onReject?.()}
          className="flex-1 text-xs font-medium py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
          Keep original
        </button>
      </div>
    </div>
  )
}
