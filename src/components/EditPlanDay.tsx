import { useState } from 'react'
import type { PlannedDay, WorkoutType } from '../types'

interface EditPlanDayProps {
  day: PlannedDay
  weekNum: number
  hasOverride: boolean
  onSave: (updates: Partial<Omit<PlannedDay, 'day' | 'actual'>>) => void
  onResetToPlan: () => void
  onClose: () => void
}

const WORKOUT_TYPES: { value: WorkoutType; label: string }[] = [
  { value: 'run', label: 'Run' },
  { value: 'quality', label: 'Quality / intervals' },
  { value: 'long', label: 'Long run' },
  { value: 'race', label: 'Race' },
  { value: 'strength', label: 'Strength' },
  { value: 'cross', label: 'Cross-train' },
  { value: 'limited', label: 'Limited / recovery' },
  { value: 'rest', label: 'Rest' },
  { value: 'travel', label: 'Travel' },
]

/**
 * Manual editor for the *planned* side of a day. Edits persist as a
 * per-day override in usePlanOverrides, layered on top of the original
 * plan. "Reset to plan" clears the override and restores the original.
 */
export default function EditPlanDay({ day, weekNum, hasOverride, onSave, onResetToPlan, onClose }: EditPlanDayProps) {
  const [type, setType] = useState<WorkoutType>(day.type)
  const [workout, setWorkout] = useState(day.workout)
  const [zone, setZone] = useState(day.zone)
  const [time, setTime] = useState(day.time)
  const [route, setRoute] = useState(day.route)
  const [detail, setDetail] = useState(day.detail)

  const handleSave = () => {
    onSave({
      type,
      workout: workout.trim(),
      zone: zone.trim() || '—',
      time: time.trim() || '—',
      route: route.trim() || '—',
      detail: detail.trim(),
    })
    onClose()
  }

  const handleReset = () => {
    onResetToPlan()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-slate-800 px-4 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 dark:text-white">
              Edit plan — {day.day}{weekNum ? ` · Wk ${weekNum}` : ''}
            </h3>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">✕</button>
          </div>
          {hasOverride && (
            <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 rounded px-2 py-1">
              This day has manual edits. Use “Reset to plan” to restore the original.
            </p>
          )}
        </div>

        <div className="px-4 py-4 space-y-4">
          <Field label="Workout title">
            <input
              type="text"
              value={workout}
              onChange={e => setWorkout(e.target.value)}
              placeholder="Easy run"
              className="input"
            />
          </Field>

          <Field label="Type">
            <select
              value={type}
              onChange={e => setType(e.target.value as WorkoutType)}
              className="input"
            >
              {WORKOUT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>

          <Field
            label="Zone / distance"
            hint='Format e.g. "3.0 mi · Z1–2 (108–148)" or "Z4 (167–177)". The number in parentheses is the HR target the grade is judged against.'
          >
            <input
              type="text"
              value={zone}
              onChange={e => setZone(e.target.value)}
              placeholder="3.0 mi · Z1–2 (108–148)"
              className="input"
            />
          </Field>

          <Field label="Time" hint='e.g. "45 min", "1 hr", "1 hr 15 min"'>
            <input
              type="text"
              value={time}
              onChange={e => setTime(e.target.value)}
              placeholder="45 min"
              className="input"
            />
          </Field>

          <Field label="Route">
            <input
              type="text"
              value={route}
              onChange={e => setRoute(e.target.value)}
              placeholder="Temescal Lake"
              className="input"
            />
          </Field>

          <Field label="Detail / instructions" hint="Drill items can be entered as a list separated by ·">
            <textarea
              value={detail}
              onChange={e => setDetail(e.target.value)}
              rows={4}
              placeholder="Conversational pace · A-skips 2×30m · Strides 4×100m"
              className="input resize-y"
            />
          </Field>
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-slate-800 px-4 pt-3 pb-4 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2">
          {hasOverride && (
            <button
              type="button"
              onClick={handleReset}
              className="text-xs font-medium text-rose-700 dark:text-rose-400 hover:underline mr-auto"
            >
              ↩ Reset to plan
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white"
          >
            Save
          </button>
        </div>
      </div>

      <style>{`
        .input {
          width: 100%;
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid rgb(203 213 225);
          background: white;
          font-size: 14px;
          color: rgb(30 41 59);
        }
        .dark .input {
          background: rgb(30 41 59);
          border-color: rgb(71 85 105);
          color: rgb(241 245 249);
        }
        .input:focus {
          outline: 2px solid rgb(20 184 166);
          outline-offset: -1px;
          border-color: transparent;
        }
      `}</style>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">{label}</span>
      {children}
      {hint && <span className="block mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{hint}</span>}
    </label>
  )
}
