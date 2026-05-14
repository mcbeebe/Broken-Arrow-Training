import type { CoachAction, PlannedDay } from '../types'

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
  const original = getPlannedDay?.(pe.weekNum, pe.dayIndex) ?? null
  const dayLabel = original?.day || `Wk ${pe.weekNum} ${DAY_LABELS[pe.dayIndex]}`

  if (status === 'applied') {
    return (
      <div
        className="mt-2 w-full flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900"
        onClick={e => e.stopPropagation()}
      >
        <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
          ✓ Applied to {dayLabel}
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
          Kept original for {dayLabel}
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
          📋 Proposed change for {dayLabel}
        </p>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        {original && (
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-semibold">Current:</span> {original.workout}
          </div>
        )}
        <div className="text-xs text-slate-700 dark:text-slate-200">
          <span className="font-semibold text-indigo-700 dark:text-indigo-300">New:</span>{' '}
          {pe.updates.workout || action.detail}
        </div>
        {pe.updates.detail && (
          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            {pe.updates.detail}
          </div>
        )}
        {pe.updates.zone && (
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Zone: {pe.updates.zone}{pe.updates.time ? ` · ${pe.updates.time}` : ''}
          </div>
        )}
        {pe.rationale && (
          <div className="text-[11px] italic text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-700">
            "{pe.rationale}"
          </div>
        )}
        {onAsk && (() => {
          const newLabel = pe.updates.workout || action.detail || 'the proposed change'
          const fromLabel = original?.workout || 'current'
          const seed = `Why this swap for ${dayLabel}? Walk me through the mechanism, why it's right for me today, and cite a source. (Swap: ${fromLabel} → ${newLabel}${pe.rationale ? ` · stated rationale: ${pe.rationale}` : ''})`
          return (
            <button
              onClick={() => onAsk(seed)}
              className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-indigo-100 pt-1"
            >
              🧠 Why this swap? →
            </button>
          )
        })()}
      </div>
      <div className="flex gap-1 px-2 pb-2">
        <button
          onClick={() => onApprove?.(action)}
          className="flex-1 text-xs font-semibold py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          ✓ Apply
        </button>
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
