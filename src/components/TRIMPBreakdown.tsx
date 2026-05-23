import { useState } from 'react'
import type { DailyTRIMP, PerformanceMetrics } from '../types'
import { localDateStr } from '../utils/format'
import { ComposedChart, Bar, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import Term from './TermGlossary'

export type TRIMPRange = '7d' | '30d' | '90d' | 'ytd' | 'all'

interface TRIMPBreakdownProps {
  dailyTrimp: DailyTRIMP[]
  sorenessLoadByDate?: Map<string, number>
  rpeByDate?: Map<string, number>
  exerciseLoadByDate?: Map<string, number>
  /** Engine's predicted DOMS carry per day (from useReadiness). When a
   *  soreness check-in covers the same physiological signal as the
   *  prediction, only the larger of the two contributes to day total. */
  domsCarryByDate?: Map<string, number>
  /** Externally-controlled range. When omitted, the chart renders its own
   *  toggle (7d / 30d / 90d / YTD) and defaults to 7d. */
  range?: TRIMPRange
  onRangeChange?: (r: TRIMPRange) => void
  /** CTL/ATL timeline from useReadiness. When provided, the chart overlays a
   *  trailing-average load trend line and a lightly shaded "optimal range"
   *  band — 0.8×–1.3× CTL, the Load-Ratio sweet spot already used elsewhere
   *  in the app. Without it, the chart renders bars only. */
  performance?: PerformanceMetrics[]
}

const SPORT_COLORS: Record<string, string> = {
  running: '#059669',
  trail_running: '#10B981',
  running_steep: '#047857',
  cycling: '#3B82F6',
  ebike: '#93C5FD',
  mountain_biking: '#2563EB',
  hiking: '#D97706',
  hiking_steep: '#B45309',
  walking: '#64748B',
  swimming: '#06B6D4',
  lap_swimming: '#0891B2',
  aqua_jogging: '#22D3EE',
  strength_upper: '#A78BFA',
  strength_lower: '#7C3AED',
  strength_full: '#8B5CF6',
  hiit: '#EF4444',
  cardio: '#F97316',
  elliptical: '#F59E0B',
  rowing: '#84CC16',
  indoor_rowing: '#A3E635',
  yoga: '#EC4899',
  pilates: '#F472B6',
  breathwork: '#CBD5E1',
  myrtl: '#CBD5E1',
  running_drills: '#CBD5E1',
  other: '#94A3B8',
}

const MANUAL_EXERCISE_COLOR = '#F59E0B'
const DOMS_COLOR = '#FB923C'
const SORENESS_COLOR = '#F87171'
// Load-trend overlay. The line is acute load (ATL — the 7-day EWMA from the
// performance timeline), drawn in a dark neutral so it reads over any sport
// color. The optimal-range band uses green to signal "healthy zone" (0.8–1.3×
// chronic load — the Load-Ratio sweet spot, mirroring Garmin's Optimal Range).
const TREND_COLOR = '#334155'
const ZONE_COLOR = '#22C55E'

function getRangeDays(range: TRIMPRange, dailyTrimp: DailyTRIMP[]): string[] {
  const today = new Date()
  const days: string[] = []

  let startDate: Date
  if (range === '7d') {
    startDate = new Date(today)
    startDate.setDate(today.getDate() - 6)
  } else if (range === '30d') {
    startDate = new Date(today)
    startDate.setDate(today.getDate() - 29)
  } else if (range === '90d') {
    startDate = new Date(today)
    startDate.setDate(today.getDate() - 89)
  } else if (range === 'ytd') {
    startDate = new Date(today.getFullYear(), 0, 1)
  } else {
    // 'all' — earliest date in dailyTrimp, or default to 90d ago if empty
    if (dailyTrimp.length === 0) {
      startDate = new Date(today)
      startDate.setDate(today.getDate() - 89)
    } else {
      const earliest = [...dailyTrimp].sort((a, b) => a.date.localeCompare(b.date))[0].date
      startDate = new Date(earliest + 'T00:00:00')
    }
  }

  const cursor = new Date(startDate)
  while (cursor <= today) {
    days.push(localDateStr(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

const RANGE_LABELS: Record<TRIMPRange, { tab: string; title: string; total: string }> = {
  '7d':  { tab: '7d',  title: '7-Day Training Load',         total: 'Weekly Load' },
  '30d': { tab: '30d', title: '30-Day Training Load',        total: '30-Day Total' },
  '90d': { tab: '90d', title: '90-Day Training Load',        total: '90-Day Total' },
  'ytd': { tab: 'YTD', title: 'Year-to-Date Training Load',  total: 'YTD Total' },
  'all': { tab: 'All', title: 'Training Load',               total: 'Total Load' },
}

interface Breakdown {
  records: { sportType: string; trimp: number }[]
  exerciseLoad: number
  rpeValue: number | null
  rpeMult: number
  rpeDelta: number   // signed
  sorenessAdj: number
  domsCarry: number  // residual carry-forward from prior days' eccentric work
  dayTotal: number
}

export default function TRIMPBreakdown({
  dailyTrimp,
  sorenessLoadByDate,
  rpeByDate,
  exerciseLoadByDate,
  domsCarryByDate,
  range: controlledRange,
  onRangeChange,
  performance,
}: TRIMPBreakdownProps) {
  const [internalRange, setInternalRange] = useState<TRIMPRange>('7d')
  const range = controlledRange ?? internalRange
  const setRange = (r: TRIMPRange) => {
    if (controlledRange === undefined) setInternalRange(r)
    onRangeChange?.(r)
  }
  const showRangeToggle = controlledRange === undefined

  const rangeDays = getRangeDays(range, dailyTrimp)

  // Build a lookup from existing TRIMP data
  const trimpByDate = new Map(dailyTrimp.map(d => [d.date, d]))

  // Fill every day in range, including rest days with 0
  const filledDays: DailyTRIMP[] = rangeDays.map(date => {
    const existing = trimpByDate.get(date)
    if (existing) return existing
    return { date, total: 0, records: [] }
  })

  const rangeTotal = Math.round(filledDays.reduce((s, d) => s + d.total, 0))
  const labels = RANGE_LABELS[range]

  // ── Load-trend overlay ────────────────────────────────────────────
  // Trend line = acute load (ATL, the 7-day EWMA). Optimal-range band =
  // 0.8×–1.3× chronic load (CTL) — the Load-Ratio sweet spot. Both come from
  // the performance timeline and move slowly, so we forward-fill the most
  // recent value across days it doesn't cover and back-fill the earliest
  // value for days before it starts.
  const perfExact = new Map((performance ?? []).map(p => [p.date, p]))
  const firstPerf = performance && performance.length > 0 ? performance[0] : null
  const atlByDay = new Map<string, number>()
  const ctlByDay = new Map<string, number>()
  let runningPerf: PerformanceMetrics | null = null
  for (const date of rangeDays) {
    const exact = perfExact.get(date)
    if (exact) runningPerf = exact
    const p = runningPerf ?? firstPerf
    if (p) {
      if (p.atl > 0) atlByDay.set(date, p.atl)
      if (p.ctl > 1) ctlByDay.set(date, p.ctl)
    }
  }

  // Per-day decomposition. After useReadiness applies its dedup logic:
  //   day.total = (recordSum + exerciseLoad) × rpeMult
  //             + max(domsCarry, sorenessAdj_positive)
  //             + sorenessAdj_negative
  // We use the engine's predicted domsCarry directly (passed in from
  // useReadiness) so the chart matches the hook's source of truth, and
  // splits "DOMS carry-over (predicted)" from "muscle soreness above
  // prediction" in the tooltip when both apply.
  // Keyed on full ISO date so 30d/90d/all ranges that cross a year boundary
  // (e.g. mid-January) don't collide on bare MM-DD keys.
  const breakdownByDate = new Map<string, Breakdown>()
  for (const day of filledDays) {
    const recordSum = day.records.reduce((s, r) => s + r.adjustedTRIMP, 0)
    // De-dup the manual-exercise segment when a Garmin strength activity
    // is already present for the day — its EPOC TRIMP record covers the
    // musculoskeletal load, so showing a separate "manual exercise" bar
    // would double-count the same workout. Mirrors the day-total dedup
    // in useReadiness so the segment sum stays equal to the day total.
    const hasStrengthRecord = day.records.some(r => r.sportType.startsWith('strength_'))
    const exerciseLoad = hasStrengthRecord ? 0 : (exerciseLoadByDate?.get(day.date) ?? 0)
    const rpeValue = rpeByDate?.get(day.date) ?? null
    const rpeMult = rpeValue ? 1 + 0.04 * (rpeValue - 5) : 1
    const rpeDelta = (recordSum + exerciseLoad) * (rpeMult - 1)
    const sorenessAdj = sorenessLoadByDate?.get(day.date) ?? 0
    const domsCarry = domsCarryByDate?.get(day.date) ?? 0
    breakdownByDate.set(day.date, {
      records: day.records.map(r => ({ sportType: r.sportType, trimp: r.adjustedTRIMP })),
      exerciseLoad,
      rpeValue,
      rpeMult,
      rpeDelta,
      sorenessAdj,
      domsCarry,
      dayTotal: day.total,
    })
  }

  // Build chart data using the breakdown. Bar segments are post-RPE-adjusted
  // so the stack height matches day.total even when RPE < 5 reduces things —
  // the raw values + RPE delta are spelled out in the tooltip. DOMS carry
  // and soreness are de-duplicated: when both apply, the bar shows the full
  // DOMS prediction plus only the *excess* soreness above prediction.
  const chartData = filledDays.map(day => {
    const bd = breakdownByDate.get(day.date)!
    const entry: Record<string, string | number | number[]> = {
      date: day.date.slice(5),
      fullDate: day.date,
      _isRest: bd.dayTotal === 0 ? 1 : 0,
    }
    for (const r of bd.records) {
      const v = Math.round(r.trimp * bd.rpeMult * 10) / 10
      if (v > 0.5) entry[r.sportType] = ((entry[r.sportType] as number) || 0) + v
    }
    if (bd.exerciseLoad > 0.5) {
      entry['manual_exercise'] = Math.round(bd.exerciseLoad * bd.rpeMult * 10) / 10
    }
    // De-dup'd lagged-fatigue contribution. Positive soreness above
    // predicted DOMS shows as the excess; otherwise the prediction stands.
    // Negative soreness (recovery) bypasses the bar (tooltip shows it).
    if (bd.domsCarry > 0.5) {
      entry['doms_carry'] = Math.round(bd.domsCarry * 10) / 10
    }
    if (bd.sorenessAdj > 0) {
      const excess = Math.max(0, bd.sorenessAdj - bd.domsCarry)
      if (excess > 0.5) entry['soreness'] = Math.round(excess * 10) / 10
    }
    if (bd.dayTotal === 0) {
      entry['rest'] = 0
    }
    const atl = atlByDay.get(day.date)
    if (atl != null) entry['trend'] = Math.round(atl)
    const ctl = ctlByDay.get(day.date)
    if (ctl != null) entry['zone'] = [Math.round(ctl * 0.8), Math.round(ctl * 1.3)]
    return entry
  })

  // Detect which optional segments are actually present so we only mount
  // the corresponding <Bar /> + legend chip when needed.
  const sportTypes = new Set<string>()
  for (const day of filledDays) {
    for (const rec of day.records) sportTypes.add(rec.sportType)
  }
  let hasManualExercise = false
  let hasDoms = false
  let hasSoreness = false
  let hasTrend = false
  let hasZone = false
  for (const entry of chartData) {
    if (entry['manual_exercise']) hasManualExercise = true
    if (entry['doms_carry']) hasDoms = true
    if (entry['soreness']) hasSoreness = true
    if (entry['trend']) hasTrend = true
    if (Array.isArray(entry['zone'])) hasZone = true
  }

  const rangeOptions: TRIMPRange[] = ['7d', '30d', '90d', 'ytd']

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <p className="text-base font-semibold text-slate-700">{labels.title}</p>
          <p className="text-sm text-slate-500">Garmin <Term name="epoc" /> · <Term name="mim" />-adjusted · <Term name="doms" /> &amp; soreness</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-800">{rangeTotal}</p>
          <p className="text-xs text-slate-500 uppercase">{labels.total}</p>
        </div>
      </div>
      {showRangeToggle && (
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5 mb-3">
          {rangeOptions.map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                range === r
                  ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {RANGE_LABELS[r].tab}
            </button>
          ))}
        </div>
      )}
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            barCategoryGap={range === '7d' ? '15%' : '5%'}
          >
            <defs>
              <linearGradient id="trimpZoneFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ZONE_COLOR} stopOpacity={0.22} />
                <stop offset="100%" stopColor={ZONE_COLOR} stopOpacity={0.08} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: '#94A3B8' }}
              axisLine={false}
              tickLine={false}
              interval={
                range === '7d' ? 0
                : range === '30d' ? Math.max(0, Math.floor(chartData.length / 6) - 1)
                : 'preserveStartEnd'
              }
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#94A3B8' }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={{ fontSize: 13, borderRadius: 8 }}
              itemSorter={() => 0}
              content={(props) => {
                const { active, payload, label } = props as unknown as {
                  active?: boolean
                  payload?: ReadonlyArray<{ payload?: { fullDate?: string; trend?: number; zone?: [number, number] } }>
                  label?: string | number
                }
                if (!active || !payload?.length) return null
                const entry = payload[0]?.payload
                const fullDate = entry?.fullDate
                const bd = fullDate ? breakdownByDate.get(fullDate) : undefined
                if (!bd || bd.dayTotal <= 0) return null
                const trendVal = typeof entry?.trend === 'number' ? entry.trend : null
                const zoneVal = Array.isArray(entry?.zone) ? entry!.zone : null
                const zoneStatus = trendVal !== null && zoneVal
                  ? trendVal < zoneVal[0] ? 'below range'
                  : trendVal > zoneVal[1] ? 'above range'
                  : 'in range'
                  : null
                const tooltipLabel = String(label ?? fullDate?.slice(5) ?? '')

                interface Row { swatch: string; name: string; value: number; signed?: boolean; subtitle?: string }
                const rows: Row[] = []
                for (const r of bd.records) {
                  rows.push({
                    swatch: SPORT_COLORS[r.sportType] || '#94A3B8',
                    name: r.sportType.replace(/_/g, ' '),
                    value: r.trimp,
                  })
                }
                if (bd.exerciseLoad > 0.5) {
                  rows.push({ swatch: MANUAL_EXERCISE_COLOR, name: 'manual exercise', value: bd.exerciseLoad })
                }
                if (bd.rpeValue !== null && Math.abs(bd.rpeDelta) > 0.5) {
                  rows.push({
                    swatch: '#FBBF24',
                    name: `RPE ${bd.rpeValue} adjustment`,
                    value: bd.rpeDelta,
                    signed: true,
                  })
                }
                // De-dup'd lagged-fatigue: show predicted DOMS, then excess
                // soreness (if measurement was higher than prediction).
                if (bd.domsCarry > 0.5) {
                  const dedupNote = bd.sorenessAdj > 0
                    ? bd.sorenessAdj >= bd.domsCarry
                      ? '(prediction confirmed by check-in)'
                      : '(prediction; check-in lower)'
                    : undefined
                  rows.push({ swatch: DOMS_COLOR, name: 'DOMS carry-over', value: bd.domsCarry, subtitle: dedupNote })
                }
                if (Math.abs(bd.sorenessAdj) > 0.5) {
                  if (bd.sorenessAdj < 0) {
                    rows.push({
                      swatch: SORENESS_COLOR,
                      name: 'soreness (recovery)',
                      value: bd.sorenessAdj,
                      signed: true,
                    })
                  } else {
                    const excess = Math.max(0, bd.sorenessAdj - bd.domsCarry)
                    if (excess > 0.5) {
                      rows.push({
                        swatch: SORENESS_COLOR,
                        name: bd.domsCarry > 0.5 ? 'soreness (above predicted)' : 'muscle soreness',
                        value: excess,
                      })
                    }
                  }
                }
                if (rows.length === 0) return null

                const hasDayAdj = bd.rpeValue !== null || Math.abs(bd.sorenessAdj) > 0.5 || bd.domsCarry > 0.5

                const fmt = (v: number, signed?: boolean) => {
                  const n = Math.round(v)
                  if (signed) return n > 0 ? `+${n} TRIMP` : `${n} TRIMP`
                  return `${n} TRIMP`
                }

                return (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md px-3 py-2 text-[13px]">
                    <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">{tooltipLabel}</p>
                    {rows.map((r, i) => (
                      <div key={i}>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-sm inline-block shrink-0"
                            style={{ backgroundColor: r.swatch }}
                          />
                          <span className="text-slate-600 dark:text-slate-300">{r.name}</span>
                          <span className={`ml-auto font-medium ${r.signed && r.value < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}>
                            {fmt(r.value, r.signed)}
                          </span>
                        </div>
                        {r.subtitle && (
                          <p className="ml-[18px] text-[10px] text-slate-400 dark:text-slate-500 italic leading-tight">
                            {r.subtitle}
                          </p>
                        )}
                      </div>
                    ))}
                    <div className="flex items-center gap-2 mt-1 pt-1 border-t border-slate-100 dark:border-slate-700">
                      <span className="text-slate-700 dark:text-slate-200 font-semibold">Day total</span>
                      <span className="ml-auto font-semibold text-slate-700 dark:text-slate-200">{Math.round(bd.dayTotal)} TRIMP</span>
                    </div>
                    {trendVal !== null && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="w-2.5 h-[3px] rounded-full inline-block shrink-0" style={{ backgroundColor: TREND_COLOR }} />
                        <span className="text-slate-600 dark:text-slate-300">acute load</span>
                        <span className="ml-auto font-medium text-slate-700 dark:text-slate-200">{trendVal} TRIMP</span>
                      </div>
                    )}
                    {zoneVal && zoneStatus && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                        Optimal range {zoneVal[0]}–{zoneVal[1]} · <span className={
                          zoneStatus === 'in range' ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                          : 'text-amber-600 dark:text-amber-400 font-medium'
                        }>{zoneStatus}</span>
                      </p>
                    )}
                    {hasDayAdj && (
                      <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700 space-y-0.5">
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 italic leading-snug">
                          RPE / soreness / DOMS are day-level adjustments — applied to the day's total, not to any single workout.
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                          <strong>DOMS</strong> = predicted by your training. <strong>Soreness</strong> = measured by you. We trust the bigger of the two.
                        </p>
                      </div>
                    )}
                  </div>
                )
              }}
            />
            {/* Optimal-range band — declared before the bars so it paints
                behind them. Range area: each datum's `zone` is [low, high]. */}
            {hasZone && (
              <Area
                dataKey="zone"
                type="monotone"
                stroke={ZONE_COLOR}
                strokeOpacity={0.35}
                strokeWidth={1}
                fill="url(#trimpZoneFill)"
                connectNulls
                isAnimationActive={false}
                activeDot={false}
              />
            )}
            {Array.from(sportTypes).map(type => (
              <Bar
                key={type}
                dataKey={type}
                stackId="trimp"
                fill={SPORT_COLORS[type] || '#94A3B8'}
                radius={[2, 2, 0, 0]}
              />
            ))}
            {hasManualExercise && (
              <Bar
                dataKey="manual_exercise"
                stackId="trimp"
                fill={MANUAL_EXERCISE_COLOR}
                radius={[2, 2, 0, 0]}
              />
            )}
            {hasDoms && (
              <Bar
                dataKey="doms_carry"
                stackId="trimp"
                fill={DOMS_COLOR}
                radius={[2, 2, 0, 0]}
              />
            )}
            {hasSoreness && (
              <Bar
                dataKey="soreness"
                stackId="trimp"
                fill={SORENESS_COLOR}
                radius={[2, 2, 0, 0]}
              />
            )}
            {/* Trailing-average load trend — declared last so it paints on
                top of the bars and band. */}
            {hasTrend && (
              <Line
                dataKey="trend"
                type="monotone"
                stroke={TREND_COLOR}
                strokeWidth={2}
                dot={range === '7d' ? { r: 2.5, fill: TREND_COLOR, strokeWidth: 0 } : false}
                activeDot={{ r: 3.5 }}
                connectNulls
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Day labels with rest day indicators — only readable at 7d. For
          longer ranges, individual rest tags would overflow the row. */}
      {range === '7d' && (
        <div className="flex gap-1.5 mt-1 px-[30px]">
          {filledDays.map((day, i) => (
            <div key={i} className="flex-1 text-center">
              {day.total === 0 && (
                <span className="text-xs text-slate-400 italic">Rest</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {hasTrend && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <span className="w-3 h-[3px] rounded-full inline-block" style={{ backgroundColor: TREND_COLOR }} />
            acute load
          </span>
        )}
        {hasZone && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <span className="w-2.5 h-2.5 rounded-sm inline-block border" style={{ backgroundColor: `${ZONE_COLOR}28`, borderColor: `${ZONE_COLOR}88` }} />
            optimal range
          </span>
        )}
        {Array.from(sportTypes).map(type => (
          <span key={type} className="flex items-center gap-1 text-xs text-slate-500">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block"
              style={{ backgroundColor: SPORT_COLORS[type] || '#94A3B8' }}
            />
            {type.replace(/_/g, ' ')}
          </span>
        ))}
        {hasManualExercise && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: MANUAL_EXERCISE_COLOR }} />
            manual exercise
          </span>
        )}
        {hasDoms && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: DOMS_COLOR }} />
            DOMS carry-over
          </span>
        )}
        {hasSoreness && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: SORENESS_COLOR }} />
            muscle soreness
          </span>
        )}
      </div>
      {hasZone && (
        <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500 leading-snug">
          <span className="font-semibold text-slate-500 dark:text-slate-400">Acute load</span> = your rolling recent training load (7-day average).
          {' '}<span className="font-semibold text-slate-500 dark:text-slate-400">Optimal range</span> = 0.8–1.3× your <Term name="acwr">chronic load</Term>.
          Inside the band = sustainable; above = ramping fast, below = backing off.
        </p>
      )}
      {(hasDoms || hasSoreness) && (
        <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500 leading-snug">
          <span className="font-semibold text-slate-500 dark:text-slate-400">DOMS</span> = predicted by your training (Peake 2017).
          {' '}<span className="font-semibold text-slate-500 dark:text-slate-400">Soreness</span> = measured by you (daily check-in).
          When both apply we keep the bigger of the two — never sum.
        </p>
      )}
    </div>
  )
}
