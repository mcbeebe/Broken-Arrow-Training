import { useState } from 'react'
import type { TrainingWeek, SportType } from '../types'
import type { WeekCompliance } from '../hooks/useCompliance'
import { getMilesNumber } from '../utils/format'
import { mapToSportType, getSportMultiplier } from '../utils/trimp'

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

const RUN_TYPES = new Set<SportType>(['running', 'trail_running', 'running_steep'])

/**
 * Sum a week's actual mileage in two modes:
 *   'running'  — only running variants (the plan is written in run miles).
 *   'combined' — every activity counted, scaled by sportMIM/runMIM (1.0)
 *                so 20 mi cycling at MIM 0.65 contributes 13 equivalent mi.
 *                Approximation, not pace-equivalent — deliberately uses MIM
 *                for consistency with the rest of the load engine.
 */
function weekMiles(week: TrainingWeek, mode: 'running' | 'combined'): number {
  let miles = 0
  for (const day of week.days) {
    const a = day.actual
    if (!a || !a.distance || a.distance <= 0) continue
    const sport = mapToSportType(a.type || '', { name: a.name, elevationGainFt: a.elevationGain })
    if (mode === 'running') {
      if (RUN_TYPES.has(sport)) miles += a.distance
    } else {
      const mim = getSportMultiplier(sport)
      miles += a.distance * mim
    }
  }
  return Math.round(miles * 10) / 10
}

export default function VolumeChart({ weeks, activeWeek, onWeekClick, compliance }: VolumeChartProps) {
  const [mode, setMode] = useState<'running' | 'combined'>('running')

  const byNum = new Map<number, WeekCompliance>()
  for (const c of compliance ?? []) byNum.set(c.weekNum, c)

  // Pre-compute per-mode miles so the same numbers feed labels, deviation,
  // and band classification.
  const actualByWeek = new Map<number, number>()
  for (const w of weeks) {
    actualByWeek.set(w.num, weekMiles(w, mode))
  }

  // Y-axis scale = max of planned and actual across all weeks so bars
  // don't clip when an athlete goes over plan.
  const maxMiles = Math.max(
    1,
    ...weeks.flatMap(w => {
      const planned = getMilesNumber(w.miles)
      const actual = actualByWeek.get(w.num) ?? 0
      return [planned, actual]
    }),
  )

  const rows = weeks.map((w, i) => {
    const planned = getMilesNumber(w.miles)
    const wc = byNum.get(w.num)
    const actual = actualByWeek.get(w.num) ?? 0
    const hasStarted = actual > 0 || (wc != null && (wc.completed + wc.missed) > 0)
    const band = classify(actual, planned, hasStarted)
    const deviation = planned > 0 ? (actual - planned) / planned : 0
    return { w, i, planned, actual, hasStarted, band, deviation }
  })

  const flags = rows.filter(r => r.band === 'flag')

  return (
    <div className="px-4 mt-6">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Volume Progression</h3>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border border-slate-200 dark:border-slate-700 overflow-hidden text-[10px] font-medium" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'running'}
              onClick={() => setMode('running')}
              className={`px-2 py-0.5 transition-colors ${mode === 'running' ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            >
              Running
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'combined'}
              onClick={() => setMode('combined')}
              className={`px-2 py-0.5 transition-colors ${mode === 'combined' ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
              title="Combine running + cycling + hiking, each scaled by its MIM (cycling 0.65×, hiking 0.8× etc.)"
            >
              Combined
            </button>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: BAND_FILL.ok }} />±15%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: BAND_FILL.warn }} />±25%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: BAND_FILL.flag }} />&gt;25%</span>
          </div>
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
                title={`Wk ${w.num}: ${actual}${mode === 'combined' ? ' equiv mi' : 'mi'} actual / ${planned}mi planned`}
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
        {mode === 'running' ? (
          <>Solid bars = actual run miles only. Dashed outlines = upcoming weeks at planned mileage. The dashed horizontal line on past/current weeks marks the plan target for that week.</>
        ) : (
          <>Solid bars = run-equivalent miles (each sport scaled by its MIM — cycling × 0.65, hiking × 0.8, etc.). Dashed outlines = upcoming weeks at planned mileage. The dashed horizontal line on past/current weeks marks the plan target for that week.</>
        )}
      </p>
    </div>
  )
}
