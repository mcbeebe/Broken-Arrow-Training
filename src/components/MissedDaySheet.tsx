import type { PlannedDay } from '../types'
import type { ReplanKind } from '../engines/planGenerator/replanLog'

/**
 * Phase 5 (PRD-110) — the way an athlete tells the plan that life
 * happened. Three choices, each one of the deterministic replan rules.
 *
 * The copy carries the doctrine the engine enforces: missed work is never
 * made up, the plan only ever bends forward, and nothing here adds
 * volume. That promise is the reason this is safe to tap.
 */

interface MissedDaySheetProps {
  day: PlannedDay
  /** Already replanned — offer the undo instead of re-applying. */
  hasReplan: boolean
  onChoose: (kind: ReplanKind) => void
  onUndo: () => void
  onClose: () => void
}

const KEY_TYPES = new Set(['quality', 'long'])

export default function MissedDaySheet({ day, hasReplan, onChoose, onUndo, onClose }: MissedDaySheetProps) {
  const isKeySession = KEY_TYPES.has(day.type)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Missed workout options"
      >
        <div className="px-5 pt-5 pb-3 border-b border-slate-200 dark:border-slate-700">
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100">Missed {day.day}?</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {day.workout} — nothing here adds mileage back. The plan bends forward, never backward.
          </p>
        </div>

        <div className="p-4 space-y-2">
          {hasReplan ? (
            <button
              onClick={() => { onUndo(); onClose() }}
              className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <p className="font-semibold text-slate-800 dark:text-slate-100">↩ Undo — put this day back</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Restores the original workout and the week's volume target.
              </p>
            </button>
          ) : (
            <>
              <button
                onClick={() => { onChoose('skip'); onClose() }}
                className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <p className="font-semibold text-slate-800 dark:text-slate-100">Skip it</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  The week gets lighter and moves on. One missed session changes nothing about your race.
                </p>
              </button>

              {isKeySession && (
                <button
                  onClick={() => { onChoose('move'); onClose() }}
                  className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <p className="font-semibold text-slate-800 dark:text-slate-100">Move it later this week</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    Only if a later easy day has room and enough space before the next hard one — otherwise it's skipped
                    instead. Hard days never end up stacked.
                  </p>
                </button>
              )}

              <button
                onClick={() => { onChoose('illness'); onClose() }}
                className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <p className="font-semibold text-slate-800 dark:text-slate-100">I was sick — ease me back in</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Two easy days from here before anything hard. Never train hard with a fever.
                </p>
              </button>
            </>
          )}
        </div>

        <div className="px-4 pb-4">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
