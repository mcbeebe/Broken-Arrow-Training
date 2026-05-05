import type { DailyTRIMP } from '../types'
import { localDateStr } from '../utils/format'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface TRIMPBreakdownProps {
  dailyTrimp: DailyTRIMP[]
  sorenessLoadByDate?: Map<string, number>
  rpeByDate?: Map<string, number>
  exerciseLoadByDate?: Map<string, number>
  /** Engine's predicted DOMS carry per day (from useReadiness). When a
   *  soreness check-in covers the same physiological signal as the
   *  prediction, only the larger of the two contributes to day total. */
  domsCarryByDate?: Map<string, number>
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

function getLast7Days(): string[] {
  const days: string[] = []
  const today = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    days.push(localDateStr(d))
  }
  return days
}

interface Breakdown {
  records: { sportType: string; trimp: number }[]
  exerciseLoad: number
  /** True when exerciseLoad was already absorbed into a strength record
   *  via max() (engine de-dup). When true, the separate "manual exercise"
   *  row is suppressed in chart + tooltip; the strength record displays
   *  the de-dup'd value. */
  exerciseLoadAbsorbed: boolean
  /** Multiplier applied to strength records to scale them up when
   *  exerciseLoad exceeds the HR-derived strength TRIMP. 1 otherwise. */
  strengthScale: number
  rpeValue: number | null
  rpeMult: number
  rpeDelta: number   // signed
  sorenessAdj: number
  domsCarry: number  // residual carry-forward from prior days' eccentric work
  dayTotal: number
}

