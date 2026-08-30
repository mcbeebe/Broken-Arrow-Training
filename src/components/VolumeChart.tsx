import { useState } from 'react'
import type { TrainingWeek, SportType, DisplayFlags } from '../types'
import type { WeekCompliance } from '../hooks/useCompliance'
import { getMilesNumber } from '../utils/format'
import { mapToSportType, getSportMultiplier } from '../utils/trimp'
import { bandForWeek, MIN_COMPLETE_WEEKS_TO_GRADE, type VolumeBand } from '../utils/progressFraming'
import { useDisplayPreferences } from '../hooks/useDisplayPreferences'

interface VolumeChartProps {
  weeks: TrainingWeek[]
  activeWeek: number
  onWeekClick: (index: number) => void
  compliance?: WeekCompliance[]
  /** Enables the Mileage / Vertical toggle. Caller decides based on race
   *  profile — see utils/raceReadiness.shouldTrackVerticalGain. */
  showVertical?: boolean
  athleteId?: string
  /** 1-based current week — the week still being run cannot be "off plan". */
  currentWeekNum?: number
  /** Drop the internal headline when a collapsible section already names it. */
  hideTitle?: boolean
}

/**
 * Classify a week's deviation from plan.
 *   within ±15%  → 'ok'     (green)
 *   15–25% off   → 'warn'   (yellow)
 *   >25% off     → 'flag'   (red, with warning badge)
 */
type Band = VolumeBand
type Metric = 'mileage' | 'vertical' | 'time'

const BAND_FILL: Record<Band, string> = {
  ok: '#10B981',        // emerald-500
  warn: '#F59E0B',      // amber-500
  flag: '#EF4444',      // red-500
  future: '#CBD5E1',    // slate-300 (faded outline for upcoming)
  inprogress: '#2DD4BF', // teal-400 — the week still being run, not yet judged
}

