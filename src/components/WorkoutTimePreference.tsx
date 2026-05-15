import type { WorkoutTimeSlot } from '../hooks/useWorkoutTimePreference'
import { WORKOUT_TIME_OPTIONS } from '../hooks/useWorkoutTimePreference'

interface Props {
  slot: WorkoutTimeSlot
  onSave: (next: WorkoutTimeSlot) => void
}

/**
 * "When do you usually train?" — Settings → Coach surface for the
 * preferred workout time slot.
 *
 * Drives the per-hour weather chip on DayCards + Summary so the
 * temperature/precip/wind reflects when the athlete actually runs.
 * Default is "Morning" (~8am) for athletes who never touch this; the
 * "Varies" option falls back to the daily aggregate forecast.
 */
export default function WorkoutTimePreference({ slot, onSave }: Props) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 space-y-2.5">
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <span aria-hidden>⏰</span> When do you usually train?
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
          Sets the hour the weather chip on each day card targets.
          Hourly forecast covers ~7 days; older days fall back to the daily aggregate.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {WORKOUT_TIME_OPTIONS.map(opt => {
          const isSelected = opt.slot === slot
          return (
            <button
              key={opt.slot}
              type="button"
              onClick={() => onSave(opt.slot)}
              className={`text-left px-2.5 py-1.5 rounded-lg border transition-colors ${
                isSelected
                  ? 'bg-teal-100 border-teal-300 text-teal-900 dark:bg-teal-900 dark:border-teal-700 dark:text-teal-100'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600'
              }`}
              aria-pressed={isSelected}
            >
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{opt.description}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