export default function TRIMPBreakdown({ dailyTrimp, sorenessLoadByDate, rpeByDate, exerciseLoadByDate, domsCarryByDate }: TRIMPBreakdownProps) {
  const last7Days = getLast7Days()

  // Build a lookup from existing TRIMP data
  const trimpByDate = new Map(dailyTrimp.map(d => [d.date, d]))

  // Fill all 7 days, including rest days with 0
  const filledDays: DailyTRIMP[] = last7Days.map(date => {
    const existing = trimpByDate.get(date)
    if (existing) return existing
    return { date, total: 0, records: [] }
  })

  const weeklyTotal = Math.round(filledDays.reduce((s, d) => s + d.total, 0))

  // Per-day decomposition. After useReadiness applies its dedup logic:
  //   day.total = (recordSum + exerciseLoad) × rpeMult
  //             + max(domsCarry, sorenessAdj_positive)
  //             + sorenessAdj_negative
  // We use the engine's predicted domsCarry directly (passed in from
  // useReadiness) so the chart matches the hook's source of truth, and
  // splits "DOMS carry-over (predicted)" from "muscle soreness above
  // prediction" in the tooltip when both apply.
  const breakdownByMMDD = new Map<string, Breakdown>()
  for (const day of filledDays) {
    const recordSum = day.records.reduce((s, r) => s + r.adjustedTRIMP, 0)
    const exerciseLoad = exerciseLoadByDate?.get(day.date) ?? 0
    const rpeValue = rpeByDate?.get(day.date) ?? null
    const rpeMult = rpeValue ? 1 + 0.04 * (rpeValue - 5) : 1
    const sorenessAdj = sorenessLoadByDate?.get(day.date) ?? 0
    const domsCarry = domsCarryByDate?.get(day.date) ?? 0

    // Mirror the engine's strength dedup so the chart bar heights add up
    // to day.total. When a Garmin strength record is present alongside
    // exerciseLoad (rep×weight calc from same session's exerciseSets), the
    // engine takes max(strengthHR, exerciseLoad) instead of summing.
    const strengthHRTRIMP = day.records
      .filter(r => r.sportType.startsWith('strength_'))
      .reduce((s, r) => s + r.adjustedTRIMP, 0)
    const exerciseLoadAbsorbed = strengthHRTRIMP > 0 && exerciseLoad > 0
    const strengthScale = strengthHRTRIMP > 0 && exerciseLoad > strengthHRTRIMP
      ? exerciseLoad / strengthHRTRIMP
      : 1
    // Effective non-RPE record sum after dedup, used for rpeDelta below.
    const effectiveRecordSum = recordSum - strengthHRTRIMP + strengthHRTRIMP * strengthScale
    const effectiveExerciseLoad = exerciseLoadAbsorbed ? 0 : exerciseLoad
    const rpeDelta = (effectiveRecordSum + effectiveExerciseLoad) * (rpeMult - 1)

    breakdownByMMDD.set(day.date.slice(5), {
      records: day.records.map(r => ({ sportType: r.sportType, trimp: r.adjustedTRIMP })),
      exerciseLoad,
      exerciseLoadAbsorbed,
      strengthScale,
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
    const bd = breakdownByMMDD.get(day.date.slice(5))!
    const entry: Record<string, string | number> = {
      date: day.date.slice(5),
      _isRest: bd.dayTotal === 0 ? 1 : 0,
    }
    for (const r of bd.records) {
      const isStrength = r.sportType.startsWith('strength_')
      const scaled = isStrength ? r.trimp * bd.strengthScale : r.trimp
      const v = Math.round(scaled * bd.rpeMult * 10) / 10
      if (v > 0.5) entry[r.sportType] = ((entry[r.sportType] as number) || 0) + v
    }
    // Only show "manual exercise" as a separate segment when it isn't
    // already absorbed into a strength record via max() dedup.
    if (!bd.exerciseLoadAbsorbed && bd.exerciseLoad > 0.5) {
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
  for (const entry of chartData) {
    if (entry['manual_exercise']) hasManualExercise = true
    if (entry['doms_carry']) hasDoms = true
    if (entry['soreness']) hasSoreness = true
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <p className="text-base font-semibold text-slate-700">7-Day Training Load</p>
          <p className="text-sm text-slate-500">Garmin EPOC · MIM-adjusted · DOMS &amp; soreness</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-800">{weeklyTotal}</p>
          <p className="text-xs text-slate-500 uppercase">Weekly Load</p>
        </div>
      </div>
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barCategoryGap="15%">
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: '#94A3B8' }}
              axisLine={false}
              tickLine={false}
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
                const { active, label } = props as { active?: boolean; label?: string | number }
                if (!active || label == null) return null
                const bd = breakdownByMMDD.get(String(label))
                if (!bd || bd.dayTotal <= 0) return null

                interface Row { swatch: string; name: string; value: number; signed?: boolean; subtitle?: string }
                const rows: Row[] = []
                for (const r of bd.records) {
                  const isStrength = r.sportType.startsWith('strength_')
                  const scaled = isStrength ? r.trimp * bd.strengthScale : r.trimp
                  const subtitle = isStrength && bd.exerciseLoadAbsorbed
                    ? bd.strengthScale > 1
                      ? `(HR ${Math.round(r.trimp)} + rep load ${Math.round(bd.exerciseLoad)} → larger wins)`
                      : '(HR captured the session; rep load absorbed)'
                    : undefined
                  rows.push({
                    swatch: SPORT_COLORS[r.sportType] || '#94A3B8',
                    name: r.sportType.replace(/_/g, ' '),
                    value: scaled,
                    subtitle,
                  })
                }
                // Only surface a separate "manual exercise" row when it
                // hasn't been absorbed into a strength record via dedup.
                if (!bd.exerciseLoadAbsorbed && bd.exerciseLoad > 0.5) {
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
                    <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">{label}</p>
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
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Day labels with rest day indicators */}
      <div className="flex gap-1.5 mt-1 px-[30px]">
        {filledDays.map((day, i) => (
          <div key={i} className="flex-1 text-center">
            {day.total === 0 && (
              <span className="text-xs text-slate-400 italic">Rest</span>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
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
