import type { RacePacingPlan } from '../engines/racePacing'

/**
 * G6 surface — the race card Garmin doesn't produce and Runna declines:
 * per-segment grade-adjusted pace bands with physics-called hike flags,
 * cumulative ETA bands, and the fueling checkpoints on the SAME card
 * (pacing and fueling fail together on race day; they plan together here).
 * Bands, never single numbers — trail honesty. Gait and grades are
 * text-encoded; color is decoration.
 */

function fmtPace(secPerMi: number): string {
  const m = Math.floor(secPerMi / 60)
  const s = Math.round(secPerMi % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtEta(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `0:${String(m).padStart(2, '0')}`
}

export default function RacePacingCard({ plan }: { plan: RacePacingPlan }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 mb-3" data-testid="race-pacing-card">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white">Race plan — {plan.courseName}</h3>
        <span className="text-xs font-semibold text-teal-700">
          {fmtEta(plan.totalLowSec)}–{fmtEta(plan.totalHighSec)}
        </span>
      </div>
      <p className="text-[11px] text-slate-500 mb-2">
        Pace bands from your current fitness × real course physics (grade, terrain, altitude).
        Race the band, not a number.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-slate-400 uppercase tracking-wide">
              <th className="py-1 pr-2">Segment</th>
              <th className="py-1 pr-2">Grade</th>
              <th className="py-1 pr-2">Pace /mi</th>
              <th className="py-1">Elapsed</th>
            </tr>
          </thead>
          <tbody>
            {plan.segments.map(s => (
              <tr key={s.segmentId} className="border-t border-slate-100 dark:border-slate-700">
                <td className="py-1.5 pr-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{s.name}</span>
                  <span className="text-slate-400"> mi {s.startMile}–{s.endMile}</span>
                  {s.gait === 'hike' && (
                    <span className="ml-1 rounded bg-amber-100 text-amber-800 px-1 py-0.5 text-[11px] font-bold">HIKE</span>
                  )}
                </td>
                <td className="py-1.5 pr-2 text-slate-600 dark:text-slate-300">
                  {s.avgGradePct > 0 ? '+' : ''}{s.avgGradePct}%
                </td>
                <td className="py-1.5 pr-2 font-semibold text-slate-700 dark:text-slate-200">
                  {fmtPace(s.paceLowSecMi)}–{fmtPace(s.paceHighSecMi)}
                </td>
                <td className="py-1.5 text-slate-500">{fmtEta(s.etaLowSec)}–{fmtEta(s.etaHighSec)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {plan.gPerHour > 0 && plan.checkpoints.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
            Fueling checkpoints — {plan.gPerHour} g carb/hr
          </p>
          <div className="space-y-1">
            {plan.checkpoints.map(c => (
              <p key={c.mile} className="text-[11px] text-slate-600 dark:text-slate-300">
                <span className="font-semibold">{c.name}</span> (mi {c.mile}): ~{c.cumulativeCarbsG} g in by here
                (≈{c.cumulativeGels} gel{c.cumulativeGels === 1 ? '' : 's'})
                {c.crewAccess ? ' · crew access' : ''}
              </p>
            ))}
          </div>
        </div>
      )}

      {plan.cautions.length > 0 && (
        <div className="mt-3 space-y-1">
          {plan.cautions.map((c, i) => (
            <p key={i} className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">{c}</p>
          ))}
        </div>
      )}
    </div>
  )
}
