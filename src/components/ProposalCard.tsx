import type { CoachAction, PlannedDay, ProposedBenchmark, ProposedReshape } from '../types'
import { summarizeOp } from '../utils/chatProposal'
import { BENCHMARK_KINDS } from '../engines/benchmark/log'
import { formatBenchmarkValue, type BenchmarkPreview } from '../engines/benchmark/preview'
import {
  WEEKDAYS, WEEKDAY_SHORT, WEEKDAY_LONG, roleLabel, roleShort, changedWeekdays, validateWeekShape, shapeHasErrors,
  defaultReshapeFromWeek, type WeekShape,
} from '../engines/planGenerator/weekShape'

/** What the reshape card needs from the app to say what changes: the
 *  layout in force, the plan's week numbers, and whether this week has
 *  started (the default start week follows from it). */
export interface ShapeContext {
  current: WeekShape
  currentWeekNum: number
  lastWeekNum: number
  weekStarted: boolean
  plan: 'road' | 'trail' | 'hyrox' | 'general'
  methodRunDays?: { min: number; max: number; name?: string }
}


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
  /** For a proposed week layout: the layout in force and the plan's weeks. */
  shapeContext?: ShapeContext | null
  /** Open the Plan tab's sheet on this proposal so the athlete can adjust it. */
  onAdjustReshape?: (r: ProposedReshape) => void
}

const ROLE_TILE: Record<string, string> = {
  long: 'bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100',
  quality: 'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100',
  run: 'bg-teal-100 text-teal-900 dark:bg-teal-900/50 dark:text-teal-100',
  strength: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100',
  cross: 'bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100',
  rest: 'bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300',
}

/** The card for a week layout the coach proposes. Everything the athlete
 *  is confirming is on it: the seven days (changed ones marked), each
 *  change as from → to, the week it starts, and which way it applies —
 *  the same facts the Plan tab's sheet shows, because it IS that change.
 *  "Adjust" opens the sheet on this proposal. */
