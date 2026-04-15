import type { CoachWorkoutTake } from '../utils/coachNotes'

interface Props {
  take: CoachWorkoutTake
}

/**
 * Coach's take rendered at the top of the WorkoutModal, above the
 * detail sections. 2-3 sentence read of the day + an optional tip.
 */
export default function CoachWorkoutTakeView({ take }: Props) {
  return (
    <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-base">🤖</span>
        <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Coach</p>
      </div>
      <p className="text-xs text-slate-700 leading-snug">{take.text}</p>
      {take.tip && (
        <p className="mt-1.5 text-[11px] text-indigo-700/90 leading-snug">
          <span className="font-semibold">Tip:</span> {take.tip}
        </p>
      )}
    </div>
  )
}
