import type { RaceReadinessSummary } from '../utils/raceReadiness'

interface Props {
  race: { name: string; distance: string }
  summary: RaceReadinessSummary
}

const GAP_TONE: Record<RaceReadinessSummary['gap'], { ring: string; pill: string; pillText: string }> = {
  'on-track': { ring: 'stroke-emerald-500', pill: 'bg-emerald-100 dark:bg-emerald-950', pillText: 'text-emerald-700 dark:text-emerald-300' },
  fitness: { ring: 'stroke-blue-500', pill: 'bg-blue-100 dark:bg-blue-950', pillText: 'text-blue-700 dark:text-blue-300' },
  vert: { ring: 'stroke-violet-500', pill: 'bg-violet-100 dark:bg-violet-950', pillText: 'text-violet-700 dark:text-violet-300' },
  taper: { ring: 'stroke-amber-500', pill: 'bg-amber-100 dark:bg-amber-950', pillText: 'text-amber-700 dark:text-amber-300' },
}

const GAP_LABEL: Record<RaceReadinessSummary['gap'], string> = {
  'on-track': 'on track',
  fitness: 'fitness gap',
  vert: 'vert gap',
  taper: 'taper window',
}

/**
 * Hero card pinned to the top of Summary in the final ~8 weeks before a race.
 * Answers the only question every athlete actually has: "Am I ready?".
 */
export default function RaceReadyHeroCard({ race, summary }: Props) {
  const tone = GAP_TONE[summary.gap]
  const circumference = 2 * Math.PI * 28
  const offset = circumference * (1 - summary.pct / 100)

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
            <circle cx="36" cy="36" r="28" fill="none" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="6" />
            <circle
              cx="36"
              cy="36"
              r="28"
              fill="none"
              className={tone.ring}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform="rotate(-90 36 36)"
            />
          </svg>
          <span
            className="absolute inset-0 flex items-center justify-center text-lg font-bold text-slate-800 dark:text-white"
            aria-label={`${summary.pct} percent ready`}
          >
            {summary.pct}%
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Race readiness</p>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${tone.pill} ${tone.pillText}`}>
              {GAP_LABEL[summary.gap]}
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5 leading-snug">{summary.headline}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {race.name} · {race.distance}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-700 dark:text-slate-200 leading-relaxed border-t border-slate-100 dark:border-slate-700 pt-3">
        <span className="font-semibold">Next {summary.weeksLeft > 3 ? '3 weeks' : `${summary.weeksLeft} ${summary.weeksLeft === 1 ? 'week' : 'weeks'}`}:</span>{' '}
        {summary.nextAction}
      </p>
    </div>
  )
}