const BAND_BORDER: Record<Band, string> = {
  ok: '#059669',
  warn: '#D97706',
  flag: '#DC2626',
  future: '#94A3B8',
  inprogress: '#14B8A6',
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

export default function VolumeChart({ weeks, activeWeek, onWeekClick, compliance, showVertical, athleteId, currentWeekNum = 1, hideTitle }: VolumeChartProps) {
  const { flags: displayFlags } = useDisplayPreferences(athleteId)
  const advanced = displayFlags.showAdvancedCharts
  const [mode, setMode] = useState<'running' | 'combined'>('running')
  const [metric, setMetric] = useState<Metric>('mileage')
  // Metric toggles (vertical, time) and the running/combined split are
  // advanced; the simplest view shows just planned-vs-actual running miles.
  // Vertical is only offered when the target race warrants it.
  const effectiveMetric: Metric = !advanced
    ? 'mileage'
    : metric === 'vertical' && !showVertical
      ? 'mileage'
      : metric

  const byNum = new Map<number, WeekCompliance>()
  for (const c of compliance ?? []) byNum.set(c.weekNum, c)

  // Has the plan run long enough for a single short week to earn red? Below
  // MIN_COMPLETE_WEEKS_TO_GRADE elapsed weeks it hasn't — a week-1 shortfall
  // on a brand-new plan is noise, not a trend (the honesty contract). Until
  // then no bar flags and the "off plan" banner stays silent.
  const gradeable =
    (compliance ?? []).filter(c => c.weekNum < currentWeekNum && c.totalWorkouts > 0).length
      >= MIN_COMPLETE_WEEKS_TO_GRADE

  // Pre-compute per-mode miles so the same numbers feed labels, deviation,
  // and band classification.
  const actualByWeek = new Map<number, number>()
  for (const w of weeks) {
    if (effectiveMetric === 'vertical') {
      actualByWeek.set(w.num, byNum.get(w.num)?.actualElevation ?? 0)
    } else if (effectiveMetric === 'time') {
      actualByWeek.set(w.num, byNum.get(w.num)?.actualDuration ?? 0)
    } else {
      actualByWeek.set(w.num, weekMiles(w, mode))
    }
  }

  // Planned numerator depends on metric.
  function plannedFor(w: TrainingWeek): number {
    if (effectiveMetric === 'vertical') {
      return byNum.get(w.num)?.plannedElevation ?? 0
    }
    if (effectiveMetric === 'time') {
      return byNum.get(w.num)?.plannedDuration ?? 0
    }
    return getMilesNumber(w.miles)
  }

  // Y-axis scale = max of planned and actual across all weeks so bars
  // don't clip when an athlete goes over plan.
  const maxY = Math.max(
    1,
    ...weeks.flatMap(w => {
      const planned = plannedFor(w)
      const actual = actualByWeek.get(w.num) ?? 0
      return [planned, actual]
    }),
  )

  const rows = weeks.map((w, i) => {
    const planned = plannedFor(w)
    const wc = byNum.get(w.num)
    const actual = actualByWeek.get(w.num) ?? 0
    const hasStarted = actual > 0 || (wc != null && (wc.completed + wc.missed) > 0)
    const band = bandForWeek(actual, planned, {
      hasStarted,
      // A week is complete only once it is strictly past the current one.
      isComplete: w.num < currentWeekNum,
      gradeable,
    })
    const deviation = planned > 0 ? (actual - planned) / planned : 0
    return { w, i, planned, actual, hasStarted, band, deviation }
  })

  const flags = rows.filter(r => r.band === 'flag')

  const isVert = effectiveMetric === 'vertical'
  const isTime = effectiveMetric === 'time'
  const unit = isVert ? 'ft' : isTime ? 'h' : 'mi'
  const headline = isVert ? 'Vertical Progression' : isTime ? 'Time Progression' : 'Volume Progression'

  return (
    <div className={hideTitle ? '' : 'px-4 mt-6'}>
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        {!hideTitle && <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{headline}</h3>}
        <div className="flex items-center gap-2">
          {advanced && (
            <div className="inline-flex rounded-full border border-slate-200 dark:border-slate-700 overflow-hidden text-[10px] font-medium" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={effectiveMetric === 'mileage'}
                onClick={() => setMetric('mileage')}
                className={`px-2 py-0.5 transition-colors ${effectiveMetric === 'mileage' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
              >
                Mileage
              </button>
              {showVertical && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveMetric === 'vertical'}
                  onClick={() => setMetric('vertical')}
                  className={`px-2 py-0.5 transition-colors ${effectiveMetric === 'vertical' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                  title="Weekly elevation gain (climb). Planned values are parsed from the plan's per-day vert notes; actual is summed from synced workouts."
                >
                  Vertical
                </button>
              )}
              <button
                type="button"
                role="tab"
                aria-selected={effectiveMetric === 'time'}
                onClick={() => setMetric('time')}
                className={`px-2 py-0.5 transition-colors ${effectiveMetric === 'time' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                title="Weekly moving time (hours). Planned values come from the plan's per-day durations; actual is summed from synced workouts."
              >
                Time
              </button>
            </div>
          )}
          {effectiveMetric === 'mileage' && advanced && (
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
          )}
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
          const barVal = band === 'future' ? planned : actual
          const barPct = maxY > 0 ? (barVal / maxY) * 100 : 0
          const plannedPct = maxY > 0 ? (planned / maxY) * 100 : 0
          const isActive = activeWeek === i
          const actualLabel = formatBarValue(actual, effectiveMetric, displayFlags.numericPrecision)
          const plannedLabel = formatBarValue(planned, effectiveMetric, displayFlags.numericPrecision)
          // Time labels carry their own h/m suffix; other metrics append the unit.
          const us = isTime ? '' : ` ${unit}`
          return (
            <div key={w.num} className="flex-1 min-w-0 grid" style={{ gridTemplateRows: 'auto 1fr auto' }}>
              {/* Top row: actual or planned mileage label */}
              <div className="text-center text-[10px] font-medium text-slate-700 dark:text-slate-200 pb-1">
                {band === 'future' ? plannedLabel : actualLabel}
              </div>
              {/* Middle row: bar fills the entire vertical space */}
              <div
                className="relative cursor-pointer"
                onClick={() => onWeekClick(i)}
                title={`Wk ${w.num}: ${actualLabel}${us}${effectiveMetric === 'mileage' && mode === 'combined' ? ' equiv' : ''} actual / ${plannedLabel}${us} planned`}
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
                    title={`Plan target: ${plannedLabel}${us}`}
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
        {isVert ? (
          <>Solid bars = actual climb (ft) summed from synced workouts. Dashed outlines = upcoming weeks at planned climb (parsed from the plan's per-day vert notes). The dashed horizontal line on past/current weeks marks the plan target.</>
        ) : isTime ? (
          <>Solid bars = actual moving time (hours) summed from synced workouts, all sports. Dashed outlines = upcoming weeks at planned duration (from the plan's per-day times). The dashed horizontal line on past/current weeks marks the plan target for that week.</>
        ) : mode === 'running' ? (
          <>Solid bars = actual run miles only. Dashed outlines = upcoming weeks at planned mileage. The dashed horizontal line on past/current weeks marks the plan target for that week.</>
        ) : (
          <>Solid bars = run-equivalent miles (each sport scaled by its MIM — cycling × 0.65, hiking × 0.8, etc.). Dashed outlines = upcoming weeks at planned mileage. The dashed horizontal line on past/current weeks marks the plan target for that week.</>
        )}
      </p>
    </div>
  )
}

function formatBarValue(value: number, metric: Metric, precision: DisplayFlags['numericPrecision'] = 'normal'): string {
  if (metric === 'time') return formatMinutes(value)
  if (metric === 'mileage') return precision === 'low' ? String(Math.round(value)) : String(value)
  // vertical (feet)
  if (value >= 1000) {
    const k = value / 1000
    return `${k % 1 === 0 ? k : k.toFixed(1)}k`
  }
  return String(Math.round(value))
}

/** Compact moving-time label: "45m", "1.5h", "6h". Input is minutes. */
function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)}m`
  const hours = min / 60
  return hours < 10 ? `${(Math.round(hours * 10) / 10)}h` : `${Math.round(hours)}h`
}
