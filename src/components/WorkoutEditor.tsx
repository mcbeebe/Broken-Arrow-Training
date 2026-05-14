import { useEffect, useState } from 'react'
import type { PlannedDay, WorkoutType } from '../types'
import { WORKOUT_STYLES } from '../utils/styles'

// Set/rep row used by the structured strength editor. Reps and sets are
// kept as strings so users can type things like "10/leg", "45s", or leave
// the field empty mid-edit — we only require shape when serializing back
// out to the detail string.
interface ExerciseDraft {
  name: string
  sets: string
  reps: string
}

export type WorkoutEdits = Partial<Pick<PlannedDay, 'type' | 'workout' | 'detail' | 'zone' | 'time' | 'route'>>

interface WorkoutEditorProps {
  day: PlannedDay
  weekNum: number
  /** True when there is already an override applied to this (week, day). */
  hasOverride: boolean
  onSave: (updates: WorkoutEdits) => void
  /** Discard the override and return to the base plan. */
  onRevert: () => void
  onClose: () => void
}

const TYPE_OPTIONS: { value: WorkoutType; label: string }[] = [
  { value: 'run', label: 'Run' },
  { value: 'long', label: 'Long' },
  { value: 'quality', label: 'Quality' },
  { value: 'strength', label: 'Strength' },
  { value: 'cross', label: 'Cross' },
  { value: 'rest', label: 'Rest' },
  { value: 'limited', label: 'Limited' },
  { value: 'travel', label: 'Travel' },
  { value: 'race', label: 'Race' },
]

const EXERCISE_SEPARATOR = ' · '

// Pull the trailing "NxR" volume off an exercise line, returning the bare
// name plus the sets/reps strings. Matches `parseRoutine` (utils/exercises)
// so what we round-trip stays consistent with how the rest of the app
// reads strength detail. Sets/reps may be blank for exercises like
// "Myrtl routine" or "Foam roll quads/calves 10 min".
function splitExercise(part: string): ExerciseDraft {
  const setsMatch = part.match(/^(.+?)\s+(\d+)\s*[×xX]\s*(\d+\s*(?:\/\s*(?:leg|side))?\s*(?:s|sec)?)\s*$/)
  if (setsMatch) {
    return { name: setsMatch[1].trim(), sets: setsMatch[2], reps: setsMatch[3].trim() }
  }
  return { name: part.trim(), sets: '', reps: '' }
}

function parseDetailToExercises(detail: string): ExerciseDraft[] {
  if (!detail) return []
  return detail
    .split('·')
    .map(s => s.trim())
    .filter(Boolean)
    .map(splitExercise)
}

function exercisesToDetail(rows: ExerciseDraft[]): string {
  return rows
    .map(ex => {
      const name = ex.name.trim()
      if (!name) return ''
      const sets = ex.sets.trim()
      const reps = ex.reps.trim()
      if (sets && reps) return `${name} ${sets}×${reps}`
      return name
    })
    .filter(Boolean)
    .join(EXERCISE_SEPARATOR)
}

