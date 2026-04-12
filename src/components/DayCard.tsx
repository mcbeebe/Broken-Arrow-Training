import type { PlannedDay } from '../types'
import { getWorkoutStyle } from '../utils/styles'
import { formatMiles, formatSeconds } from '../utils/format'

interface DayCardProps {
  day: PlannedDay
  onTap: () => void
}

export default function DayCard({ day, onTap }: DayCardProps) {
  const style = getWorkoutStyle(day.type)
  const actual = day.actual

  return (
    <div
      className="rounded-xl overflow-hidden shadow-sm cursor-pointer active:scale-[0.98] transition-transform"
      style={{ backgroundColor: style.bg, borderLeft: `4px solid ${style.border}` }}
      onClick={onTap}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">{style.label}</span>
            <span className="font-semibold text-sm text-slate-800">{day.day}</span>
            {actual && (
              <span className="text-xs bg-green-100 text-green-700 rounded-full px-1.5 py-0.5 font-medium">
                ✓ Done
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {day.time !== '—' && (
              <span className="text-xs text-slate-500 bg-white/60 rounded-full px-2 py-0.5">
                {day.time}
              </span>
            )}
            <span className="text-slate-400 text-xs">›</span>
          </div>
        </div>
        <div className="mt-1.5">
          <p className="font-medium text-sm text-slate-800">{day.workout}</p>
          {day.detail && (
            <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{day.detail}</p>
          )}
        </div>
        {day.zone !== '—' && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
            <span>📊 {day.zone}</span>
            {day.route !== '—' && <span>📍 {day.route}</span>}
          </div>
        )}

        {/* Strava actual data overlay */}
        {actual && (
          <div className="mt-2 pt-2 border-t border-slate-200/50">
            <p className="text-xs font-medium text-teal-700 mb-1">
              Strava: {actual.name}
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
              {actual.distance > 0 && (
                <span>📏 {formatMiles(actual.distance)}</span>
              )}
              {actual.movingTime > 0 && (
                <span>⏱ {formatSeconds(actual.movingTime)}</span>
              )}
              {actual.avgHR && (
                <span>❤️ {actual.avgHR} avg</span>
              )}
              {actual.elevationGain > 0 && (
                <span>⛰ {actual.elevationGain} ft</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
