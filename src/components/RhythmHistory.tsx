import type { RhythmDay } from '../utils/rhythm'
import { resolvedCount } from '../utils/rhythm'

/**
 * The rhythm history — Progress's answer to "am I being consistent?", the
 * record the AccessMap put here to replace compliance shame.
 *
 * Where Today's strip is the last twelve days in the dark header, this is a
 * longer light-card band: three weeks of resolved days, plus the plainest
 * good-news line the data can honestly carry — how many days resolved.
 * Deliberately NOT a streak: a broken streak re-creates the very shame this
 * band exists to remove (see the no-streak product guard). Nothing here is
 * red; an open day is a neutral ring, never a mark against the athlete.
 */
export default function RhythmHistory({ rhythm }: { rhythm: RhythmDay[] }) {
  if (rhythm.length === 0) return null
  const { resolved, of } = resolvedCount(rhythm)

  return (
    <div
      className="bg-teal-50 dark:bg-teal-950 rounded-xl p-4 border border-teal-100 dark:border-teal-900"
      data-testid="rhythm-history"
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-teal-700 dark:text-teal-300">Your rhythm</p>
      <div className="mt-2 flex flex-wrap gap-1" aria-hidden="true">
        {rhythm.map(d => (
          <span
            key={d.iso}
            data-state={d.state}
            title={`${d.label}${d.workout ? ` · ${d.workout}` : ''}`}
            className={
              d.state === 'done' ? 'w-4 h-4 rounded bg-teal-500'
              : d.state === 'rest' ? 'w-4 h-4 rounded bg-teal-300 dark:bg-teal-700'
              : d.state === 'open' ? 'w-4 h-4 rounded border-2 border-slate-300 dark:border-slate-600 box-border'
              : d.state === 'today' ? 'w-4 h-4 rounded bg-teal-400 ring-2 ring-teal-500/50'
              : 'w-4 h-4 rounded bg-slate-100 dark:bg-slate-800'
            }
          />
        ))}
      </div>
      {of > 0 && (
        <p className="mt-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200" data-testid="rhythm-history-summary">
          {resolved} of your last {of} days resolved
        </p>
      )}
    </div>
  )
}
