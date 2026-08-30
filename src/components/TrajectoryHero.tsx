import type { Trajectory, TrajectoryConfidence } from '../utils/trajectory'

/**
 * The road/trail trajectory hero — the top card of Progress for a runner.
 *
 * It answers "where is this heading" the way the Hyrox projection answers it
 * for a Hyrox athlete: one honest number, the goal beside it, and a confidence
 * that admits how early we are. The number is fitness-equivalent ("at today's
 * fitness"), not a course simulation — the card says so, so it never
 * over-claims a race-day prediction it cannot make yet.
 */

const CONF_LABEL: Record<TrajectoryConfidence, string> = {
  building: 'BUILDING',
  firming: 'FIRMING UP',
  settled: 'SETTLED',
}

export default function TrajectoryHero({ trajectory }: { trajectory: Trajectory }) {
  const t = trajectory
  // Where the projection sits between "today" and the goal, for the bar. With
  // no goal the bar is just full at today's mark.
  const barPct = (() => {
    if (t.goalSeconds == null) return 100
    if (t.status === 'met') return 100
    // Closer to goal (smaller projected) → fuller bar. Anchor the empty end at
    // the realistic-ceiling gap so the fill reflects how much is left to close.
    const span = t.projectedSeconds - t.realisticSeconds
    if (span <= 0) return 100
    const closed = t.projectedSeconds - t.goalSeconds
    return Math.max(8, Math.min(100, Math.round(((span - closed) / span) * 100)))
  })()

  return (
    <div
      className="rounded-xl p-4 shadow-sm"
      style={{ background: 'linear-gradient(135deg, #0f172a, #134e4a)' }}
      data-testid="trajectory-hero"
      data-status={t.status ?? 'none'}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-teal-300">Where this is heading</p>
        <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-teal-300 text-slate-900">
          {CONF_LABEL[t.confidence]}
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <p className="font-mono text-2xl font-bold text-teal-50">{t.projectedClock}</p>
        {t.goalClock && (
          <span className="text-xs text-teal-300">
            {t.status === 'met' ? '✓ at your goal' : t.status === 'closing' ? `▲ closing on ${t.goalClock}` : `goal ${t.goalClock}`}
          </span>
        )}
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-teal-100/90" style={{ color: '#99f6e4' }}>
        {t.note}
      </p>

      {t.goalClock && (
        <>
          <div className="mt-2.5 h-1.5 rounded-full relative" style={{ background: '#0b3b36' }}>
            <span
              className="absolute left-0 top-0 bottom-0 rounded-full"
              style={{ width: `${barPct}%`, background: 'linear-gradient(90deg, #0d9488, #2dd4bf)' }}
            />
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-[10px]" style={{ color: '#5eead4' }}>today {t.projectedClock}</span>
            <span className="text-[10px] text-teal-50">goal {t.goalClock} ↑</span>
          </div>
        </>
      )}

      <p className="mt-2 text-[10px]" style={{ color: '#5eead4' }}>
        At today’s fitness — sharpens as the long runs land. Not a course-adjusted race prediction.
      </p>
    </div>
  )
}
