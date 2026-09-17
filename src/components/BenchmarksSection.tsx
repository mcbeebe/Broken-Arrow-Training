import { useState } from 'react'
import {
  BENCHMARK_KINDS, groupBySeries, seriesProgress, isStale, ageWeeks,
  type Benchmark, type BenchmarkKind, type BenchmarkUnit, type PlanKind,
} from '../engines/benchmark/log'
import { formatBenchmarkValue, formatBenchmarkDelta } from '../engines/benchmark/preview'
import BenchmarkHistory from './BenchmarkHistory'

/**
 * Settings → Benchmarks. Every number the plan runs on, with its source,
 * its age and what it feeds — and, behind each, the whole run of entries
 * so the athlete can see where they are going, not only where they are.
 *
 * A row is a SERIES: a preset kind, or one custom benchmark by its label
 * ("Murph" and "dead hang" are two rows, not one "Something else"). The
 * newest entry is current; the change against the previous one sits
 * beside it; "History" opens the trend and every entry. Every row offers
 * "Log a new …" — tracking over time means re-testing on purpose, not
 * only when the plan says a number has gone stale.
 *
 * Removing is a tombstone with a plain warning: the plan goes back to the
 * previous entry of that kind, or to no value, and the row says which.
 */

export interface AddBenchmarkOptions {
  /** For a custom series: open the sheet on that label and unit. */
  label?: string
  unit?: BenchmarkUnit
}

interface Props {
  plan: PlanKind
  live: Benchmark[]
  todayIso: string
  onAdd: (kind?: BenchmarkKind, opts?: AddBenchmarkOptions) => void
  onRemove: (id: string) => void
}

const SOURCE_LABEL: Record<Benchmark['source'], string> = {
  manual: 'entered by you', logged: 'from a logged session', derived: 'from setup',
}

export default function BenchmarksSection({ plan, live, todayIso, onAdd, onRemove }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const series = groupBySeries(live, plan)

  const toggle = (key: string) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        What your plan runs on. The newest of each is in use; every earlier entry stays, so you can see the trend.
      </p>

      {series.length === 0 && (
        <p className="text-xs text-slate-400" data-testid="bm-empty">Nothing measured yet. A recent race time is the single most useful number you can give the plan.</p>
      )}

      <div className="space-y-2">
        {series.map(s => {
          const progress = seriesProgress(s.entries)!
          const cur = progress.latest
          const spec = BENCHMARK_KINDS[s.kind]
          const stale = isStale(cur, todayIso)
          const expanded = open.has(s.key)
          const addOpts: AddBenchmarkOptions | undefined = s.kind === 'other' ? { label: s.label, unit: cur.unit } : undefined
          const rowId = s.kind === 'other' ? `bm-row-other-${s.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : `bm-row-${s.kind}`
          return (
            <div key={s.key} className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2" data-testid={rowId}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {s.label} · {formatBenchmarkValue(cur)}
                    {progress.deltaVsPrevious != null && (
                      <span
                        className={`ml-1.5 font-mono text-xs font-semibold ${
                          progress.verdict === 'better' ? 'text-teal-700 dark:text-teal-300'
                            : progress.verdict === 'worse' ? 'text-amber-700 dark:text-amber-300'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                        data-testid="bm-delta"
                        title={`vs ${formatBenchmarkValue(progress.previous!)} on ${progress.previous!.dateIso}`}
                      >
                        {formatBenchmarkDelta(cur, progress.deltaVsPrevious)}{progress.verdict === 'better' ? ' ▲' : progress.verdict === 'worse' ? ' ▼' : ''}
                      </span>
                    )}
                    {cur.protocol && <span className="font-normal text-slate-500 dark:text-slate-400"> — {cur.protocol}</span>}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {cur.dateIso} · {SOURCE_LABEL[cur.source]} · {ageWeeks(cur, todayIso)} wk old · {spec.feeds}
                  </p>
                </div>
                <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  stale ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200'
                }`}>{stale ? 'retest' : 'current'}</span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <button type="button" onClick={() => (addOpts ? onAdd(s.kind, addOpts) : onAdd(s.kind))} className="text-xs font-semibold text-teal-700 dark:text-teal-300" data-testid="bm-log-new">
                  {stale ? `Enter a new ${s.label}` : `+ Log a new ${s.label}`}
                </button>
                {s.entries.length > 1 ? (
                  <button type="button" onClick={() => toggle(s.key)} aria-expanded={expanded} className="text-xs text-slate-600 dark:text-slate-300 underline underline-offset-2" data-testid="bm-history-toggle">
                    {expanded ? 'Hide history' : `History · ${s.entries.length} entries`}
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-400">One entry so far — log the next test to see a trend.</span>
                )}
                {confirming === cur.id ? (
                  <span className="text-xs text-slate-600 dark:text-slate-300" data-testid="bm-remove-confirm">
                    Remove this {s.label}? The plan goes back to {progress.previous ? `${formatBenchmarkValue(progress.previous)} (${progress.previous.dateIso})` : 'no value'}.{' '}
                    <button type="button" onClick={() => { onRemove(cur.id); setConfirming(null) }} className="font-semibold text-red-600">Remove</button>
                    {' · '}
                    <button type="button" onClick={() => setConfirming(null)} className="font-semibold">Keep</button>
                  </span>
                ) : (
                  !expanded && <button type="button" onClick={() => setConfirming(cur.id)} className="text-xs text-slate-400 underline underline-offset-2">Remove</button>
                )}
              </div>

              {expanded && <BenchmarkHistory series={s} onRemove={onRemove} />}
            </div>
          )
        })}
      </div>

      <button type="button" onClick={() => onAdd()} className="w-full h-11 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold" data-testid="bm-add">
        + Add a benchmark
      </button>
    </div>
  )
}
