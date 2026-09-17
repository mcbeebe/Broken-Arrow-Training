import { useState } from 'react'
import { seriesProgress, progressDirection, type Benchmark, type BenchmarkSeries } from '../engines/benchmark/log'
import { formatBenchmarkValue, formatBenchmarkDelta } from '../engines/benchmark/preview'
import { daysBetween } from '../utils/planDates'

/**
 * One benchmark over time: a trend line over every entry, then the entries
 * themselves, newest first, each with its change against the one before.
 *
 * The line plots the raw values by the date they were measured, so a 5K
 * that falls reads as progress and the caption says which way is better.
 * One series, so no legend; the first and latest values are labelled on
 * the line and every point carries its value on hover. The list below is
 * the table view of the same data — the numbers are never colour-only.
 */

interface Props {
  series: BenchmarkSeries
  /** Remove one entry (any entry, not only the current one). */
  onRemove: (id: string) => void
}

const SOURCE_SHORT: Record<Benchmark['source'], string> = {
  manual: 'entered', logged: 'from a session', derived: 'from setup',
}

const W = 300, H = 64, PAD_X = 34, PAD_Y = 10

export function TrendLine({ entries }: { entries: readonly Benchmark[] }) {
  // Chronological for drawing; `entries` arrive newest-first.
  const pts = [...entries].reverse()
  if (pts.length < 2) return null
  const first = pts[0], last = pts[pts.length - 1]
  const span = Math.max(1, daysBetween(first.dateIso.slice(0, 10), last.dateIso.slice(0, 10)))
  const values = pts.map(p => p.value)
  const lo = Math.min(...values), hi = Math.max(...values)
  const range = hi - lo || Math.max(1, Math.abs(hi) * 0.1)
  const x = (p: Benchmark) => PAD_X + (daysBetween(first.dateIso.slice(0, 10), p.dateIso.slice(0, 10)) / span) * (W - 2 * PAD_X)
  const y = (p: Benchmark) => H - PAD_Y - ((p.value - lo) / range) * (H - 2 * PAD_Y)
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p).toFixed(1)},${y(p).toFixed(1)}`).join(' ')
  const dir = progressDirection(last)
  const caption = dir === 'lower' ? 'lower is better' : dir === 'higher' ? 'higher is better' : `${pts.length} entries`

  return (
    <figure className="mt-2" data-testid="bm-trend">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" role="img"
        aria-label={`${pts.length} entries from ${formatBenchmarkValue(first)} on ${first.dateIso} to ${formatBenchmarkValue(last)} on ${last.dateIso}`}>
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="text-teal-600 dark:text-teal-400" />
        {pts.map((p, i) => (
          <g key={p.id}>
            <circle cx={x(p)} cy={y(p)} r="4" className={`text-teal-600 dark:text-teal-400 ${i === pts.length - 1 ? 'fill-current' : 'fill-white dark:fill-slate-800'}`} stroke="currentColor" strokeWidth="2">
              <title>{`${formatBenchmarkValue(p)} · ${p.dateIso}${p.protocol ? ` · ${p.protocol}` : ''}`}</title>
            </circle>
            {/* A bigger hit target than the mark, for touch. */}
            <circle cx={x(p)} cy={y(p)} r="10" fill="transparent"><title>{`${formatBenchmarkValue(p)} · ${p.dateIso}`}</title></circle>
          </g>
        ))}
        <text x={x(first) - 6} y={y(first) + 3} textAnchor="end" className="fill-slate-500 dark:fill-slate-400" fontSize="9" fontFamily="ui-monospace, monospace">{formatBenchmarkValue(first).replace(/ (bpm|reps|lb|\/mi)$/, '')}</text>
        <text x={x(last) + 6} y={y(last) + 3} textAnchor="start" className="fill-slate-700 dark:fill-slate-200" fontSize="9" fontWeight="700" fontFamily="ui-monospace, monospace">{formatBenchmarkValue(last).replace(/ (bpm|reps|lb|\/mi)$/, '')}</text>
      </svg>
      <figcaption className="flex justify-between text-[10px] text-slate-400">
        <span>{first.dateIso}</span><span>{caption}</span><span>{last.dateIso}</span>
      </figcaption>
    </figure>
  )
}

export default function BenchmarkHistory({ series, onRemove }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const { entries } = series
  const progress = seriesProgress(entries)
  if (!progress) return null
  const dir = progressDirection(progress.latest)

  return (
    <div data-testid={`bm-history-${series.key}`}>
      <TrendLine entries={entries} />

      {progress.deltaSinceFirst != null && (
        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1.5" data-testid="bm-since-first">
          Since your first {series.label} ({progress.oldest.dateIso}): {formatBenchmarkDelta(progress.latest, progress.deltaSinceFirst)} over {progress.spanWeeks} wk
          {dir !== 'neutral' && progress.best.id !== progress.latest.id && ` · best ${formatBenchmarkValue(progress.best)} on ${progress.best.dateIso}`}
          {dir !== 'neutral' && progress.best.id === progress.latest.id && entries.length > 1 && ' · your best yet'}
        </p>
      )}

      <ol className="mt-2 divide-y divide-slate-200/70 dark:divide-slate-600/50">
        {entries.map((e, i) => {
          const prev = entries[i + 1]
          const delta = prev ? e.value - prev.value : null
          const better = delta == null || dir === 'neutral' || delta === 0 ? null : (dir === 'lower' ? delta < 0 : delta > 0)
          return (
            <li key={e.id} className="py-1.5 flex items-start justify-between gap-2 text-xs" data-testid={`bm-entry-${e.id}`}>
              <div className="min-w-0">
                <p className="text-slate-800 dark:text-slate-100">
                  <span className="font-mono font-semibold">{formatBenchmarkValue(e)}</span>
                  {i === 0 && <span className="ml-1.5 text-[10px] font-bold text-teal-700 dark:text-teal-300">current</span>}
                  {delta != null && (
                    <span className={`ml-1.5 font-mono ${better == null ? 'text-slate-500 dark:text-slate-400' : better ? 'text-teal-700 dark:text-teal-300' : 'text-amber-700 dark:text-amber-300'}`}>
                      {formatBenchmarkDelta(e, delta)}{better == null ? '' : better ? ' ▲' : ' ▼'}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {e.dateIso} · {SOURCE_SHORT[e.source]}{e.protocol ? ` · ${e.protocol}` : ''}{e.note ? ` · ${e.note}` : ''}
                </p>
              </div>
              {confirming === e.id ? (
                <span className="shrink-0 text-[11px] text-slate-600 dark:text-slate-300" data-testid="bm-entry-remove-confirm">
                  Remove?{' '}
                  <button type="button" onClick={() => { onRemove(e.id); setConfirming(null) }} className="font-semibold text-red-600">Yes</button>
                  {' · '}
                  <button type="button" onClick={() => setConfirming(null)} className="font-semibold">Keep</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirming(e.id)} aria-label={`Remove ${formatBenchmarkValue(e)} from ${e.dateIso}`} className="shrink-0 text-[11px] text-slate-400 underline underline-offset-2">Remove</button>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
