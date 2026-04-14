import { useState } from 'react'
import type { ActualWorkout, StrengthExerciseLog, StrengthSet } from '../types'

type LogMode = 'run' | 'strength'

interface ManualLogProps {
  dayLabel: string
  existing?: ActualWorkout
  onSave: (data: ActualWorkout) => void
  onClose: () => void
}

export default function ManualLog({ dayLabel, existing, onSave, onClose }: ManualLogProps) {
  const [mode, setMode] = useState<LogMode>(existing?.strengthLog ? 'strength' : 'run')
  const [name, setName] = useState(existing?.name || '')
  const [time, setTime] = useState(existing ? String(Math.round(existing.movingTime / 60)) : '')
  const [hr, setHr] = useState(existing?.avgHR?.toString() || '')
  const [notes, setNotes] = useState(existing?.notes || '')
  const [rpe, setRpe] = useState(existing?.rpe?.toString() || '')

  // Run fields
  const [distance, setDistance] = useState(existing?.distance?.toString() || '')
  const [elevation, setElevation] = useState(existing?.elevationGain?.toString() || '')

  // Strength fields
  const [exercises, setExercises] = useState<StrengthExerciseLog[]>(
    existing?.strengthLog || []
  )

  function handleSave() {
    const entry: ActualWorkout = {
      ...existing,                    // Preserve ALL existing fields (Garmin HR, TE, EPOC, zones, etc.)
      stravaId: existing?.stravaId || Date.now(),
      distance: mode === 'run' ? (parseFloat(distance) || 0) : (existing?.distance ?? 0),
      movingTime: (parseInt(time) || 0) * 60,
      elapsedTime: (parseInt(time) || 0) * 60,
      avgHR: parseInt(hr) || existing?.avgHR,
      maxHR: existing?.maxHR,         // Preserve (was hardcoded to undefined)
      elevationGain: mode === 'run' ? (parseInt(elevation) || 0) : (existing?.elevationGain ?? 0),
      type: existing?.type || 'Manual',
      name: name || (mode === 'strength' ? `Strength — ${dayLabel}` : `Run — ${dayLabel}`),
      startDate: existing?.startDate || new Date().toISOString(),
      notes,
      rpe: parseInt(rpe) || existing?.rpe || undefined,
      strengthLog: mode === 'strength' ? exercises : existing?.strengthLog,
    }
    onSave(entry)
  }

  function addExercise() {
    setExercises([...exercises, { name: '', focus: 'full', sets: [{ reps: 0, weight: '' }] }])
  }

  function updateExercise(idx: number, updates: Partial<StrengthExerciseLog>) {
    setExercises(exercises.map((ex, i) => i === idx ? { ...ex, ...updates } : ex))
  }

  function removeExercise(idx: number) {
    setExercises(exercises.filter((_, i) => i !== idx))
  }

  function addSet(exIdx: number) {
    const ex = exercises[exIdx]
    const lastSet = ex.sets[ex.sets.length - 1]
    updateExercise(exIdx, {
      sets: [...ex.sets, { reps: lastSet?.reps || 0, weight: lastSet?.weight || '' }]
    })
  }

  function updateSet(exIdx: number, setIdx: number, updates: Partial<StrengthSet>) {
    const ex = exercises[exIdx]
    updateExercise(exIdx, {
      sets: ex.sets.map((s, i) => i === setIdx ? { ...s, ...updates } : s)
    })
  }

  function removeSet(exIdx: number, setIdx: number) {
    const ex = exercises[exIdx]
    if (ex.sets.length <= 1) return
    updateExercise(exIdx, { sets: ex.sets.filter((_, i) => i !== setIdx) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-4 pt-4 pb-3 border-b border-slate-200 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800">Log Workout — {dayLabel}</h3>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-600">✕</button>
          </div>

          {/* Mode toggle */}
          <div className="flex mt-3 rounded-lg overflow-hidden border border-slate-200">
            <button
              onClick={() => setMode('run')}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                mode === 'run' ? 'bg-teal-600 text-white' : 'bg-white text-slate-600'
              }`}
            >
              🏃 Run / Cardio
            </button>
            <button
              onClick={() => setMode('strength')}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                mode === 'strength' ? 'bg-purple-600 text-white' : 'bg-white text-slate-600'
              }`}
            >
              💪 Strength
            </button>
          </div>
        </div>

        <div className="px-4 py-4 space-y-3">
          <Field label="Activity name" placeholder={mode === 'strength' ? 'BFT Class, Gym Session, etc.' : 'Morning Run, Trail Run, etc.'} value={name} onChange={setName} />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Time (min)" placeholder="50" value={time} onChange={setTime} type="number" />
            <Field label="Avg HR (bpm)" placeholder="130" value={hr} onChange={setHr} type="number" />
          </div>

          {/* Run-specific fields */}
          {mode === 'run' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Distance (mi)" placeholder="3.5" value={distance} onChange={setDistance} type="number" />
              <Field label="Elevation (ft)" placeholder="350" value={elevation} onChange={setElevation} type="number" />
            </div>
          )}

          {/* Strength-specific fields */}
          {mode === 'strength' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-600">Exercises</p>
                <button
                  onClick={addExercise}
                  className="text-xs font-medium px-2 py-1 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                >
                  + Add Exercise
                </button>
              </div>

              {exercises.length === 0 && (
                <p className="text-xs text-slate-400 italic py-2">Tap "Add Exercise" to log your lifts</p>
              )}

              <div className="space-y-3">
                {exercises.map((ex, exIdx) => (
                  <ExerciseEntry
                    key={exIdx}
                    exercise={ex}
                    index={exIdx}
                    onUpdate={(updates) => updateExercise(exIdx, updates)}
                    onRemove={() => removeExercise(exIdx)}
                    onAddSet={() => addSet(exIdx)}
                    onUpdateSet={(setIdx, updates) => updateSet(exIdx, setIdx, updates)}
                    onRemoveSet={(setIdx) => removeSet(exIdx, setIdx)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* RPE — Rate of Perceived Exertion */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              How hard did it feel? (RPE)
            </label>
            <div className="flex gap-1">
              {[1,2,3,4,5,6,7,8,9,10].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRpe(val.toString())}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
                    parseInt(rpe) === val
                      ? val <= 3 ? 'bg-green-500 text-white'
                        : val <= 6 ? 'bg-amber-500 text-white'
                        : val <= 8 ? 'bg-orange-500 text-white'
                        : 'bg-red-500 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">1 = barely felt it · 5 = moderate · 8 = very hard · 10 = max effort</p>
          </div>

          <Field label="Notes" placeholder={mode === 'strength' ? 'How did it feel? Energy level? Anything to remember...' : 'Felt good, walked the steep hills...'} value={notes} onChange={setNotes} />

          <button
            onClick={handleSave}
            className={`w-full font-semibold py-3 rounded-xl transition-colors mt-2 text-white ${
              mode === 'strength' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-teal-600 hover:bg-teal-700'
            }`}
          >
            {existing ? 'Update' : 'Save Workout'}
          </button>
        </div>

        <div className="h-6" />
      </div>
    </div>
  )
}

const FOCUS_OPTIONS: { value: StrengthExerciseLog['focus']; label: string }[] = [
  { value: 'upper', label: 'Upper' },
  { value: 'lower', label: 'Lower' },
  { value: 'core', label: 'Core' },
  { value: 'full', label: 'Full Body' },
]

function ExerciseEntry({ exercise, index, onUpdate, onRemove, onAddSet, onUpdateSet, onRemoveSet }: {
  exercise: StrengthExerciseLog
  index: number
  onUpdate: (updates: Partial<StrengthExerciseLog>) => void
  onRemove: () => void
  onAddSet: () => void
  onUpdateSet: (setIdx: number, updates: Partial<StrengthSet>) => void
  onRemoveSet: (setIdx: number) => void
}) {
  return (
    <div className="bg-purple-50 rounded-xl p-3 border border-purple-200">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-purple-600">Exercise {index + 1}</span>
        <button onClick={onRemove} className="text-xs text-red-500 hover:text-red-700">Remove</button>
      </div>

      <input
        placeholder="Exercise name (e.g., Back Squat, DB Bench Press)"
        value={exercise.name}
        onChange={e => onUpdate({ name: e.target.value })}
        className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
      />

      {/* Focus area */}
      <div className="flex gap-1 mb-2">
        {FOCUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onUpdate({ focus: opt.value })}
            className={`flex-1 py-1 text-[10px] font-medium rounded transition-colors ${
              exercise.focus === opt.value
                ? 'bg-purple-600 text-white'
                : 'bg-white text-purple-600 border border-purple-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Sets */}
      <div className="space-y-1.5">
        {exercise.sets.map((set, setIdx) => (
          <div key={setIdx} className="flex items-center gap-2">
            <span className="text-[10px] text-purple-400 w-4 shrink-0">S{setIdx + 1}</span>
            <input
              type="number"
              placeholder="Reps"
              value={set.reps || ''}
              onChange={e => onUpdateSet(setIdx, { reps: parseInt(e.target.value) || 0 })}
              className="w-16 px-2 py-1 text-xs border border-purple-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
            <span className="text-[10px] text-purple-400">×</span>
            <input
              placeholder="Weight (e.g., 135 lb, BW)"
              value={set.weight}
              onChange={e => onUpdateSet(setIdx, { weight: e.target.value })}
              className="flex-1 px-2 py-1 text-xs border border-purple-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
            {exercise.sets.length > 1 && (
              <button onClick={() => onRemoveSet(setIdx)} className="text-[10px] text-red-400 hover:text-red-600">✕</button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={onAddSet}
        className="text-[10px] text-purple-600 hover:text-purple-800 mt-1.5 font-medium"
      >
        + Add Set
      </button>
    </div>
  )
}

function Field({ label, placeholder, value, onChange, type = 'text' }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; type?: string
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 block mb-1">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
      />
    </div>
  )
}
