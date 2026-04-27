import type { DailyTRIMP } from '../types'
import { localDateStr } from '../utils/format'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface TRIMPBreakdownProps {
  dailyTrimp: DailyTRIMP[]
  sorenessLoadByDate?: Map<string, number>
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

export default function TRIMPBreakdown({ dailyTrimp, sorenessLoadByDate }: TRIMPBreakdownProps) {
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

  // Build chart data: each day gets a stacked bar by sport type.
  // The adjusted daily total may be higher than the sum of records
  // due to manual exercise load and RPE boost — show these as
  // separate bar segments so the chart reflects the true load.
  const chartData = filledDays.map(day => {
    const entry: Record<string, string | number> = {
      date: day.date.slice(5), // MM-DD
      _isRest: day.total === 0 ? 1 : 0,
    }
    let recordSum = 0
    for (const rec of day.records) {
      const key = rec.sportType
      entry[key] = ((entry[key] as number) || 0) + rec.adjustedTRIMP
      recordSum += rec.adjustedTRIMP
    }
    // Split supplement into three distinct categories:
    // 1. Soreness check-in (user input, any day)
    // 2. RPE + exercise boost (on days WITH activities — from RPE multiplier and manual exercises)
    // 3. DOMS carry-over (on days WITHOUT activities — delayed muscle damage from prior days)
    const supplement = day.total - recordSum
    if (supplement > 0.5) {
      const sorenessAdj = sorenessLoadByDate?.get(day.date) || 0
      const sorenessInSupplement = Math.max(0, Math.min(sorenessAdj, supplement))
      const otherSupplement = supplement - sorenessInSupplement

      if (sorenessInSupplement > 0.5) {
        entry['soreness'] = Math.round(sorenessInSupplement * 10) / 10
      }
      if (otherSupplement > 0.5) {
        // If this day has its own activity records, the supplement is from RPE/exercise.
        // If it has no records (rest day), the supplement is DOMS carry from prior days.
        const key = day.records.length > 0 ? 'rpe_exercise' : 'doms_carry'
        entry[key] = Math.round(otherSupplement * 10) / 10
      }
    }
    // Ensure rest days show a tiny bar for visibility
    if (day.total === 0) {
      entry['rest'] = 0
    }
    return entry
  })

  // Get all sport types and supplement categories present
  const sportTypes = new Set<string>()
  let hasRpeExercise = false
  let hasDoms = false
  let hasSoreness = false
  for (const day of filledDays) {
    for (const rec of day.records) {
      sportTypes.add(rec.sportType)
    }
  }
  for (const entry of chartData) {
    if (entry['rpe_exercise']) hasRpeExercise = true
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
                const { active, payload, label } = props as {
                  active?: boolean
                  payload?: ReadonlyArray<{ name?: string | number; value?: string | number; color?: string }>
                  label?: string | number
                }
                if (!active || !payload || payload.length === 0) return null
                const rows = payload.filter(p => p.name !== '_isRest' && p.name !== 'rest' && p.value != null && Number(p.value) > 0)
                if (rows.length === 0) return null
                const hasDayAdj = rows.some(p => p.name === 'rpe_exercise' || p.name === 'doms_carry' || p.name === 'soreness')
                const friendly = (n: string | number | undefined) =>
                  n === 'soreness' ? 'muscle soreness'
                  : n === 'doms_carry' ? 'DOMS carry-over'
                  : n === 'rpe_exercise' ? 'RPE + exercise boost'
                  : String(n ?? '').replace(/_/g, ' ')
                return (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md px-3 py-2 text-[13px]">
                    <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">{label}</p>
                    {rows.map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-sm inline-block shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="text-slate-600 dark:text-slate-300">{friendly(p.name)}</span>
                        <span className="ml-auto font-medium text-slate-700 dark:text-slate-200">
                          {Math.round(Number(p.value))} TRIMP
                        </span>
                      </div>
                    ))}
                    {hasDayAdj && (
                      <p className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400 italic leading-snug">
                        RPE / soreness / DOMS are day-level adjustments — applied to the day's total, not to any single workout.
                      </p>
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
            {hasRpeExercise && (
              <Bar
                dataKey="rpe_exercise"
                stackId="trimp"
                fill="#F59E0B"
                radius={[2, 2, 0, 0]}
              />
            )}
            {hasDoms && (
              <Bar
                dataKey="doms_carry"
                stackId="trimp"
                fill="#FB923C"
                radius={[2, 2, 0, 0]}
              />
            )}
            {hasSoreness && (
              <Bar
                dataKey="soreness"
                stackId="trimp"
                fill="#F87171"
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
        {hasRpeExercise && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#F59E0B' }} />
            RPE + exercise
          </span>
        )}
        {hasDoms && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#FB923C' }} />
            DOMS carry-over
          </span>
        )}
        {hasSoreness && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#F87171' }} />
            muscle soreness
          </span>
        )}
      </div>
    </div>
  )
}
