import { useEffect, useState, type ReactNode } from 'react'
import { IMPORT_PROBLEMS, spentLine, type ImportProblem } from '../utils/planImport/importErrors'

/**
 * The two screens between "read my plan" and the review (initiative 004):
 * reading, and a read that failed. Shared by the Settings upload sheet and
 * onboarding, so an athlete sees the same words in both.
 */

/** A plan being read: the file's name, the seconds so far, and Cancel. */
export function PlanReading({ sourceName, startedAt, onCancel }: {
  sourceName: string
  /** When the read started (ms since the epoch). */
  startedAt: number
  onCancel: () => void
}) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])

  return (
    <div className="py-8 flex flex-col items-center text-center gap-3" data-testid="plan-import-reading" aria-live="polite">
      <div className="w-10 h-10 rounded-full border-4 border-teal-200 border-t-teal-600 animate-spin" aria-hidden="true" />
      <p className="font-semibold text-slate-800 dark:text-slate-100">Reading {sourceName}…</p>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
        This can take a minute or two for a long plan. Keep this screen open.
      </p>
      {/* Seen, not announced: inside the live region it would be read out every second. */}
      <p className="text-xs text-slate-400 tabular-nums" aria-hidden="true">{elapsed}s</p>
      <button type="button" onClick={onCancel} className="mt-2 min-h-[44px] px-5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-700 dark:text-slate-200">
        Cancel
      </button>
    </div>
  )
}

/**
 * A read that failed: what went wrong, whether it used one of the day's
 * uploads, and what usually works. The way forward is the caller's buttons.
 */
export function PlanImportProblem({ problem, sourceName, limit, note, children }: {
  problem: ImportProblem
  sourceName?: string
  /** The daily upload limit, when that is what was hit. */
  limit?: number
  /** A line under the explanation, e.g. that the current plan is untouched. */
  note?: string
  children: ReactNode
}) {
  const copy = IMPORT_PROBLEMS[problem]
  return (
    <div className="space-y-4" data-testid="plan-import-error" role="alert">
      <div className="text-center space-y-2 py-2">
        <p className="text-lg font-bold text-slate-900 dark:text-white">{copy.title}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {sourceName ? <><span className="font-medium">{sourceName}</span>: </> : null}
          {copy.body}
          {limit !== undefined ? ` You can upload ${limit} plans a day.` : ''}
        </p>
        {note && <p className="text-sm text-slate-600 dark:text-slate-300">{note}</p>}
        <p className="text-xs text-slate-500 dark:text-slate-400">{spentLine(copy.spent)}</p>
      </div>
      {copy.tips && (
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">What usually works</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">· The page or sheet that lists each week&rsquo;s sessions</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">· A clear photo or screenshot of the schedule, one page at a time</p>
        </div>
      )}
      {children}
    </div>
  )
}
