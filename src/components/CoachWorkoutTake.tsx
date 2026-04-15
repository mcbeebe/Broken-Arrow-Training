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
    <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl px-3 py-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-xl">🤖</span>
        <p className="text-sm font-bold uppercase tracking-wider text-indigo-700">Coach</p>
      </div>
      <p className="text-base text-slate-700 leading-relaxed">{take.text}</p>
      {take.tip && (
        <p className="mt-2 text-sm text-indigo-700/90 leading-relaxed">
          <span className="font-semibold">Tip:</span> {take.tip}
        </p>
      )}
    </div>
  )
}
