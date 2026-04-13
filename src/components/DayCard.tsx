import type { PlannedDay } from '../types'
import { getWorkoutStyle } from '../utils/styles'
import { formatMiles, formatSeconds, estimateRunTime } from '../utils/format'

interface DayCardProps {
  day: PlannedDay
  onTap: () => void
  onLog?: () => void
  onSwap?: () => void
  isSwapSelected?: boolean
  isSwapTarget?: boolean
}

export default function DayCard({ day, onTap, onLog, onSwap, isSwapSelected, isSwapTarget }: DayCardProps) {
  const style = getWorkoutStyle(day.type)
  const actual = day.actual
  const timeEst = estimateRunTime(day.zone)

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
          <div className="flex items-center gap-1.5">
            {onSwap && (
              <button
                onClick={e => { e.stopPropagation(); onSwap() }}
                className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
                  isSwapSelected
                    ? 'bg-teal-500 text-white'
                    : isSwapTarget
                    ? 'bg-teal-100 text-teal-700 animate-pulse'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                ⇄
              </button>
            )}
            {onLog && (
              <button
                onClick={e => { e.stopPropagation(); onLog() }}
                className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
                  actual
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                }`}
              >
                {actual ? '✏️ Edit' : '📝 Log'}
              </button>
            )}
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
            <span>📊 {day.zone}{timeEst ? ` (${timeEst} running)` : ''}</span>
            {day.route !== '—' && <span>📍 {day.route}</span>}
          </div>
        )}

        {/* Actual data overlay */}
        {actual && (
          <div className="mt-2 pt-2 border-t border-slate-200/50">
            <p className="text-xs font-medium text-teal-700 mb-1">
              {actual.type === 'Manual' ? '📝' : '🔗 Strava:'} {actual.name}
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
              {actual.sufferScore && (
                <span>🔥 {actual.sufferScore} effort</span>
              )}
              {actual.calories && (
                <span>🔋 {actual.calories} cal</span>
              )}
            </div>
            {actual.strengthLog && actual.strengthLog.length > 0 && (
              <div className="mt-1.5 text-xs text-purple-600">
                💪 {actual.strengthLog.length} exercise{actual.strengthLog.length > 1 ? 's' : ''}
                {' · '}
                {actual.strengthLog.map(ex => ex.focus).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
              </div>
            )}
            {actual.notes && (
              <p className="mt-1 text-xs text-slate-500 italic">{actual.notes}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
