import type { TimeOption } from '../hooks/useProactiveTimingPreference'
import { CARD_TIME_OPTIONS, COACH_EVENING_OPTIONS } from '../hooks/useProactiveTimingPreference'

interface Props {
  cardHour: number
  coachEveningHour: number
  onSaveCardHour: (hour: number) => void
  onSaveCoachEveningHour: (hour: number) => void
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
 * "Proactive coaching" — Settings → Coach surface for WHEN the app speaks up:
 * when the Summary tab reveals tomorrow's workout, and when the coach flips
 * from its morning read to its evening read. The coach speaks twice a day
 * (morning + evening); the post-workout debrief is separate and unaffected.
 */
export default function ProactiveTimingSettings({
  cardHour,
  coachEveningHour,
  onSaveCardHour,
  onSaveCoachEveningHour,
}: Props) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <span aria-hidden>⏱️</span> Proactive coaching
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
          When the app speaks up. Your coach gives a morning read and an evening read —
          pick when evening begins. The post-workout debrief is separate.
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Show tomorrow's workout at
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
          Reveals tomorrow's session on the Summary tab so you can plan the evening.
        </p>
        <TimeGrid options={CARD_TIME_OPTIONS} selected={cardHour} onSelect={onSaveCardHour} />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Evening coaching starts at
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
          Before this it's a morning read (today's plan); at/after, an evening read
          (tomorrow + recovery).
        </p>
        <TimeGrid options={COACH_EVENING_OPTIONS} selected={coachEveningHour} onSelect={onSaveCoachEveningHour} />
      </div>
    </div>
  )
}
