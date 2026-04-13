import type { DailyTRIMP } from '../types'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface TRIMPBreakdownProps {
  dailyTrimp: DailyTRIMP[]
}

const SPORT_COLORS: Record<string, string> = {
  running: '#059669',
  trail_running: '#10B981',
  cycling: '#3B82F6',
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
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

export default function TRIMPBreakdown({ dailyTrimp }: TRIMPBreakdownProps) {
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

  // Build chart data: each day gets a stacked bar by sport type
  const chartData = filledDays.map(day => {
    const entry: Record<string, string | number> = {
      date: day.date.slice(5), // MM-DD
      _isRest: day.total === 0 ? 1 : 0,
    }
    for (const rec of day.records) {
      const key = rec.sportType
      entry[key] = ((entry[key] as number) || 0) + rec.adjustedTRIMP
    }
    // Ensure rest days show a tiny bar for visibility
    if (day.total === 0) {
      entry['rest'] = 0
    }
    return entry
  })

  // Get all sport types present
  const sportTypes = new Set<string>()
  for (const day of filledDays) {
    for (const rec of day.records) {
      sportTypes.add(rec.sportType)
    }
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">7-Day Training Load</p>
          <p className="text-xs text-slate-400">Garmin EPOC (primary) + Banister TRIMP (fallback) · MIM-adjusted</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-slate-800">{weeklyTotal}</p>
          <p className="text-[10px] text-slate-400 uppercase">Weekly Load</p>
        </div>
      </div>
      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barCategoryGap="15%">
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#94A3B8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#94A3B8' }}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
              formatter={(value, name) => {
                if (name === '_isRest' || name === 'rest') return [null, null]
                return [
                  `${Math.round(Number(value))} TRIMP`,
                  String(name).replace('_', ' '),
                ]
              }}
              itemSorter={() => 0}
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
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Day labels with rest day indicators */}
      <div className="flex gap-1.5 mt-1 px-[30px]">
        {filledDays.map((day, i) => (
          <div key={i} className="flex-1 text-center">
            {day.total === 0 && (
              <span className="text-[9px] text-slate-300 italic">Rest</span>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {Array.from(sportTypes).map(type => (
          <span key={type} className="flex items-center gap-1 text-[10px] text-slate-500">
            <span
              className="w-2 h-2 rounded-sm inline-block"
              style={{ backgroundColor: SPORT_COLORS[type] || '#94A3B8' }}
            />
            {type.replace('_', ' ')}
          </span>
        ))}
      </div>
    </div>
  )
}