function ReshapeProposalCard({ action, status, overrideId, onApprove, onReject, onUndo, onAsk, shapeContext, onAdjustReshape }: Props) {
  const r = action.proposedReshape
  if (!r) return null
  const plan = shapeContext?.plan ?? 'road'
  const current = shapeContext?.current ?? null
  const changed = current ? changedWeekdays(current, r.shape) : WEEKDAYS
  const fromWeek = r.fromWeek ?? (shapeContext ? defaultReshapeFromWeek(shapeContext) : undefined)
  const mode = r.mode ?? 'in_place'
  const issues = validateWeekShape(r.shape, { plan, methodRunDays: shapeContext?.methodRunDays })
  const blocked = shapeHasErrors(issues)
  const noChange = current != null && changed.length === 0
  const applied = status === 'applied'
  const span = fromWeek == null ? 'the remaining weeks'
    : shapeContext && fromWeek < shapeContext.lastWeekNum ? `weeks ${fromWeek}–${shapeContext.lastWeekNum}` : `week ${fromWeek}`

  if (status === 'rejected') {
    return (
      <div className="mt-2 w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
        <span className="text-xs text-slate-500 dark:text-slate-400">Kept your week as it is</span>
      </div>
    )
  }

  return (
    <div
      className={`mt-2 w-full rounded-xl overflow-hidden border-2 ${applied ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-700' : 'bg-white dark:bg-slate-800 border-teal-300 dark:border-teal-700'}`}
      onClick={e => e.stopPropagation()} data-testid="reshape-proposal"
    >
      <div className={`px-3 py-2 border-b ${applied ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-100/60 dark:bg-emerald-900/40' : 'border-teal-100 dark:border-slate-700 bg-teal-50 dark:bg-teal-950'}`}>
        <p className={`text-xs font-bold ${applied ? 'text-emerald-700 dark:text-emerald-300' : 'text-teal-800 dark:text-teal-300'}`}>
          {applied ? `✓ Week reshaped — ${span}${mode === 'in_place' ? ', your edits kept' : ', rebuilt fresh'}` : '🗓️ Proposed week layout'}
        </p>
      </div>

      <div className="px-3 py-2 space-y-2">
        <div className="grid grid-cols-7 gap-1" aria-label="Proposed week">
          {WEEKDAYS.map(wd => (
            <div key={wd} className={`rounded-lg px-0.5 py-1.5 text-center ${ROLE_TILE[r.shape[wd]]} ${changed.includes(wd) && current ? 'ring-2 ring-slate-400 dark:ring-slate-500' : ''}`} data-testid={`reshape-day-${wd}`}>
              <span className="block text-[10px] font-semibold uppercase opacity-70">{WEEKDAY_SHORT[wd]}</span>
              <span className="block text-[11px] font-bold leading-tight">{roleShort(r.shape[wd], plan)}</span>
            </div>
          ))}
        </div>

        <div data-testid="reshape-changes">
          <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">What changes</p>
          {noChange ? (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Nothing — this is your current layout.</p>
          ) : current ? (
            <ul className="space-y-0.5">
              {changed.map(wd => (
                <li key={wd} className="text-[11px] text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">{WEEKDAY_LONG[wd]}:</span> {roleLabel(current[wd], plan)} → <span className="font-semibold">{roleLabel(r.shape[wd], plan)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-slate-600 dark:text-slate-300">{WEEKDAYS.map(wd => `${WEEKDAY_SHORT[wd]} ${roleLabel(r.shape[wd], plan).toLowerCase()}`).join(' · ')}</p>
          )}
          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
            Applies to {span}{fromWeek != null && fromWeek > 1 ? `; weeks before ${fromWeek} stay as they were` : ''}.{' '}
            {mode === 'in_place' ? 'Your hand-edited days stay exactly as you edited them.' : 'The remaining weeks are regenerated; hand-edited days and swaps are dropped, and today\'s plan is backed up under Settings → Restore.'}
          </p>
        </div>

        {issues.length > 0 && (
          <ul className="space-y-1" data-testid="reshape-issues">
            {issues.map(i => (
              <li key={i.code} className={`text-[11px] rounded-lg px-2.5 py-1.5 ${i.severity === 'error' ? 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'}`} data-severity={i.severity}>
                {i.severity === 'error' ? '⛔ ' : '⚠️ '}{i.message}
              </li>
            ))}
          </ul>
        )}

        {r.rationale && (
          <div className="text-[11px] italic text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-700">"{r.rationale}"</div>
        )}
      </div>

      {applied ? (
        <div className="px-2 pb-2">
          {overrideId && onUndo && mode === 'in_place' ? (
            <button onClick={() => onUndo(overrideId)} className="w-full text-xs font-semibold py-2 rounded-lg bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-200 dark:hover:bg-emerald-800 transition-colors border border-emerald-300 dark:border-emerald-700">
              ↩ Undo — put the week back
            </button>
          ) : (
            <p className="text-center text-[11px] text-emerald-700 dark:text-emerald-300 py-1">Applied — the previous plan is under Settings → Restore</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1 px-2 pb-2">
          <button
            onClick={() => onApprove?.(action)} disabled={blocked || noChange}
            className="w-full text-xs font-semibold py-2 rounded-lg bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50 transition-colors"
            data-testid="reshape-apply"
          >
            {blocked ? 'Fix the layout to apply' : noChange ? 'Nothing to apply' : mode === 'in_place' ? `✓ Rewrite ${span}, keep my edits` : `✓ Rebuild ${span} fresh`}
          </button>
          <div className="flex gap-1">
            {onAdjustReshape && (
              <button onClick={() => onAdjustReshape(r)} className="flex-1 text-xs font-medium py-2 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors border border-amber-200 dark:border-amber-900" data-testid="reshape-adjust">
                ✎ Adjust in the sheet
              </button>
            )}
            {onAsk && !onAdjustReshape && (
              <button onClick={() => onAsk(`I'd like a different layout. Here's what I want changed: `)} className="flex-1 text-xs font-medium py-2 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900">✎ Adjust</button>
            )}
            <button onClick={() => onReject?.()} className="flex-1 text-xs font-medium py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
              Keep my week
            </button>
          </div>
        </div>
      )}
    </div>
  )
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
  if (action.type === 'propose_reshape') return <ReshapeProposalCard {...props} />
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
