import type { MethodologyPhase } from '../utils/methodologyContext'
import { formatWeekRange } from '../utils/methodologyContext'

const PHASE_COLORS: Record<MethodologyPhase['id'], string> = {
  base: 'bg-green-400',
  build: 'bg-amber-400',
  peak: 'bg-red-400',
  taper: 'bg-blue-400',
}

/** Horizontal Base / Build / Peak / Taper bar driven by a MethodologyContext.
 *  Widths renormalize when phases were dropped (e.g. very short plans). */
export default function MethodologyPhaseBar({ phases }: { phases: MethodologyPhase[] }) {
  if (phases.length === 0) return null
  const total = phases.reduce((s, p) => s + p.widthPct, 0) || 100
  return (
    <div className="my-3">
      <div className="flex rounded-lg overflow-hidden h-7">
        {phases.map(p => (
          <div
            key={p.id}
            className={`${PHASE_COLORS[p.id]} flex items-center justify-center`}
            style={{ width: `${(p.widthPct / total) * 100}%` }}
          >
            <span className="text-xs font-bold text-white">{p.label}</span>
          </div>
        ))}
      </div>
      <div className="flex mt-1">
        {phases.map(p => (
          <div
            key={p.id}
            className="text-center text-xs text-slate-500 dark:text-slate-400"
            style={{ width: `${(p.widthPct / total) * 100}%` }}
          >
            {formatWeekRange(p.weekStart, p.weekEnd)}
          </div>
        ))}
      </div>
    </div>
  )
}
