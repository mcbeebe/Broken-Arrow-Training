import type { LevelUpLever } from '../engines/adaptive/levelUp'

/**
 * Level Up on the Summary tab (Adaptive Engine phase 2, PR 6 — the
 * accelerator mockup): the top evidence-ranked levers, each with its
 * measured evidence, payoff, and a one-tap ask to the coach. Renders
 * nothing when no lever has evidence — never filler.
 */
export default function LevelUpCard({ levers, onAskCoach }: {
  levers: LevelUpLever[]
  onAskCoach?: (seed: string) => void
}) {
  if (levers.length === 0) return null
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-base font-semibold text-slate-700 dark:text-slate-200">Level up</p>
        <p className="text-[11px] text-slate-400">ranked from your data</p>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-3">
        The highest-leverage move{levers.length === 1 ? '' : 's'} available to you right now.
      </p>

      <div className="space-y-2.5">
        {levers.map((lever, i) => (
          <div key={lever.id} className="border border-slate-100 dark:border-slate-700 rounded-xl px-3 py-2.5" data-testid={`lever-${lever.id}`}>
            <div className="flex items-start gap-2.5">
              <span className="w-6 h-6 rounded-lg bg-slate-900 dark:bg-slate-700 text-white font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
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
            {onAskCoach && (
              <button
                onClick={() => onAskCoach(lever.coachSeed)}
                className="mt-2 w-full h-10 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold"
              >
                {lever.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="mt-2.5 text-[10px] text-slate-400 leading-snug">
        Re-ranked as your data changes. Load-adding moves state their headroom check — faster never means reckless.
      </p>
    </div>
  )
}
