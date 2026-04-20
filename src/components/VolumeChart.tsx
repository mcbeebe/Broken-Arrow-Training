import type { TrainingWeek } from '../types'
import type { WeekCompliance } from '../hooks/useCompliance'
import { getMilesNumber } from '../utils/format'

interface VolumeChartProps {
  weeks: TrainingWeek[]
  activeWeek: number
  onWeekClick: (index: number) => void
  compliance?: WeekCompliance[]
}

/**
 * Classify a week's deviation from plan.
 *   within ±15%  → 'ok'     (green)
 *   15–25% off   → 'warn'   (yellow)
 *   >25% off     → 'flag'   (red, with warning badge)
 */
type Band = 'ok' | 'warn' | 'flag' | 'future'

function classify(actual: number, planned: number, hasStarted: boolean): Band {
  if (!hasStarted) return 'future'
  if (planned <= 0) return 'ok'
  const dev = Math.abs(actual - planned) / planned
  if (dev <= 0.15) return 'ok'
  if (dev <= 0.25) return 'warn'
  return 'flag'
}

const BAND_FILL: Record<Band, string> = {
  ok: '#10B981',      // emerald-500
  warn: '#F59E0B',    // amber-500
  flag: '#EF4444',    // red-500
  future: '#CBD5E1',  // slate-300 (faded outline for upcoming)
}

const BAND_BORDER: Record<Band, string> = {
  ok: '#059669',
  warn: '#D97706',
  flag: '#DC2626',
  future: '#94A3B8',
}

const CHART_PX = 280  // pixel height of the bar area; bars use full height

export default function VolumeChart({ weeks, activeWeek, onWeekClick, compliance }: VolumeChartProps) {
  const byNum = new Map<number, WeekCompliance>()
  for (const c of compliance ?? []) byNum.set(c.weekNum, c)

  // Y-axis scale = max of planned and actual across all weeks so bars
  // don't clip when an athlete goes over plan.
  const maxMiles = Math.max(
    1,
    ...weeks.flatMap(w => {
      const planned = getMilesNumber(w.miles)
      const actual = byNum.get(w.num)?.actualMiles ?? 0
      return [planned, actual]
    }),
  )

  const rows = weeks.map((w, i) => {
    const planned = getMilesNumber(w.miles)
    const wc = byNum.get(w.num)
    const actual = wc?.actualMiles ?? 0
    const hasStarted = actual > 0 || (wc != null && (wc.completed + wc.missed) > 0)
    const band = classify(actual, planned, hasStarted)
    const deviation = planned > 0 ? (actual - planned) / planned : 0
    return { w, i, planned, actual, hasStarted, band, deviation }
  })

  const flags = rows.filter(r => r.band === 'flag')

  return (
    <div className="px-4 mt-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Volume Progression</h3>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: BAND_FILL.ok }} />±15%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: BAND_FILL.warn }} />±25%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: BAND_FILL.flag }} />&gt;25%</span>
        </div>
      </div>

      {flags.length > 0 && (
        <div className="mb-2 flex items-start gap-1.5 text-[11px] text-red-700 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-md px-2 py-1.5">
          <span>⚠️</span>
          <span>
            {flags.length === 1 ? 'Week' : 'Weeks'}{' '}
            {flags.map(f => f.w.num).join(', ')}{' '}
            more than 25% off plan ({flags.map(f => `${f.deviation > 0 ? '+' : ''}${Math.round(f.deviation * 100)}%`).join(', ')}).
          </span>
        </div>
      )}

      <div className="flex gap-1" style={{ height: CHART_PX }}>
        {rows.map(({ w, i, planned, actual, band }) => {
          const barMiles = band === 'future' ? planned : actual
          const barPct = maxMiles > 0 ? (barMiles / maxMiles) * 100 : 0
          const plannedPct = maxMiles > 0 ? (planned / maxMiles) * 100 : 0
          const isActive = activeWeek === i
          return (
            <div key={w.num} className="flex-1 min-w-0 grid" style={{ gridTemplateRows: 'auto 1fr auto' }}>
              {/* Top row: actual or planned mileage label */}
              <div className="text-center text-[10px] font-medium text-slate-700 dark:text-slate-200 pb-1">
                {band === 'future' ? planned : actual}
              </div>
              {/* Middle row: bar fills the entire vertical space */}
              <div
                className="relative cursor-pointer"
                onClick={() => onWeekClick(i)}
                title={`Wk ${w.num}: ${actual}mi actual / ${planned}mi planned`}
              >
                <div
                  className="absolute inset-x-0 bottom-0 rounded-t transition-all"
                  style={{
                    height: `${Math.max(barPct, 1)}%`,
                    background: band === 'future' ? 'transparent' : BAND_FILL[band],
                    border: `1.5px ${band === 'future' ? 'dashed' : 'solid'} ${BAND_BORDER[band]}`,
                    borderBottom: 'none',
                    outline: isActive ? '2px solid #0F172A' : 'none',
                    outlineOffset: 1,
                  }}
                />
                {band !== 'future' && planned > 0 && (
                  <div
                    className="absolute inset-x-0"
                    style={{
                      bottom: `${plannedPct}%`,
                      height: 0,
                      borderTop: '1.5px dashed #475569',
                    }}
                    title={`Plan target: ${planned}mi`}
                  />
                )}
              </div>
              {/* Bottom row: week number */}
              <div className={`text-center text-[10px] pt-1 ${band === 'flag' ? 'text-red-600 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>
                {w.num}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">
        Solid bars = actual miles. Dashed outlines = upcoming weeks at planned mileage. The dashed horizontal line on past/current weeks marks the plan target for that week.
      </p>
    </div>
  )
}
