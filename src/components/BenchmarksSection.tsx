import { useState } from 'react'
import {
  BENCHMARK_KINDS, kindsForPlan, isStale, ageWeeks,
  type Benchmark, type BenchmarkKind, type PlanKind,
} from '../engines/benchmark/log'
import { formatBenchmarkValue } from '../engines/benchmark/preview'

/**
 * Settings → Benchmarks. Every number the plan runs on, with its source,
 * its age and what it feeds. Newest of each kind is "current"; older ones
 * are history. A stale current row says "retest" in the plan's own amber —
 * the same clock the plan uses to schedule a test day.
 *
 * Removing is a tombstone with a plain warning: the plan goes back to the
 * previous entry of that kind, or to no value, and the row says which.
 */

interface Props {
  plan: PlanKind
  live: Benchmark[]
  todayIso: string
  onAdd: (kind?: BenchmarkKind) => void
  onRemove: (id: string) => void
}

const SOURCE_LABEL: Record<Benchmark['source'], string> = {
  manual: 'entered by you', logged: 'from a logged session', derived: 'from setup',
}

export default function BenchmarksSection({ plan, live, todayIso, onAdd, onRemove }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const order = [...kindsForPlan(plan), ...(Object.keys(BENCHMARK_KINDS) as BenchmarkKind[])]
  const byKind = new Map<BenchmarkKind, Benchmark[]>()
  for (const b of live) byKind.set(b.kind, [...(byKind.get(b.kind) ?? []), b])
  const kinds = [...new Set(order)].filter(k => byKind.has(k))

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        What your plan runs on. The newest of each kind is in use; the rest stays as history.
      </p>

      {kinds.length === 0 && (
        <p className="text-xs text-slate-400" data-testid="bm-empty">Nothing measured yet. A recent race time is the single most useful number you can give the plan.</p>
      )}

      <div className="space-y-2">
        {kinds.map(kind => {
          const entries = byKind.get(kind)!  // newest first (live is sorted)
          const [cur, ...history] = entries
          const spec = BENCHMARK_KINDS[kind]
          const stale = isStale(cur, todayIso)
          const label = kind === 'other' && cur.label ? cur.label : spec.label
          const previous = history[0]
          return (
            <div key={kind} className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2" data-testid={`bm-row-${kind}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {label} · {formatBenchmarkValue(cur)}
                    {cur.protocol && <span className="font-normal text-slate-500 dark:text-slate-400"> — {cur.protocol}</span>}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {cur.dateIso} · {SOURCE_LABEL[cur.source]} · {ageWeeks(cur, todayIso)} wk old · {spec.feeds}
                  </p>
                  {history.length > 0 && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      History: {history.slice(0, 3).map(h => `${formatBenchmarkValue(h)} (${h.dateIso.slice(0, 7)})`).join(' · ')}{history.length > 3 ? ` · +${history.length - 3} more` : ''}
                    </p>
                  )}
                </div>
                <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  stale ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200'
                }`}>{stale ? 'retest' : 'current'}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                {stale && (
                  <button type="button" onClick={() => onAdd(kind)} className="text-xs font-semibold text-teal-700 dark:text-teal-300">Enter a new {spec.label}</button>
                )}
                {confirming === cur.id ? (
                  <span className="text-xs text-slate-600 dark:text-slate-300" data-testid="bm-remove-confirm">
                    Remove this {label}? The plan goes back to {previous ? `${formatBenchmarkValue(previous)} (${previous.dateIso})` : 'no value'}.{' '}
                    <button type="button" onClick={() => { onRemove(cur.id); setConfirming(null) }} className="font-semibold text-red-600">Remove</button>
                    {' · '}
                    <button type="button" onClick={() => setConfirming(null)} className="font-semibold">Keep</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirming(cur.id)} className="text-xs text-slate-400 underline underline-offset-2">Remove</button>
                )}
              </div>
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
