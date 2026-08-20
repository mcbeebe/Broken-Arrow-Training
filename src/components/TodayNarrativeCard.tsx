import { useMemo, useState } from 'react'
import type { PlannedDay, RaceInfo, Season, TrainingWeek } from '../types'
import { generateTodayNarrative } from '../utils/todayNarrative'

interface Props {
  day?: PlannedDay | null
  weeks?: TrainingWeek[]
  currentWeekNum?: number
  race?: RaceInfo | null
  season?: Season | null
  /** Deep-link into the Plan tab's Season view. */
  onOpenSeason?: () => void
}

/**
 * "Why today matters" — the plan's INTENT, on the home screen, above the
 * fold. The daily briefing next to it speaks to how the athlete is doing;
 * this speaks to what the training is for, which is the thing that keeps
 * people going on the days motivation doesn't show up.
 *
 * Deterministic (no network): it renders identically offline, which is
 * where a lot of training days actually start.
 */
export default function TodayNarrativeCard({ day, weeks, currentWeekNum, race, season, onOpenSeason }: Props) {
  const [expanded, setExpanded] = useState(false)

  const narrative = useMemo(() => {
    if (!weeks || weeks.length === 0) return null
    const weekNum = currentWeekNum ?? 1
    const week = weeks[weekNum - 1] ?? null
    return generateTodayNarrative({
      day, week, weekNum, totalWeeks: weeks.length, race, season,
    })
  }, [day, weeks, currentWeekNum, race, season])

  if (!narrative) return null

  return (
    <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-950/30 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-indigo-900 dark:text-indigo-200">{narrative.headline}</p>
        <span className="text-lg leading-none" aria-hidden>🧭</span>
      </div>

      <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed mt-2">{narrative.today}</p>

      {expanded && (
        <div className="mt-3 space-y-2.5 border-t border-indigo-100 dark:border-indigo-900/50 pt-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">This week</p>
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed mt-0.5">{narrative.week}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">The bigger arc</p>
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed mt-0.5">{narrative.arc}</p>
          </div>
          {onOpenSeason && (
            <button
              onClick={onOpenSeason}
              className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 underline underline-offset-2"
            >
              See the whole season →
            </button>
          )}
        </div>
      )}

      <button
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="mt-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300"
      >
        {expanded ? 'Less' : 'How this fits the week & the season →'}
      </button>
    </div>
  )
}
