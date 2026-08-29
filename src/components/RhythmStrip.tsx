import type { RhythmDay } from '../utils/rhythm'
import { resolvedCount } from '../utils/rhythm'

/**
 * The rhythm strip — Today's header line.
 *
 * Twelve dots for twelve days. Filled means the day is resolved: trained,
 * or rested exactly as the plan asked. A hollow grey ring means the day is
 * still open. Nothing here is red, and nothing here says "missed" — the
 * strip is a record of showing up, not a scoreboard of failures.
 */
export default function RhythmStrip({ rhythm, onOpenPlan }: {
  rhythm: RhythmDay[]
  onOpenPlan?: () => void
}) {
  if (rhythm.length === 0) return null
  const { resolved, of } = resolvedCount(rhythm)

  return (
    <button
      type="button"
      onClick={onOpenPlan}
      className="mt-1 w-full text-left"
      data-testid="rhythm-strip"
      aria-label={of > 0 ? `${resolved} of your last ${of} days resolved — open your plan` : 'Open your plan'}
    >
      <span className="flex items-center gap-1" aria-hidden="true">
        {rhythm.map(d => (
          <span
            key={d.iso}
            data-state={d.state}
            title={`${d.label}${d.workout ? ` · ${d.workout}` : ''}`}
            className={
              d.state === 'done' ? 'w-2 h-2 rounded-full bg-teal-400'
              : d.state === 'rest' ? 'w-2 h-2 rounded-full bg-slate-600'
              : d.state === 'open' ? 'w-2 h-2 rounded-full border-2 border-slate-400 box-border'
              : d.state === 'today' ? 'w-2 h-2 rounded-full bg-white ring-2 ring-teal-400/60'
              : 'w-2 h-2 rounded-full bg-slate-700'
            }
          />
        ))}
      </span>
      {of > 0 && (
        <span className="block text-[10px] text-slate-300 mt-1" data-testid="rhythm-summary">
          {resolved} of your last {of} days resolved
        </span>
      )}
    </button>
  )
}
