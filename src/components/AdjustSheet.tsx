import type { Lever } from '../utils/adjustLevers'

/**
 * The Adjust tray. Every lever says what it will do before it does it,
 * and the athlete keeps the last word: applying one leaves a sentence
 * describing what actually happened, with Undo beside it.
 */
export default function AdjustSheet({ levers, applied, onApply, onUndo, onClose }: {
  levers: Lever[]
  /** The outcome sentence of the lever just applied, if any. */
  applied: string | null
  onApply: (lever: Lever) => void
  onUndo: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full sm:max-w-md bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl p-4 pb-8"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Adjust today"
        data-testid="adjust-sheet"
      >
        <div className="w-9 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-800 dark:text-white">Adjust today</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Each one tells you what it will do first, and every one can be undone.
        </p>

        {applied ? (
          <div className="mt-4 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 p-3" data-testid="adjust-outcome">
            <p className="text-sm text-teal-900 dark:text-teal-100 leading-relaxed">{applied}</p>
            <button
              onClick={onUndo}
              className="mt-2.5 h-9 px-4 rounded-lg border border-teal-300 dark:border-teal-700 text-xs font-bold text-teal-800 dark:text-teal-200"
              data-testid="adjust-undo"
            >
              Undo
            </button>
          </div>
        ) : levers.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            Nothing to adjust today — this one is already as short and easy as it gets.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {levers.map(l => (
              <button
                key={l.id}
                onClick={() => onApply(l)}
                className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-600 px-3.5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                data-testid={`lever-${l.id}`}
              >
                <p className="text-sm font-bold text-slate-800 dark:text-white">{l.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{l.preview}</p>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full h-11 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300"
        >
          {applied ? 'Done' : 'Not now'}
        </button>
      </div>
    </div>
  )
}
