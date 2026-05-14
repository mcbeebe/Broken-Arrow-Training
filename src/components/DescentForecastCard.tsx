import type { CachedEccentric } from '../utils/runEccentric'
import { summariseDescent } from '../utils/descentSummary'

interface Props {
  eccentric: CachedEccentric | null
}

const TONE = {
  severe: 'bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200',
  moderate: 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200',
  mild: 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-900 text-orange-800 dark:text-orange-200',
  none: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300',
}

/**
 * "Quads tomorrow" — surfaces the descent-damage engine in customer language.
 *
 * Today the eccentric engine produces a score, a histogram, and a forecast
 * curve inside the codebase, but the only UI affordance is a small pill in
 * WorkoutModal whose tooltip reads "distance-weighted average 2.43 on the
 * 1-5 scale (Vernillo 2017…)". This card surfaces the same data in the
 * vocabulary the athlete actually uses: fire scale + plain-English next-day
 * narrative.
 */
export default function DescentForecastCard({ eccentric }: Props) {
  const summary = summariseDescent(eccentric)
  if (summary.severity === 'none') return null

  const tone = TONE[summary.severity]
  const fires = '🔥'.repeat(summary.fireCount)

  return (
    <div className={`rounded-xl p-3.5 border ${tone}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide font-semibold opacity-80">
          Quads tomorrow
        </p>
        <span
          className="text-base leading-none tracking-wider"
          aria-label={`${summary.fireCount} of 4 severity`}
          role="img"
        >
          {fires}
        </span>
      </div>
      <p className="text-sm font-semibold mt-1.5 leading-snug">{summary.headline}</p>
      <p className="text-xs mt-1 leading-snug opacity-90">{summary.forecast}</p>
    </div>
  )
}
