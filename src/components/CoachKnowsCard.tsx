import type { AboutMeFact } from '../types'
import { useCoachSummaryCard } from '../hooks/useCoachSummaryCard'

interface Props {
  athleteId: string
  /** Raw facts from the server-backed memory. Drives the refetch
   *  fingerprint so the card re-curates when the user edits in Settings. */
  facts: AboutMeFact[] | undefined
  enabled: boolean
  coachName?: string
  /** When provided, the "Edit in Settings" button switches to the
   *  Settings tab where the full per-fact CRUD panel lives. */
  onGoSettings?: () => void
}

/**
 * "Coach knows about you" home-card. Renders 3-5 short, second-person
 * lines curated server-side from `aboutMeFacts`. Read-only — the full
 * editor stays in Settings → Coach. Hidden when coach is off, when the
 * API isn't reachable, or while loading on first paint with no cached
 * payload yet.
 */
export default function CoachKnowsCard({
  athleteId,
  facts,
  enabled,
  coachName,
  onGoSettings,
}: Props) {
  const { facts: curated, loading, apiAvailable } = useCoachSummaryCard(
    athleteId,
    enabled,
    facts,
  )

  if (!enabled || !apiAvailable) return null

  const hasAnyFacts = (facts?.length ?? 0) > 0

  // Empty state: the athlete is new / hasn't taught the coach anything
  // yet. Skip the card entirely rather than showing an empty shell —
  // home is a daily-glance surface, not an onboarding nudge.
  if (!hasAnyFacts && !loading) return null

  if (loading && curated.length === 0) {
    return (
      <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-3 animate-pulse">
        <div className="h-3 w-40 bg-slate-200 dark:bg-slate-700 rounded mb-2.5" />
        <div className="h-3 w-full bg-slate-200/70 dark:bg-slate-700/60 rounded mb-1.5" />
        <div className="h-3 w-5/6 bg-slate-200/70 dark:bg-slate-700/60 rounded mb-1.5" />
        <div className="h-3 w-3/4 bg-slate-200/70 dark:bg-slate-700/60 rounded" />
      </div>
    )
  }

  if (curated.length === 0) return null

  const coachLabel = coachName?.trim() || 'Your coach'

  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl leading-none shrink-0" role="img" aria-label="coach">🧢</span>
          <p className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 truncate">
            {coachLabel} knows…
          </p>
        </div>
        {onGoSettings && (
          <button
            onClick={onGoSettings}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:underline shrink-0"
          >
            Edit in Settings
          </button>
        )}
      </div>
      <ul className="space-y-1.5">
        {curated.map((line, i) => (
          <li
            key={i}
            className="text-sm text-slate-700 dark:text-slate-200 leading-snug flex gap-2"
          >
            <span className="text-slate-400 dark:text-slate-500 shrink-0" aria-hidden>•</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
