import { useState } from 'react'
import type { WeeklyReview, WeeklyAdjustment } from '../engines/adaptive/weeklyReview'

/**
 * The Monday Review sheet (Adaptive Engine phase 1, PR 3 — mockup A1/A2).
 *
 * One overlay, two shapes:
 *  - the weekly review: evidence strip + adjustment diff cards with
 *    checkboxes, Apply-N, or keep the week as planned;
 *  - the gap variant (resumption tiers): the coach's-pick resumption
 *    card, with "resume as planned" as the explicit opt-out and the
 *    restart tier routing to the full plan rebuild.
 *
 * The sheet never applies anything itself — `onApply` receives the
 * selected adjustments and the caller runs each one's ops through
 * planEdits.applyBatch (one undoable batch per adjustment).
 */
interface Props {
  review: WeeklyReview
  onApply: (selected: WeeklyAdjustment[]) => void
  onDismiss: () => void
  /** The restart tier's full plan rebuild (redo onboarding). */
  onRebuild?: () => void
}

export default function MondayReviewSheet({ review, onApply, onDismiss, onRebuild }: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(review.adjustments.map(a => a.id)),
  )
  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const isGap = review.gap.tier === 'ease75' || review.gap.tier === 'rebuild50'
  const isRestart = review.gap.tier === 'restart'
  const chosen = review.adjustments.filter(a => selected.has(a.id))
  const e = review.execution

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center sm:justify-center" data-testid="monday-review">
      <div className="bg-slate-50 dark:bg-slate-900 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col overflow-hidden">

        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <p className="font-bold text-slate-800 dark:text-white">
              {isGap || isRestart ? 'Welcome back' : `Monday review — Week ${review.reviewedWeekNum}`}
            </p>
            <button onClick={onDismiss} className="text-sm font-medium text-slate-400">Close</button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{review.headline}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
          {/* Evidence strip (weekly shape only) */}
          {!isGap && !isRestart && (
            <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-3 py-2.5 grid grid-cols-3 gap-2">
              <div className="text-center">
                <p className={`font-mono text-lg font-bold ${e.completedSessions >= e.plannedSessions ? 'text-teal-700' : 'text-amber-600'}`}>
                  {e.completedSessions}/{e.plannedSessions}
                </p>
                <p className="text-[10px] text-slate-400">sessions done</p>
              </div>
              <div className="text-center">
                <p className={`font-mono text-lg font-bold ${e.struggledKeys === 0 ? 'text-teal-700' : 'text-amber-600'}`}>
                  {e.keyHit}/{e.keyTotal}
                </p>
                <p className="text-[10px] text-slate-400">key sessions hit</p>
              </div>
              <div className="text-center">
                <p className={`font-mono text-lg font-bold ${e.longRunDriftPct != null && e.longRunDriftPct > 8 ? 'text-amber-600' : 'text-teal-700'}`}>
                  {e.longRunDriftPct != null ? `${e.longRunDriftPct.toFixed(1)}%` : '—'}
                </p>
                <p className="text-[10px] text-slate-400">long-run drift</p>
              </div>
            </div>
          )}

          {/* Gap context card */}
          {(isGap || isRestart) && (
            <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-3.5 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                {review.gap.days} days since your last recorded session
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{review.gap.guidance}</p>
            </div>
          )}

          {/* Adjustment cards */}
          {review.adjustments.map(adj => {
            const on = selected.has(adj.id)
            return (
              <button
                key={adj.id}
                onClick={() => toggle(adj.id)}
                className="w-full text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-3"
                data-testid={`adjustment-${adj.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-bold text-slate-800 dark:text-white">{adj.label}</p>
                  <span className={`w-[22px] h-[22px] rounded-md flex items-center justify-center shrink-0 ${on ? 'bg-teal-600 border-2 border-teal-600' : 'border-2 border-slate-300 bg-white dark:bg-slate-700'}`}>
                    {on && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="font-mono text-xs text-slate-400 line-through">{adj.before}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                  <span className="font-mono text-xs font-bold text-teal-700">{adj.after}</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1.5">{adj.why}</p>
              </button>
            )
          })}

          {review.adjustments.length > 0 && !isRestart && (
            <p className="text-[11px] text-slate-400 px-1 leading-relaxed">
              Everything here is undoable, and your own edits are never touched. Unchecked items stay as planned.
            </p>
          )}
        </div>

        <div className="px-4 pb-7 pt-3 bg-slate-50 dark:bg-slate-900 space-y-2.5">
          {isRestart ? (
            <button
              onClick={onRebuild}
              className="w-full h-[52px] rounded-2xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-[15px]"
            >
              Rebuild my plan from here
            </button>
          ) : chosen.length > 0 ? (
            <button
              onClick={() => onApply(chosen)}
              className="w-full h-[52px] rounded-2xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-[15px]"
            >
              Apply {chosen.length} adjustment{chosen.length === 1 ? '' : 's'}
            </button>
          ) : (
            <button
              onClick={onDismiss}
              className="w-full h-[52px] rounded-2xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-[15px]"
            >
              Sounds good
            </button>
          )}
          {(chosen.length > 0 || isRestart) && (
            <button onClick={onDismiss} className="w-full text-center text-[13px] font-medium text-slate-500">
              {isGap || isRestart ? 'Resume as planned' : 'Keep the week as planned'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
