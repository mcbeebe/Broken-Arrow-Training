import type { PlannedDay } from '../types'

/**
 * The Evening Close — the other half of the ritual.
 *
 * The day gets resolved, whatever happened to it, and tomorrow gets
 * staged. This is where the coach's notes are finally allowed to speak:
 * they are held out of the morning on purpose, because nothing in them
 * changes what the athlete does in the next hour, and the morning is for
 * the next hour.
 */
export default function EveningCloseCard({
  today, tomorrow, notesWaiting, notesInline = false, closed, lightsOut,
  onOpenNotes, onOpenTomorrow, onClose,
}: {
  today: PlannedDay | null
  tomorrow: PlannedDay | null
  /** How many coach proposals are waiting on a decision. */
  notesWaiting: number
  /**
   * True when the proposals themselves render directly below this card. The
   * row is then suppressed: a button offering to take you somewhere else,
   * sitting on top of the thing it points at, is a lie about where you are.
   */
  notesInline?: boolean
  closed: boolean
  /** e.g. "9:40pm" — when to be asleep for tomorrow's session. */
  lightsOut?: string | null
  onOpenNotes: () => void
  onOpenTomorrow: () => void
  onClose: () => void
}) {
  const trained = !!today?.actual
  const restDay = today?.type === 'rest'
  // A day the plan does not cover at all is not "open" — there was never
  // anything to do. Saying otherwise invents an obligation, which is the
  // opposite of what the resolved-day vocabulary is for. This is the state
  // between blocks, and after a plan ends.
  const unplanned = !today

  return (
    <div
      className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700"
      data-testid="evening-close"
      data-closed={closed ? 'yes' : 'no'}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
        Evening close
      </p>

      {/* The day's receipt. Every ending is a resolution — trained, rested
          as planned, or left open — and none of them is a failure. */}
      <p className="text-base font-bold text-slate-800 dark:text-white mt-1" data-testid="evening-headline">
        {unplanned ? 'Nothing on the plan today.'
          : trained ? 'Today is resolved.'
          : restDay ? 'Rest day — resolved.'
          : 'Today is still open.'}
      </p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
        {unplanned ? 'Your plan does not cover today. Nothing is owed, and nothing is open.'
          : trained ? `${today.workout} is logged.`
          : restDay ? 'The plan asked for rest and you took it. That counts.'
          : `${today.workout} has nothing logged against it — resolve it above, or let it carry to the morning.`}
      </p>

      {notesWaiting > 0 && !notesInline && (
        <button
          onClick={onOpenNotes}
          className="mt-3 w-full flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-600 px-3.5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
          data-testid="evening-notes"
        >
          <span className="text-xs text-slate-600 dark:text-slate-300">
            <span className="font-bold text-slate-700 dark:text-slate-200">
              Coach noted {notesWaiting} thing{notesWaiting === 1 ? '' : 's'}
            </span>
            {' '}— ready when you are
          </span>
          <span className="text-sm text-slate-400">›</span>
        </button>
      )}

      {tomorrow && (
        <button
          onClick={onOpenTomorrow}
          className="mt-2.5 w-full text-left rounded-xl border border-slate-100 dark:border-slate-700 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
          data-testid="evening-tomorrow"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
            Tomorrow&rsquo;s ticket
          </p>
          <p className="text-sm font-semibold text-slate-800 dark:text-white">
            {tomorrow.workout}
            {tomorrow.time && tomorrow.time !== '—' && (
              <span className="font-normal text-slate-500 dark:text-slate-400"> · {tomorrow.time}</span>
            )}
          </p>
          {lightsOut && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
              🌙 Lights out by <span className="font-semibold">{lightsOut}</span> — tomorrow leans on it.
            </p>
          )}
        </button>
      )}

      <button
        onClick={onClose}
        disabled={closed}
        className="mt-3 w-full h-11 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-bold"
        data-testid="close-the-day"
      >
        {closed ? 'Day closed ✓' : 'Close the day'}
      </button>
      <p className="mt-2 text-[10px] text-slate-400 text-center leading-snug">
        {closed
          ? 'Tomorrow’s check is armed. See you then.'
          : 'Closing marks today resolved and arms tomorrow’s morning check.'}
      </p>
    </div>
  )
}
