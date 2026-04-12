import type { TrainingWeek } from '../types'
import type { OverallCompliance } from '../hooks/useCompliance'
import { getMilesNumber } from '../utils/format'

interface DashboardProps {
  weeks: TrainingWeek[]
  compliance: OverallCompliance
  raceDate: string
}

export default function Dashboard({ weeks, compliance, raceDate }: DashboardProps) {
  const daysUntilRace = Math.max(0, Math.ceil(
    (new Date('2026-06-20').getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  ))

  return (
    <div className="px-4 py-4 space-y-4">
      <h2 className="text-lg font-bold text-slate-800">Dashboard</h2>

      {/* Race countdown */}
      <div className="bg-slate-800 rounded-xl p-4 text-white text-center">
        <p className="text-3xl font-bold">{daysUntilRace}</p>
        <p className="text-sm text-slate-300">days until race</p>
        <p className="text-xs text-teal-400 mt-1">{raceDate}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Completion"
          value={`${compliance.completionRate}%`}
          sub={`${compliance.totalCompleted} / ${compliance.totalCompleted + compliance.totalMissed} workouts`}
          color="teal"
        />
        <StatCard
          label="Actual Miles"
          value={`${compliance.totalActualMiles}`}
          sub={`of ${compliance.totalPlannedMiles} planned`}
          color="blue"
        />
        <StatCard
          label="Elevation"
          value={`${compliance.totalActualElevation.toLocaleString()} ft`}
          sub="total gain"
          color="amber"
        />
        <StatCard
          label="HR Compliance"
          value={`${compliance.overallHRCompliance}%`}
          sub="in target zone"
          color="rose"
        />
      </div>

      {/* Weekly compliance breakdown */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Weekly Breakdown</h3>
        <div className="space-y-2">
          {compliance.weeks.map(wk => (
            <div key={wk.weekNum} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800">Week {wk.weekNum}</span>
                <div className="flex gap-1.5">
                  {wk.completed > 0 && (
                    <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5">
                      {wk.completed} done
                    </span>
                  )}
                  {wk.missed > 0 && (
                    <span className="text-xs bg-red-100 text-red-700 rounded-full px-2 py-0.5">
                      {wk.missed} missed
                    </span>
                  )}
                </div>
              </div>
              {/* Mileage bar */}
              <div className="mt-2">
                <div className="flex justify-between text-xs text-slate-500 mb-0.5">
                  <span>{wk.actualMiles} mi actual</span>
                  <span>{wk.plannedMiles} mi planned</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, wk.plannedMiles > 0 ? (wk.actualMiles / wk.plannedMiles) * 100 : 0)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Planned vs Actual volume chart */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Planned vs Actual Mileage</h3>
        <div className="flex items-end gap-1 h-32">
          {weeks.map((w, i) => {
            const planned = getMilesNumber(w.miles)
            const actual = compliance.weeks[i]?.actualMiles ?? 0
            const max = Math.max(...weeks.map(wk => getMilesNumber(wk.miles)), 1)
            const pPct = (planned / max) * 100
            const aPct = (actual / max) * 100
            return (
              <div key={w.num} className="flex-1 flex flex-col items-center gap-0.5">
                <span className="text-[8px] text-slate-400">{actual > 0 ? actual : ''}</span>
                <div className="w-full flex gap-px" style={{ height: `${Math.max(pPct, aPct)}%`, minHeight: 4 }}>
                  <div
                    className="flex-1 rounded-t bg-slate-300"
                    style={{ height: `${pPct}%` }}
                  />
                  {actual > 0 && (
                    <div
                      className="flex-1 rounded-t bg-teal-500"
                      style={{ height: `${aPct}%` }}
                    />
                  )}
                </div>
                <span className="text-[9px] text-slate-400">{w.num}</span>
              </div>
            )
          })}
        </div>
        <div className="flex justify-center gap-4 mt-2 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 inline-block" /> Planned
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-teal-500 inline-block" /> Actual
          </span>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    teal: 'bg-teal-50 border-teal-200 text-teal-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    rose: 'bg-rose-50 border-rose-200 text-rose-800',
  }
  const classes = colorMap[color] || colorMap.teal

  return (
    <div className={`rounded-xl p-3 border ${classes}`}>
      <p className="text-xs opacity-75">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
      <p className="text-xs opacity-60 mt-0.5">{sub}</p>
    </div>
  )
}
