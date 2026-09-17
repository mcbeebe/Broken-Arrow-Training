import type { CoachAction, PlannedDay, ProposedBenchmark } from '../types'
import { summarizeOp } from '../utils/chatProposal'
import { BENCHMARK_KINDS } from '../engines/benchmark/log'
import { formatBenchmarkValue, type BenchmarkPreview } from '../engines/benchmark/preview'

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
  /** "What this changes" for a proposed benchmark, computed by the real
   *  engines (previewBenchmark) — the same box the Add-benchmark sheet
   *  shows, so what the athlete confirms in chat is what the plan does. */
  previewBenchmark?: (b: ProposedBenchmark) => BenchmarkPreview | null
}

function benchmarkName(b: ProposedBenchmark): string {
  return b.kind === 'other' && b.label ? b.label : BENCHMARK_KINDS[b.kind].label
}

/** The card for a benchmark the coach heard in chat. Every line the
 *  athlete is confirming is on it: the kind, the value as parsed, the date
 *  it was measured, the protocol — and what saving it changes. */
function BenchmarkProposalCard({
  action, status, overrideId, onApprove, onReject, onUndo, onAsk, previewBenchmark,
}: Props) {
  const entries = action.proposedBenchmarks?.entries ?? []
  if (entries.length === 0) return null
  const applied = status === 'applied'
  const previews = entries.map(b => previewBenchmark?.(b) ?? null)
  const changesPlan = previews.some(p => p?.changesPlan)
  const many = entries.length > 1

  if (status === 'rejected') {
    return (
      <div className="mt-2 w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
        <span className="text-xs text-slate-500 dark:text-slate-400">Not recorded — {entries.map(b => `${benchmarkName(b)} ${formatBenchmarkValue(b)}`).join(', ')}</span>
      </div>
    )
  }

  return (
    <div
      className={`mt-2 w-full rounded-xl overflow-hidden border-2 ${
        applied ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-700' : 'bg-white dark:bg-slate-800 border-teal-300 dark:border-teal-700'
      }`}
      onClick={e => e.stopPropagation()}
      data-testid="benchmark-proposal"
    >
      <div className={`px-3 py-2 border-b ${applied ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-100/60 dark:bg-emerald-900/40' : 'border-teal-100 dark:border-slate-700 bg-teal-50 dark:bg-teal-950'}`}>
        <p className={`text-xs font-bold ${applied ? 'text-emerald-700 dark:text-emerald-300' : 'text-teal-800 dark:text-teal-300'}`}>
          {applied
            ? `✓ Recorded — ${changesPlan ? 'the plan is using it' : 'saved for the coach'}`
            : `📏 Benchmark${many ? 's' : ''} to record`}
        </p>
      </div>

      <div className="px-3 py-2 space-y-2">
        {entries.map((b, i) => {
          const p = previews[i]
          return (
            <div key={i} data-testid="benchmark-proposal-entry">
              <p className="text-sm text-slate-800 dark:text-slate-100">
                <span className="font-semibold">{benchmarkName(b)}</span>{' '}
                <span className="font-mono font-semibold">{formatBenchmarkValue(b)}</span>
                <span className="text-slate-500 dark:text-slate-400"> · {b.dateIso}{b.protocol ? ` · ${b.protocol}` : ''}</span>
              </p>
              {b.rationale && <p className="text-[11px] italic text-slate-500 dark:text-slate-400">{b.rationale}</p>}
              {p && (
                <div className={`mt-1 rounded-lg px-2.5 py-1.5 ${p.caution ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-slate-50 dark:bg-slate-700/50'}`} data-testid="benchmark-proposal-preview">
                  <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{p.changesPlan ? 'What this changes' : 'What this does'}</p>
                  {p.lines.map((l, j) => (
                    <p key={j} className={`text-[11px] mt-0.5 ${p.caution ? 'text-amber-800 dark:text-amber-200' : 'text-slate-600 dark:text-slate-300'}`}>{l}</p>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {action.proposedBenchmarks?.rationale && (
          <div className="text-[11px] italic text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-700">
            "{action.proposedBenchmarks.rationale}"
          </div>
        )}
        {!applied && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Saving applies it right away; undo stays on this card.</p>
        )}
      </div>

      {applied ? (
        <div className="px-2 pb-2">
          {overrideId && onUndo ? (
            <button onClick={() => onUndo(overrideId)} className="w-full text-xs font-semibold py-2 rounded-lg bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-200 dark:hover:bg-emerald-800 transition-colors border border-emerald-300 dark:border-emerald-700">
              ↩ Undo — remove from your benchmarks
            </button>
          ) : (
            <p className="text-center text-[11px] text-emerald-700 dark:text-emerald-300 py-1">Saved to your benchmarks</p>
          )}
        </div>
      ) : (
        <div className="flex gap-1 px-2 pb-2">
          <button onClick={() => onApprove?.(action)} className="flex-1 text-xs font-semibold py-2 rounded-lg bg-teal-700 text-white hover:bg-teal-800 transition-colors">
            ✓ {many ? 'Save benchmarks' : 'Save benchmark'}
          </button>
          {onAsk && (
            <button
              onClick={() => onAsk(`That benchmark isn't quite right. Here's the correction: `)}
              className="flex-1 text-xs font-medium py-2 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors border border-amber-200 dark:border-amber-900"
            >
              ✎ Fix a detail
            </button>
          )}
          <button onClick={() => onReject?.()} className="flex-1 text-xs font-medium py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
            Don't record
          </button>
        </div>
      )}
    </div>
  )
}

export default function ProposalCard(props: Props) {
  const { action } = props
  if (action.type === 'propose_benchmark') return <BenchmarkProposalCard {...props} />
  if (action.type !== 'propose_edit' || !action.proposedEdit) return null
  return <EditProposalCard {...props} />
}

function EditProposalCard({
  action, status, overrideId, getPlannedDay, onApprove, onReject, onUndo, onAsk, previewBenchmark,
}: Props) {
  const pe = action.proposedEdit!
  const ops = pe.ops ?? []
  if (ops.length === 0) return null
  // Plan ops with benchmarks riding along: the benchmarks get their own
  // lines (and preview) under the ops list, and Apply saves both.
  const riders = action.proposedBenchmarks?.entries ?? []

  // Single updateDay → keep the rich before→after card. Anything else
  // (multiple ops, or a structural add/delete/week op) → summary list.
  const single = ops.length === 1 && ops[0].op.kind === 'updateDay' ? ops[0].op : null
  const su = single ? { weekNum: single.weekNum, dayIndex: single.dayIndex, updates: single.updates } : null
  const original = su ? (getPlannedDay?.(su.weekNum, su.dayIndex) ?? null) : null
  const headerLabel = su
    ? (original?.day || `Wk ${su.weekNum} ${DAY_LABELS[su.dayIndex] ?? ''}`.trim())
    : `${ops.length} changes`

  const applied = status === 'applied'

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
      className={`mt-2 w-full rounded-xl overflow-hidden border-2 ${
        applied
          ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-700'
          : 'bg-white dark:bg-slate-800 border-indigo-300 dark:border-indigo-700'
      }`}
      onClick={e => e.stopPropagation()}
    >
      <div className={`px-3 py-2 border-b ${
        applied
          ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-100/60 dark:bg-emerald-900/40'
          : 'border-indigo-100 dark:border-slate-700 bg-indigo-50 dark:bg-indigo-950'
      }`}>
        <p className={`text-xs font-bold ${applied ? 'text-emerald-700 dark:text-emerald-300' : 'text-indigo-700 dark:text-indigo-300'}`}>
          {applied
            ? `✓ Applied${su ? ` to ${headerLabel}` : ` · ${ops.length} changes`} — your plan is updated`
            : `📋 ${su ? `Proposed change for ${headerLabel}` : `Proposed plan update · ${ops.length} changes`}`}
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

        {riders.length > 0 && (
          <ul className="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-700" data-testid="benchmark-riders">
            {riders.map((b, i) => {
              const p = previewBenchmark?.(b) ?? null
              return (
                <li key={i} className="text-[11px] text-slate-700 dark:text-slate-200 leading-snug">
                  📏 Record {benchmarkName(b)} <span className="font-mono font-semibold">{formatBenchmarkValue(b)}</span> · {b.dateIso}
                  {p && p.lines[0] && <span className="text-slate-500 dark:text-slate-400"> — {p.lines[0]}</span>}
                </li>
              )
            })}
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

      {applied ? (
        <div className="px-2 pb-2">
          {overrideId && onUndo ? (
            <button
              onClick={() => onUndo(overrideId)}
              className="w-full text-xs font-semibold py-2 rounded-lg bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-200 dark:hover:bg-emerald-800 transition-colors border border-emerald-300 dark:border-emerald-700"
            >
              ↩ Undo this change
            </button>
          ) : (
            <p className="text-center text-[11px] text-emerald-700 dark:text-emerald-300 py-1">Applied to your plan</p>
          )}
        </div>
      ) : (
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
      )}
    </div>
  )
}
