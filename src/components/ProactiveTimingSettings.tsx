import type { TimeOption } from '../hooks/useProactiveTimingPreference'
import { MORNING_OPTIONS, EVENING_OPTIONS } from '../hooks/useProactiveTimingPreference'

interface Props {
  morningHour: number
  eveningHour: number
  onSaveMorningHour: (hour: number) => void
  onSaveEveningHour: (hour: number) => void
}

function TimeGrid({
  options,
  selected,
  onSelect,
}: {
  options: TimeOption[]
  selected: number
  onSelect: (hour: number) => void
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {options.map(opt => {
        const isSelected = opt.hour === selected
        return (
          <button
            key={opt.hour}
            type="button"
            onClick={() => onSelect(opt.hour)}
            className={`px-1.5 py-1.5 rounded-lg border text-center transition-colors ${
              isSelected
                ? 'bg-teal-100 border-teal-300 text-teal-900 dark:bg-teal-900 dark:border-teal-700 dark:text-teal-100'
                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600'
            }`}
            aria-pressed={isSelected}
          >
            <span className="text-xs font-medium">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * "Proactive coaching" — Settings → Coach surface for WHEN the coach speaks.
 * Your coach gives a morning read and an evening read; pick when each begins.
 * The evening time is also when Summary reveals tomorrow's workout. The
 * post-workout debrief is separate and unaffected.
 */
export default function ProactiveTimingSettings({
  morningHour,
  eveningHour,
  onSaveMorningHour,
  onSaveEveningHour,
}: Props) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <span aria-hidden>⏱️</span> Proactive coaching
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
          Your coach gives a morning read and an evening read — pick when each begins.
          The post-workout debrief is separate.
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Morning</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
          When the morning read (today's plan) begins.
        </p>
        <TimeGrid options={MORNING_OPTIONS} selected={morningHour} onSelect={onSaveMorningHour} />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Evening</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
          When the evening read (tomorrow + recovery) begins — and when tomorrow's
          workout appears on the Summary tab.
        </p>
        <TimeGrid options={EVENING_OPTIONS} selected={eveningHour} onSelect={onSaveEveningHour} />
      </div>
    </div>
  )
}
