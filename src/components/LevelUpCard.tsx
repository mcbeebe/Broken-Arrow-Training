import { useState } from 'react'
import type { LevelUpLever } from '../engines/adaptive/levelUp'

/**
 * Level Up (Summary + Coach → Tools): evidence-ranked levers in two
 * horizons — "Do today" (core, mobility, tonight's sleep) and "Build
 * into the plan" (time trials, sims, structure). Tapping a lever's
 * action expands its concrete steps IN PLACE; the coach is the
 * optional tailor, never a blank hand-off. Always present: with no
 * evidence-backed lever it shows an honest on-track state.
 */

const HORIZONS: { key: LevelUpLever['horizon']; label: string }[] = [
  { key: 'now', label: 'Do today' },
  { key: 'plan', label: 'Build into the plan' },
]

function LeverBlock({ lever, rank, expanded, onToggle, onAskCoach }: {
  lever: LevelUpLever
  rank: number
  expanded: boolean
  onToggle: () => void
  onAskCoach?: (seed: string) => void
}) {
  return (
    <div className="border border-slate-100 dark:border-slate-700 rounded-xl px-3 py-2.5" data-testid={`lever-${lever.id}`}>
      <div className="flex items-start gap-2.5">
        <span className="w-6 h-6 rounded-lg bg-slate-900 dark:bg-slate-700 text-white font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
          {rank}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 dark:text-white">{lever.title}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">{lever.evidence}</p>
        </div>
      </div>
      <div className="mt-2 bg-emerald-50 dark:bg-emerald-950 border border-emerald-100 dark:border-emerald-900 rounded-lg px-2.5 py-1.5">
        <p className="text-[11px] text-emerald-800 dark:text-emerald-200 leading-relaxed">
          <span className="font-semibold">The payoff:</span> {lever.payoff}
        </p>
      </div>

      <button
        onClick={onToggle}
        className="mt-2 w-full h-10 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold"
        data-testid={`lever-action-${lever.id}`}
      >
        {expanded ? 'Hide the steps' : lever.actionLabel}
      </button>

      {expanded && (
        <div className="mt-2" data-testid={`lever-steps-${lever.id}`}>
          <ol className="space-y-1.5">
            {lever.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          {onAskCoach && (
            <button
              onClick={() => onAskCoach(lever.coachSeed)}
              className="mt-2 w-full h-9 rounded-lg border border-teal-700 text-teal-700 dark:text-teal-400 text-xs font-semibold"
              data-testid={`lever-tailor-${lever.id}`}
            >
              Ask the coach to tailor this →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function LevelUpCard({ levers, onAskCoach }: {
  levers: LevelUpLever[]
  onAskCoach?: (seed: string) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (levers.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700" data-testid="level-up-ontrack">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-base font-semibold text-slate-700 dark:text-slate-200">Level up</p>
          <p className="text-[11px] text-slate-400">ranked from your data</p>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
          Nothing urgent right now — execution is clean and no lever has evidence behind it. As workouts, sims, and sleep data land, your top moves surface here automatically.
        </p>
        {onAskCoach && (
          <button
            onClick={() => onAskCoach("I'm training well and want to push to the next level. Looking at my data, what are the top things I should change or add?")}
            className="mt-3 w-full h-10 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold"
          >
            Ask the coach: what's my next level?
          </button>
        )}
      </div>
    )
  }

  const ordered = HORIZONS.flatMap(h => levers.filter(l => l.horizon === h.key))
  const rankOf = new Map(ordered.map((l, i) => [l.id, i + 1]))
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-base font-semibold text-slate-700 dark:text-slate-200">Level up</p>
        <p className="text-[11px] text-slate-400">ranked from your data</p>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-3">
        The highest-leverage move{levers.length === 1 ? '' : 's'} available to you right now.
      </p>

      <div className="space-y-3">
        {HORIZONS.map(h => {
          const group = levers.filter(l => l.horizon === h.key)
          if (group.length === 0) return null
          return (
            <div key={h.key}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">{h.label}</p>
              <div className="space-y-2.5">
                {group.map(lever => (
                  <LeverBlock
                    key={lever.id}
                    lever={lever}
                    rank={rankOf.get(lever.id) ?? 0}
                    expanded={expandedId === lever.id}
                    onToggle={() => setExpandedId(prev => (prev === lever.id ? null : lever.id))}
                    onAskCoach={onAskCoach}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-2.5 text-[10px] text-slate-400 leading-snug">
        Re-ranked as your data changes. Load-adding moves state their headroom check — faster never means reckless.
      </p>
    </div>
  )
}
