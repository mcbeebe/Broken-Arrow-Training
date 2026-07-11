import type { Season } from '../types'
import { raceDateToIso, sortedSeasonRaces } from '../engines/season'

/**
 * Summary-page season overview: every race with a countdown, the ★ main
 * goal, each race's role, and the athlete's goal text. Renders only for
 * multi-race seasons — the single-race athlete already has the RaceCard.
 */

function fmtIso(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function daysUntilIso(iso: string): number {
  const ms = new Date(`${iso}T12:00:00`).getTime() - Date.now()
  return Math.ceil(ms / 86_400_000)
}

function countdownLabel(days: number): string {
  if (days < 0) return 'done'
  if (days === 0) return 'today!'
  if (days === 1) return 'tomorrow'
  if (days < 22) return `${days} days`
  return `${Math.round(days / 7)} weeks`
}

export default function SeasonRacesCard({ season, primaryGoalText }: {
  season: Season
  /** The athlete's own goal words for the main-goal race (config.athleteGoal). */
  primaryGoalText?: string
}) {
  if (season.races.length < 2) return null
  const races = sortedSeasonRaces(season)
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Your races</p>
      <div className="space-y-2.5">
        {races.map(r => {
          const iso = raceDateToIso(r.raceInfo.date)
          const days = iso ? daysUntilIso(iso) : null
          const done = days !== null && days < 0
          const role = r.isPrimary
            ? '★ Main goal'
            : r.priority === 'C' ? 'Tune-up' : 'Key race'
          const goal = r.isPrimary ? (primaryGoalText || r.raceInfo.description) : r.raceInfo.description
          return (
            <div key={r.id} className={`flex items-start gap-2 ${done ? 'opacity-50' : ''}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {r.raceInfo.name}
                  <span className={`ml-1.5 text-[11px] font-bold ${r.isPrimary ? 'text-teal-600' : 'text-slate-400'}`}>
                    {role}
                  </span>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {iso ? fmtIso(iso) : r.raceInfo.date}
                </p>
                {goal?.trim() && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{goal.trim()}</p>
                )}
              </div>
              {days !== null && !done && (
                <span className={`shrink-0 text-xs font-bold rounded-full px-2.5 py-1 ${
                  r.isPrimary ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                }`}>
                  {countdownLabel(days)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
