import { useEffect } from 'react'
import type { PlannedDay } from '../types'
import { getWorkoutStyle } from '../utils/styles'
import { getCoaching } from '../utils/coaching'
import { formatMiles, formatSeconds } from '../utils/format'

interface WorkoutModalProps {
  day: PlannedDay
  weekNum: number
  onClose: () => void
}

export default function WorkoutModal({ day, weekNum, onClose }: WorkoutModalProps) {
  const style = getWorkoutStyle(day.type)
  const coaching = getCoaching(day, weekNum)
  const actual = day.actual

  // Close on Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal */}
      <div
        className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="sticky top-0 px-4 pt-4 pb-3 rounded-t-2xl"
          style={{ backgroundColor: style.bg, borderBottom: `3px solid ${style.border}` }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{style.label}</span>
              <div>
                <p className="font-bold text-slate-800">{day.day}</p>
                <p className="text-xs text-slate-500">Week {weekNum}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/70 text-slate-600 hover:bg-white transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="font-semibold text-slate-800 mt-2">{day.workout}</p>
          {day.time !== '—' && (
            <p className="text-xs text-slate-500 mt-0.5">{day.time} · {day.route !== '—' ? day.route : ''}</p>
          )}
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Planned details */}
          {day.detail && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Workout Details</p>
              <p className="text-sm text-slate-700">{day.detail}</p>
              {day.zone !== '—' && (
                <p className="text-sm text-slate-600 mt-1">📊 Target: {day.zone}</p>
              )}
            </div>
          )}

          {/* Strava actual */}
          {actual && (
            <div className="bg-teal-50 rounded-xl p-3 border border-teal-200">
              <p className="text-xs font-semibold text-teal-800 uppercase tracking-wide mb-1.5">Strava: {actual.name}</p>
              <div className="grid grid-cols-2 gap-2 text-sm text-teal-700">
                {actual.distance > 0 && <span>📏 {formatMiles(actual.distance)}</span>}
                {actual.movingTime > 0 && <span>⏱ {formatSeconds(actual.movingTime)}</span>}
                {actual.avgHR && <span>❤️ {actual.avgHR} avg HR</span>}
                {actual.maxHR && <span>💓 {actual.maxHR} max HR</span>}
                {actual.elevationGain > 0 && <span>⛰ {actual.elevationGain} ft gain</span>}
              </div>
            </div>
          )}

          {/* Coaching: Purpose */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">🎯 Purpose</p>
            <p className="text-sm text-slate-700 leading-relaxed">{coaching.purpose}</p>
          </div>

          {/* Coaching: How to Execute */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">📋 How to Execute</p>
            <ul className="space-y-1.5">
              {coaching.execution.map((tip, i) => (
                <li key={i} className="text-sm text-slate-700 flex gap-2">
                  <span className="text-slate-400 shrink-0">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Coaching: Mindset */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">🧠 Mindset</p>
            <p className="text-sm text-slate-700 italic leading-relaxed">{coaching.mindset}</p>
          </div>

          {/* Coaching: Nutrition */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">🍌 Nutrition</p>
            <p className="text-sm text-slate-700">{coaching.nutrition}</p>
          </div>

          {/* Coaching: Recovery */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">🔄 Recovery</p>
            <p className="text-sm text-slate-700">{coaching.recovery}</p>
          </div>
        </div>

        {/* Bottom padding for mobile */}
        <div className="h-6" />
      </div>
    </div>
  )
}
