import { useEffect, useState } from 'react'
import type { PlannedDay } from '../types'
import { getWorkoutStyle } from '../utils/styles'
import { getCoaching } from '../utils/coaching'
import { formatMiles, formatSeconds } from '../utils/format'
import { parseRoutine, type ParsedExercise } from '../utils/exercises'
import { parseIntervalWorkout, getDrillDay, RUNNING_DRILLS, MYRTL_ROUTINE, PRE_RUN_ACTIVATION, type RunSegment, type DrillGuide } from '../utils/drills'

interface WorkoutModalProps {
  day: PlannedDay
  weekNum: number
  onClose: () => void
}

export default function WorkoutModal({ day, weekNum, onClose }: WorkoutModalProps) {
  const style = getWorkoutStyle(day.type)
  const coaching = getCoaching(day, weekNum)
  const actual = day.actual
  const isStrength = day.type === 'strength'
  const isQuality = day.type === 'quality'
  const isRunType = ['run', 'quality', 'long'].includes(day.type)
  const exercises = isStrength ? parseRoutine(day.detail) : []
  const intervals = isQuality ? parseIntervalWorkout(day.detail, day.zone) : []
  const isDrillDay = getDrillDay(weekNum) === day.day

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />

      <div
        className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="sticky top-0 px-4 pt-4 pb-3 rounded-t-2xl z-10"
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
            <div className="mt-0.5">
              <p className="text-xs text-slate-500">
                ⏱ Total session: {day.time} (includes warm-up, cool-down & transitions)
                {day.route !== '—' && <> · 📍 {day.route}</>}
              </p>
            </div>
          )}
        </div>

        <div className="px-4 py-4 space-y-4">
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

          {/* Pre-run activation for drill days */}
          {isDrillDay && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">🔥 Pre-Run Activation (~3 min)</p>
              <p className="text-xs text-slate-500 mb-2">Do these BEFORE your run to wake up your glutes and hips. Quick and targeted.</p>
              <div className="space-y-1.5">
                {PRE_RUN_ACTIVATION.map((drill, i) => (
                  <DrillCard key={i} drill={drill} />
                ))}
              </div>
            </div>
          )}

          {/* Purpose */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">🎯 Purpose</p>
            <p className="text-sm text-slate-700 leading-relaxed">{coaching.purpose}</p>
          </div>

          {/* How to Execute */}
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

          {/* Strength: Exercise-by-exercise guide */}
          {isStrength && exercises.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">🏋️ Exercise Guide (tap for form cues)</p>
              <div className="space-y-2">
                {exercises.map((ex, i) => (
                  <ExerciseCard key={i} exercise={ex} index={i + 1} />
                ))}
              </div>
            </div>
          )}

          {/* Quality: Interval breakdown */}
          {isQuality && intervals.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">⚡ Interval Breakdown</p>
              <div className="space-y-1.5">
                {intervals.map((seg, i) => (
                  <IntervalSegment key={i} segment={seg} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Drills + Myrtl for designated drill days */}
          {isDrillDay && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">🏃 Post-Run: Running Drills (~8 min)</p>
              <p className="text-xs text-slate-500 mb-2">Do these after your run while muscles are warm, before stretching. Builds speed and coordination.</p>
              <div className="space-y-1.5">
                {RUNNING_DRILLS.map((drill, i) => (
                  <DrillCard key={i} drill={drill} />
                ))}
              </div>
            </div>
          )}

          {isDrillDay && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">🦵 Post-Run: Full Myrtl Hip Routine (~10 min)</p>
              <p className="text-xs text-slate-500 mb-2">Full hip strengthening after drills. You did the abbreviated version pre-run — now go deep while muscles are warm.</p>
              <div className="space-y-1.5">
                {MYRTL_ROUTINE.map((drill, i) => (
                  <DrillCard key={i} drill={drill} />
                ))}
              </div>
            </div>
          )}

          {/* Myrtl recommendation for non-drill run days */}
          {isRunType && !isDrillDay && (
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
              <p className="text-xs font-semibold text-blue-800">💡 Drills & Myrtl Tip</p>
              <p className="text-xs text-blue-700 mt-1">
                Running drills and the Myrtl hip routine are scheduled for your {getDrillDay(weekNum)} run this week.
                If you want extra hip work today, do the Myrtl routine post-run (10 min).
              </p>
            </div>
          )}

          {/* Mindset */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">🧠 Mindset</p>
            <p className="text-sm text-slate-700 italic leading-relaxed">{coaching.mindset}</p>
          </div>

          {/* Nutrition */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">🍌 Nutrition</p>
            <p className="text-sm text-slate-700">{coaching.nutrition}</p>
          </div>

          {/* Recovery */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">🔄 Recovery</p>
            <p className="text-sm text-slate-700">{coaching.recovery}</p>
          </div>
        </div>

        <div className="h-6" />
      </div>
    </div>
  )
}

function ExerciseCard({ exercise, index }: { exercise: ParsedExercise; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const guide = exercise.guide

  return (
    <div
      className="bg-white rounded-xl border border-purple-200 overflow-hidden"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="px-3 py-2.5 cursor-pointer">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-purple-600 bg-purple-100 rounded-full w-5 h-5 flex items-center justify-center shrink-0">
              {index}
            </span>
            <span className="text-sm font-medium text-slate-800">
              {guide?.name || exercise.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {exercise.sets && exercise.reps && (
              <span className="text-xs text-purple-700 bg-purple-50 rounded-full px-2 py-0.5 font-medium">
                {exercise.sets} × {exercise.reps}
              </span>
            )}
            <span className="text-slate-400 text-xs">{expanded ? '▼' : '›'}</span>
          </div>
        </div>
        {guide && !expanded && (
          <p className="text-xs text-slate-500 mt-0.5 ml-7">{guide.weight} · {guide.rest}</p>
        )}
      </div>

      {expanded && guide && (
        <div className="px-3 pb-3 border-t border-purple-100 pt-2 space-y-2">
          <p className="text-xs text-slate-500 italic">{guide.aka}</p>
          <div className="flex gap-3 text-xs">
            <span className="text-purple-700 bg-purple-50 rounded px-2 py-1">💪 {guide.weight}</span>
            <span className="text-purple-700 bg-purple-50 rounded px-2 py-1">⏸ {guide.rest}</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-1">Form Cues:</p>
            <ol className="space-y-1">
              {guide.form.map((cue, i) => (
                <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                  <span className="text-slate-400 shrink-0">{i + 1}.</span>
                  <span>{cue}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {expanded && !guide && (
        <div className="px-3 pb-3 border-t border-purple-100 pt-2">
          <p className="text-xs text-slate-500">No detailed guide available for this exercise yet.</p>
        </div>
      )}
    </div>
  )
}

function IntervalSegment({ segment, index }: { segment: RunSegment; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const isWarmCool = segment.label === 'Warm-Up' || segment.label === 'Cool-Down'
  const isRecovery = segment.label.startsWith('Recovery')
  const bgColor = isWarmCool ? 'bg-green-50 border-green-200' : isRecovery ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-200'
  const numColor = isWarmCool ? 'bg-green-100 text-green-700' : isRecovery ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'

  return (
    <div
      className={`rounded-xl border overflow-hidden ${bgColor}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="px-3 py-2 cursor-pointer">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0 ${numColor}`}>
              {index + 1}
            </span>
            <span className="text-sm font-medium text-slate-800">{segment.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600">{segment.duration}</span>
            <span className="text-slate-400 text-xs">{expanded ? '▼' : '›'}</span>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-0.5 ml-7">{segment.effort}</p>
      </div>

      {expanded && (
        <div className="px-3 pb-2.5 border-t border-slate-200/50 pt-2">
          <ul className="space-y-1">
            {segment.cues.map((cue, i) => (
              <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                <span className="text-slate-400 shrink-0">•</span>
                <span>{cue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function DrillCard({ drill }: { drill: DrillGuide }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="bg-white rounded-xl border border-blue-200 overflow-hidden"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="px-3 py-2 cursor-pointer">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-800">{drill.name}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-600">{drill.duration}</span>
            <span className="text-slate-400 text-xs">{expanded ? '▼' : '›'}</span>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-2.5 border-t border-blue-100 pt-2">
          <ul className="space-y-1">
            {drill.form.map((cue, i) => (
              <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                <span className="text-slate-400 shrink-0">•</span>
                <span>{cue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
