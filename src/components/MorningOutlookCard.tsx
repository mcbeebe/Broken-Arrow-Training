import type { OutlookCard } from '../hooks/useMorningOutlook'

/**
 * The morning card (Adaptive Engine phase 3, PR 8 — the Daily
 * Autopilot mockup): the same-day adjustment the autopilot already
 * applied, with its reason, its evidence, and the two honest buttons —
 * "Sounds right" keeps it, the revert button undoes it in one tap.
 * Renders only on days the engine acted; green-light days stay quiet.
 */

const REVERT_LABEL: Record<OutlookCard['verdict'], string> = {
  'swap': 'Do the hard session anyway',
  'trim': 'Do the full session',
  'heat-repace': 'Keep the original paces',
  'confirm': 'Keep as planned',
}

export default function MorningOutlookCard({ card, score, onSoundsRight, onRevert }: {
  card: OutlookCard
  /** Today's 0-100 readiness display score, when known. */
  score?: number | null
  onSoundsRight: () => void
  onRevert: () => void
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700" data-testid="morning-outlook">
      <div className="flex items-start gap-3">
        {score != null && (
          <div className="w-11 h-11 rounded-full bg-rose-50 dark:bg-rose-950 border-2 border-rose-300 dark:border-rose-800 flex items-center justify-center shrink-0">
            <span className="text-base font-bold text-rose-600 dark:text-rose-300">{score}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 dark:text-white">{card.headline}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">{card.why}</p>
        </div>
      </div>

      {card.before && card.after && (
        <div className="mt-3 border border-slate-100 dark:border-slate-700 rounded-xl px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
            Today's session — adjusted
          </p>
          <p className="text-xs text-slate-400 line-through">{card.before}</p>
          <p className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5">{card.after}</p>
          {card.movedToDay && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              The hard session moved to <span className="font-semibold">{card.movedToDay}</span> — moved, never deleted.
            </p>
          )}
        </div>
      )}

      {card.evidence.length > 0 && (
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {card.evidence.slice(0, 3).map(row => (
            <div key={row.label} className="bg-slate-50 dark:bg-slate-900 rounded-lg px-2 py-1.5">
              <p className="text-[9px] text-slate-400 leading-tight">{row.label}</p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-0.5">{row.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={onSoundsRight}
          className="flex-1 h-10 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold"
        >
          Sounds right
        </button>
        <button
          onClick={onRevert}
          className="flex-1 h-10 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-semibold"
          data-testid="outlook-revert"
        >
          {REVERT_LABEL[card.verdict]}
        </button>
      </div>

      <p className="mt-2.5 text-[10px] text-slate-400 leading-snug">
        Autopilot adjusts today only. Future days are proposals; race week is never touched. Every change is in the log, with undo.
      </p>
    </div>
  )
}
