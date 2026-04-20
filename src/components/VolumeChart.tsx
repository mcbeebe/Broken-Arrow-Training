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
 * A past week with zero actual miles against a non-zero plan is always
 * 'flag' regardless of percentage math (divide-by-plan-by-zero edge).
 */
type Band = 'ok' | 'warn' | 'flag' | 'future'

function classify(actual: number, planned: number, hasStarted: boolean): Band {
  if (!hasStarted) return 'future'
  if (planned <= 0) return 'ok' // nothing planned, nothing to grade
  const dev = Math.abs(actual - planned) / planned
  if (dev <= 0.15) return 'ok'
  if (dev <= 0.25) return 'warn'
  return 'flag'
}

const BAND_FILL: Record<Band, string> = {
  ok: '#10B981',      // emerald-500
  warn: '#F59E0B',    // amber-500
  flag: '#EF4444',    // red-500
  future: '#E2E8F0',  // slate-200 (outline fill)
}

const BAND_BORDER: Record<Band, string> = {
  ok: '#059669',
  warn: '#D97706',
  flag: '#DC2626',
  future: '#94A3B8',
}

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

  // hasStarted = this week has any actual miles logged. Cleaner than
  // date-math for determining "in play" weeks, and handles the case
  // where the current week has just started.
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

      <div className="flex items-end gap-1 h-28">
        {rows.map(({ w, i, planned, actual, band }) => {
          const barMiles = band === 'future' ? planned : actual
          const barPct = maxMiles > 0 ? (barMiles / maxMiles) * 100 : 0
          const plannedPct = maxMiles > 0 ? (planned / maxMiles) * 100 : 0
          const isActive = activeWeek === i
          return (
            <div key={w.num} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <span className="text-[9px] font-medium text-slate-600 dark:text-slate-300 leading-tight">
                {band === 'future' ? planned : actual}
              </span>
              <div
                className="w-full relative cursor-pointer"
                style={{ height: '100%' }}
                onClick={() => onWeekClick(i)}
                title={`Wk ${w.num}: ${actual}mi actual / ${planned}mi planned`}
              >
                <div className="absolute inset-x-0 bottom-0 h-full">
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-t transition-all"
                    style={{
                      height: `${barPct}%`,
                      minHeight: 4,
                      background: band === 'future' ? 'transparent' : BAND_FILL[band],
                      border: `1px solid ${BAND_BORDER[band]}`,
                      borderBottom: 'none',
                      outline: isActive ? '2px solid #0F172A' : 'none',
                      outlineOffset: 1,
                    }}
                  />
                  {/* Planned-target dashed line — only drawn when actual > 0
                      (past/current weeks) so future weeks don't show
                      duplicate markers. */}
                  {band !== 'future' && planned > 0 && (
                    <div
                      className="absolute inset-x-0"
                      style={{
                        bottom: `${plannedPct}%`,
                        height: 0,
                        borderTop: '1.5px dashed #475569',
                      }}
                    />
                  )}
                </div>
              </div>
              <span className={`text-[9px] ${band === 'flag' ? 'text-red-600 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}>
                {w.num}
              </span>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
        Bars = actual miles. Dashed line = plan target. Bars without fill are upcoming weeks.
      </p>
    </div>
  )
}
