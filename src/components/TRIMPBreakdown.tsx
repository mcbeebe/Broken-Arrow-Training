import type { DailyTRIMP } from '../types'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface TRIMPBreakdownProps {
  dailyTrimp: DailyTRIMP[]
}

const SPORT_COLORS: Record<string, string> = {
  running: '#059669',
  trail_running: '#10B981',
  cycling: '#3B82F6',
  hiking: '#D97706',
  swimming: '#06B6D4',
  strength_training: '#7C3AED',
  yoga: '#EC4899',
  walking: '#64748B',
  elliptical: '#F59E0B',
  other: '#94A3B8',
}

export default function TRIMPBreakdown({ dailyTrimp }: TRIMPBreakdownProps) {
  // Take last 7 days
  const recent = dailyTrimp.slice(-7)
  const weeklyTotal = Math.round(recent.reduce((s, d) => s + d.total, 0))

  // Build chart data: each day gets a stacked bar by sport type
  const chartData = recent.map(day => {
    const entry: Record<string, string | number> = {
      date: day.date.slice(5), // MM-DD
    }
    // Aggregate by sport type
    for (const rec of day.records) {
      const key = rec.sportType
      entry[key] = ((entry[key] as number) || 0) + rec.adjustedTRIMP
    }
    return entry
  })

  // Get all sport types present
  const sportTypes = new Set<string>()
  for (const day of recent) {
    for (const rec of day.records) {
      sportTypes.add(rec.sportType)
    }
  }

  if (recent.length === 0) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <p className="text-sm font-semibold text-slate-700">Training Load</p>
        <p className="text-xs text-slate-400 mt-1">No activity data yet</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">7-Day Training Load</p>
          <p className="text-xs text-slate-400">Adjusted TRIMP by activity type</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-slate-800">{weeklyTotal}</p>
          <p className="text-[10px] text-slate-400 uppercase">Weekly TRIMP</p>
        </div>
      </div>
      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barCategoryGap="20%">
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
              formatter={(value, name) => [
                `${Math.round(Number(value))} TRIMP`,
                String(name).replace('_', ' '),
              ]}
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