export default function WorkoutEditor({ day, weekNum, hasOverride, onSave, onRevert, onClose }: WorkoutEditorProps) {
  const [type, setType] = useState<WorkoutType>(day.type)
  const [workout, setWorkout] = useState(day.workout)
  const [detail, setDetail] = useState(day.detail === '—' ? '' : day.detail)
  const [zone, setZone] = useState(day.zone === '—' ? '' : day.zone)
  const [time, setTime] = useState(day.time === '—' ? '' : day.time)
  const [route, setRoute] = useState(day.route === '—' ? '' : day.route)
  const [exercises, setExercises] = useState<ExerciseDraft[]>(() => parseDetailToExercises(day.detail))

  // When the user switches the workout type to strength, seed the structured
  // editor from whatever's in the detail field. Switching away leaves the
  // structured rows in state but they're just hidden — re-entering strength
  // restores the prior edits without needing to re-parse.
  useEffect(() => {
    if (type === 'strength' && exercises.length === 0) {
      setExercises(parseDetailToExercises(detail))
    }
  }, [type, exercises.length, detail])

  // Lock body scroll while the modal is open — same UX as ManualLog.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  function updateExercise(idx: number, patch: Partial<ExerciseDraft>) {
    setExercises(prev => prev.map((ex, i) => (i === idx ? { ...ex, ...patch } : ex)))
  }
  function addExercise() {
    setExercises(prev => [...prev, { name: '', sets: '3', reps: '10' }])
  }
  function removeExercise(idx: number) {
    setExercises(prev => prev.filter((_, i) => i !== idx))
  }
  function moveExercise(idx: number, dir: -1 | 1) {
    setExercises(prev => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  function handleSave() {
    // Serialize structured exercises back into `detail` for strength days so
    // every downstream consumer (WorkoutModal exercise cards, ManualLog
    // import-from-plan, compliance grader) keeps working without a separate
    // structured field on PlannedDay.
    const finalDetail = type === 'strength' ? exercisesToDetail(exercises) : detail.trim()
    const updates: WorkoutEdits = {
      type,
      workout: workout.trim() || day.workout,
      detail: finalDetail || '—',
      zone: zone.trim() || '—',
      time: time.trim() || '—',
      route: route.trim() || '—',
    }
    onSave(updates)
  }

  const style = WORKOUT_STYLES[type] ?? WORKOUT_STYLES.rest

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-slate-800 px-4 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 dark:text-white">Edit Workout — {day.day}</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Week {weekNum} · changes save as a personal override
              </p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">✕</button>
          </div>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Workout type picker — pill grid */}
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1.5">Workout type</label>
            <div className="grid grid-cols-3 gap-1.5">
              {TYPE_OPTIONS.map(opt => {
                const optStyle = WORKOUT_STYLES[opt.value]
                const active = opt.value === type
                return (
                  <button
                    key={opt.value}
                    onClick={() => setType(opt.value)}
                    className={`flex items-center justify-center gap-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                      active
                        ? 'text-white border-transparent'
                        : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-200 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'
                    }`}
                    style={active ? { backgroundColor: optStyle.border } : undefined}
                  >
                    <span>{optStyle.label}</span>
                    <span>{opt.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <Field label="Title" placeholder="e.g. Easy run" value={workout} onChange={setWorkout} />

          {/* Structured strength editor — only shown when type is strength.
              For other types we expose the raw detail string instead. */}
          {type === 'strength' ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Exercises</label>
                <button
                  onClick={addExercise}
                  className="text-xs font-medium px-2 py-1 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                >
                  + Add Exercise
                </button>
              </div>
              {exercises.length === 0 && (
                <p className="text-xs text-slate-400 italic py-2">Tap "Add Exercise" to list the lifts for this day.</p>
              )}
              <div className="space-y-2">
                {exercises.map((ex, idx) => (
                  <div key={idx} className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-semibold text-purple-700 dark:text-purple-300">#{idx + 1}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveExercise(idx, -1)}
                          disabled={idx === 0}
                          className="text-[10px] text-purple-500 disabled:opacity-30 hover:text-purple-700 px-1"
                          title="Move up"
                        >▲</button>
                        <button
                          onClick={() => moveExercise(idx, 1)}
                          disabled={idx === exercises.length - 1}
                          className="text-[10px] text-purple-500 disabled:opacity-30 hover:text-purple-700 px-1"
                          title="Move down"
                        >▼</button>
                        <button
                          onClick={() => removeExercise(idx)}
                          className="text-[10px] text-red-500 hover:text-red-700 ml-1"
                        >Remove</button>
                      </div>
                    </div>
                    <input
                      placeholder="Exercise name (e.g. Goblet squats)"
                      value={ex.name}
                      onChange={e => updateExercise(idx, { name: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-sm border border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 mb-1.5"
                    />
                    <div className="flex items-center gap-1.5">
                      <input
                        placeholder="Sets"
                        value={ex.sets}
                        onChange={e => updateExercise(idx, { sets: e.target.value })}
                        className="w-14 px-2 py-1 text-xs border border-purple-200 dark:border-purple-700 rounded bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                      <span className="text-[11px] text-purple-400">×</span>
                      <input
                        placeholder="Reps (e.g. 10, 10/leg, 45s)"
                        value={ex.reps}
                        onChange={e => updateExercise(idx, { reps: e.target.value })}
                        className="flex-1 px-2 py-1 text-xs border border-purple-200 dark:border-purple-700 rounded bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
              {exercises.length > 0 && (
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Saves as: <span className="font-mono">{exercisesToDetail(exercises) || '—'}</span>
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">Description</label>
              <textarea
                placeholder={`e.g. Rolling hills with Bay views. Stay aerobic.`}
                value={detail}
                onChange={e => setDetail(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Zone / pace" placeholder="Z1 (108-128)" value={zone} onChange={setZone} />
            <Field label="Time" placeholder="1 hr 10 min" value={time} onChange={setTime} />
          </div>

          <Field label="Route / location" placeholder="Bay loop, Gym" value={route} onChange={setRoute} />

          {/* Preview chip — shows the workout's new accent so the user can
              see how the card will look before saving. */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 flex items-center gap-2"
            style={{ borderLeft: `4px solid ${style.border}`, backgroundColor: style.bg }}>
            <span className="text-base">{style.label}</span>
            <span className="text-sm font-semibold text-slate-800">{workout || day.workout}</span>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-slate-800 px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2">
          {hasOverride && (
            <button
              onClick={onRevert}
              className="text-xs font-medium px-3 py-2 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
            >
              ↩ Revert to plan
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="text-sm font-medium px-3 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, placeholder, value, onChange, type = 'text' }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; type?: string
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
      />
    </div>
  )
}
