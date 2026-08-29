import type { RhythmDay } from '../utils/rhythm'

/**
 * The resolve strip — one open day, asked about once.
 *
 * A planned session nobody logged used to be invisible on Today: the page
 * simply moved on, and the weekly narrative quietly counted it as rest.
 * This asks about it, in neutral grey, using the word "open" — never
 * "missed", and never red. It is a question, not an accusation, and
 * resolving it is one tap away.
 *
 * Only the most recent open day is shown. A wall of chips for a bad
 * fortnight is exactly the shame spiral this design exists to avoid.
 */
export default function ResolveStrip({ day, onResolve }: {
  day: RhythmDay | null
  onResolve: (day: RhythmDay) => void
}) {
  if (!day) return null
  return (
    <button
      type="button"
      onClick={() => onResolve(day)}
      className="w-full flex items-center gap-2.5 bg-white dark:bg-slate-800 rounded-xl px-3.5 py-2.5 shadow-sm border border-slate-100 dark:border-slate-700 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
      data-testid="resolve-strip"
    >
      <span
        className="w-3 h-3 rounded-full border-2 border-slate-400 dark:border-slate-500 box-border shrink-0"
        aria-hidden="true"
      />
      <span className="flex-1 min-w-0 text-xs text-slate-600 dark:text-slate-300">
        {day.label}&rsquo;s {day.workout ?? 'session'} is still open
      </span>
      <span className="text-xs font-bold text-teal-700 dark:text-teal-300 shrink-0">resolve ›</span>
    </button>
  )
}
