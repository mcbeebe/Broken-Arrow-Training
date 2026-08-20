import { useEffect, useMemo, useRef } from 'react'
import type { CoachSnapshot } from '../types'
import { useCoachInsight } from '../hooks/useCoachInsight'
import { coachApiAvailable } from '../utils/coachApi'
import { renderMarkdown } from '../utils/markdown'
import { recapToMarkdown, type WeeklyRecap } from '../engines/coach/weeklyRecap'

interface Props {
  recap: WeeklyRecap
  athleteId: string
  snapshot?: CoachSnapshot | null
  onClose: () => void
  /** Archive the recap into the coach conversation. Called once, on first
   *  paint, so a week lands in chat history even if this is never opened
   *  again. */
  onArchive?: (markdown: string) => void
  /** Offered when two consecutive weeks fell short — jumps to the plan. */
  onRebuildPlan?: () => void
}

/**
 * The Sunday recap overlay: the week, told back to the athlete, once.
 *
 * The numbers are deterministic (engines/coach/weeklyRecap) and render
 * immediately; the coach's voice arrives over the top when the API is
 * reachable. If it isn't, the built-in prose ships — the athlete never
 * gets an empty card in exchange for a week of work.
 */
export default function WeeklyRecapOverlay({
  recap, athleteId, snapshot, onClose, onArchive, onRebuildPlan,
}: Props) {
  const apiAvailable = coachApiAvailable()

  const { insight, loading } = useCoachInsight({
    athleteId,
    surface: 'weekly_recap',
    snapshot: snapshot ?? null,
    enabled: apiAvailable && !!snapshot,
  })

  const fallback = useMemo(() => recapToMarkdown(recap), [recap])
  const voice = insight?.text?.trim()
  const body = voice || fallback

  // Archive exactly once per mount, and only after we know which text we
  // are keeping — archiving the fallback and then showing the coach's
  // version would leave two different weeks in one history.
  const archived = useRef(false)
  useEffect(() => {
    if (archived.current) return
    if (apiAvailable && loading) return
    archived.current = true
    onArchive?.(voice ? `${recap.title} — ${recap.headline}\n\n${voice}` : fallback)
  }, [apiAvailable, loading, voice, fallback, recap.title, recap.headline, onArchive])

  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo(0, 0)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Your week in review"
    >
      <div className="bg-white dark:bg-slate-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-br from-slate-800 to-slate-900 text-white px-4 py-4 rounded-t-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Your week in review</p>
              <p className="text-lg font-bold mt-0.5">{recap.title}</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-slate-300 hover:text-white text-xl leading-none shrink-0"
            >
              ×
            </button>
          </div>
          <p className="text-sm text-slate-200 mt-2 leading-relaxed">{recap.headline}</p>
        </div>

        {/* The numbers — always instant, never waiting on a model. */}
        {recap.stats.length > 0 && (
          <div className="grid grid-cols-3 gap-2 px-4 pt-4">
            {recap.stats.map(s => (
              <div key={s.label} className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{s.label}</p>
                <p className="text-base font-bold text-slate-800 dark:text-white leading-tight">{s.value}</p>
                {s.sub && <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{s.sub}</p>}
              </div>
            ))}
          </div>
        )}

        {/* The coach's read. */}
        <div className="px-4 py-4">
          {apiAvailable && loading && !voice ? (
            <div className="space-y-2" aria-live="polite">
              <p className="text-sm text-slate-500 dark:text-slate-400">Your coach is looking at the week…</p>
              {recap.paragraphs.map((p, i) => (
                <p key={i} className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{p}</p>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed space-y-2 [&_strong]:text-slate-900 dark:[&_strong]:text-white">
              {renderMarkdown(body)}
            </div>
          )}
        </div>

        {recap.suggestion && (
          <div className="mx-4 mb-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-3">
            <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">{recap.suggestion}</p>
            {onRebuildPlan && (
              <button
                onClick={() => { onRebuildPlan(); onClose() }}
                className="mt-2 text-sm font-semibold text-amber-900 dark:text-amber-200 underline underline-offset-2"
              >
                Rebuild from where I am →
              </button>
            )}
          </div>
        )}

        <div className="px-4 pb-5">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-slate-800 dark:bg-slate-600 text-white font-semibold py-2.5"
          >
            Got it
          </button>
          <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 mt-2">
            Saved to your coach chat — you can come back to it any time.
          </p>
        </div>
      </div>
    </div>
  )
}
