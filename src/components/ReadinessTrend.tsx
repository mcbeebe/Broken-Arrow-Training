import type { ReadinessScore } from '../types'

/**
 * The 7-day readiness trend: one bar per day, its height the day's score
 * and its color the day's status. Shared by Progress (Readiness tab) and
 * Today. Renders nothing until there is a score to show — readiness needs
 * a watch's overnight data (HRV, sleep, resting HR).
 */
export default function ReadinessTrend({ weekScores }: { weekScores: ReadinessScore[] }) {
  if (weekScores.length === 0) return null
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
      <p className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-3">7-Day Readiness Trend</p>
      <div className="flex items-end gap-1.5 h-24">
        {weekScores.map((s, i) => {
          const barPx = Math.max(Math.round((s.displayScore / 100) * 64), 2)
          const bg =
            s.status === 'PEAK' ? 'bg-indigo-500' :
            s.status === 'GREEN' ? 'bg-green-500' :
            s.status === 'YELLOW' ? 'bg-amber-400' :
            'bg-red-500'
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">{s.displayScore}</span>
              <div
                className={`w-full rounded-t ${bg} transition-all`}
                style={{ height: `${barPx}px` }}
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">{s.date.slice(5)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
