import { useState } from 'react'
import type { ActualWorkout } from '../types'

interface ManualLogProps {
  dayLabel: string
  existing?: ActualWorkout
  onSave: (data: ActualWorkout) => void
  onClose: () => void
}

export default function ManualLog({ dayLabel, existing, onSave, onClose }: ManualLogProps) {
  const [distance, setDistance] = useState(existing?.distance?.toString() || '')
  const [time, setTime] = useState(existing ? formatMinutes(existing.movingTime) : '')
  const [hr, setHr] = useState(existing?.avgHR?.toString() || '')
  const [elevation, setElevation] = useState(existing?.elevationGain?.toString() || '')
  const [name, setName] = useState(existing?.name || '')
  const [notes, setNotes] = useState('')

  function handleSave() {
    const entry: ActualWorkout = {
      stravaId: Date.now(),
      distance: parseFloat(distance) || 0,
      movingTime: parseMinutesToSeconds(time),
      elapsedTime: parseMinutesToSeconds(time),
      avgHR: parseInt(hr) || undefined,
      maxHR: undefined,
      elevationGain: parseInt(elevation) || 0,
      type: 'Manual',
      name: name || `Workout - ${dayLabel}`,
      startDate: new Date().toISOString(),
    }
    onSave(entry)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800">Log Workout — {dayLabel}</h3>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-600">✕</button>
          </div>
        </div>

        <div className="px-4 py-4 space-y-3">
          <Field label="Activity name" placeholder="Morning Run, Gym, etc." value={name} onChange={setName} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Distance (mi)" placeholder="3.5" value={distance} onChange={setDistance} type="number" />
            <Field label="Time (min)" placeholder="45" value={time} onChange={setTime} type="number" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Avg HR (bpm)" placeholder="105" value={hr} onChange={setHr} type="number" />
            <Field label="Elevation (ft)" placeholder="350" value={elevation} onChange={setElevation} type="number" />
          </div>
          <Field label="Notes (optional)" placeholder="Felt good, walked the steep hills..." value={notes} onChange={setNotes} />

          <button
            onClick={handleSave}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 rounded-xl transition-colors mt-2"
          >
            {existing ? 'Update' : 'Save Workout'}
          </button>
        </div>

        <div className="h-4" />
      </div>
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

function formatMinutes(seconds: number): string {
  return String(Math.round(seconds / 60))
}

function parseMinutesToSeconds(min: string): number {
  return (parseInt(min) || 0) * 60
}
