import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { HRZone } from '../types'
import type { StreamData } from '../utils/strava'

interface HRChartProps {
  stream: StreamData
  zones?: HRZone[]
}

export default function HRChart({ stream, zones }: HRChartProps) {
  if (!stream.heartrate.length || !stream.time.length) {
    return <p className="text-xs text-slate-400 italic">No heart rate data available</p>
  }

  // Downsample for performance (max ~200 points)
  const step = Math.max(1, Math.floor(stream.heartrate.length / 200))
  const data = stream.time
    .filter((_, i) => i % step === 0)
    .map((t, idx) => {
      const i = idx * step
      return {
        time: Math.round(t / 60), // minutes
        hr: stream.heartrate[i],
        alt: stream.altitude[i] ? Math.round(stream.altitude[i] * 3.28084) : undefined,
      }
    })

  const maxHR = Math.max(...data.map(d => d.hr).filter(Boolean))
  const minHR = Math.min(...data.map(d => d.hr).filter(Boolean))

  // Parse zone boundaries for reference lines
  const zoneBoundaries = zones?.map(z => {
    const match = z.hr.match(/(\d+)\s*[–-]\s*(\d+)/)
    if (!match) return null
    return { name: z.zone.split('–')[0].trim(), low: parseInt(match[1]), high: parseInt(match[2]) }
  }).filter(Boolean) || []

  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 mb-1">Heart Rate Over Time</p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="hrGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickFormatter={v => `${v}m`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[Math.max(60, minHR - 10), maxHR + 10]}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                padding: '6px 10px',
              }}
              formatter={(value, name) => {
                if (name === 'hr') return [`${value} bpm`, 'Heart Rate']
                if (name === 'alt') return [`${value} ft`, 'Elevation']
                return [`${value}`, `${name}`]
              }}
              labelFormatter={v => `${v} min`}
            />
            {zoneBoundaries.map((zb, i) => (
              zb && (
                <ReferenceLine
                  key={i}
                  y={zb.high}
                  stroke="#94a3b8"
                  strokeDasharray="3 3"
                  strokeWidth={0.5}
                />
              )
            ))}
            <Area
              type="monotone"
              dataKey="hr"
              stroke="#ef4444"
              strokeWidth={1.5}
              fill="url(#hrGradient)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* HR zone time summary */}
      {zones && <ZoneTimeSummary heartrates={stream.heartrate} times={stream.time} zones={zones} />}
    </div>
  )
}

function ZoneTimeSummary({ heartrates, times, zones }: { heartrates: number[]; times: number[]; zones: HRZone[] }) {
  const zoneTimes: Record<string, number> = {}
  zones.forEach(z => { zoneTimes[z.zone] = 0 })

  for (let i = 1; i < heartrates.length; i++) {
    const hr = heartrates[i]
    const dt = times[i] - times[i - 1]
    for (const z of zones) {
      const match = z.hr.match(/(\d+)\s*[–-]\s*(\d+)/)
      if (match) {
        const low = parseInt(match[1])
        const high = parseInt(match[2])
        if (hr >= low && hr <= high) {
          zoneTimes[z.zone] += dt
          break
        }
      }
    }
  }

  const totalTime = Object.values(zoneTimes).reduce((a, b) => a + b, 0)
  if (totalTime === 0) return null

  const colors = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444']

  return (
    <div className="mt-2">
      <p className="text-[10px] text-slate-500 mb-1">Time in Zone</p>
      <div className="flex rounded-full overflow-hidden h-3">
        {zones.map((z, i) => {
          const pct = (zoneTimes[z.zone] / totalTime) * 100
          if (pct < 1) return null
          return (
            <div
              key={i}
              style={{ width: `${pct}%`, backgroundColor: colors[i] || colors[0] }}
              title={`${z.zone}: ${Math.round(zoneTimes[z.zone] / 60)} min`}
            />
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
        {zones.map((z, i) => {
          const mins = Math.round(zoneTimes[z.zone] / 60)
          if (mins === 0) return null
          return (
            <span key={i} className="text-[10px] text-slate-500 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: colors[i] }} />
              {z.zone.split('–')[0].trim()}: {mins}m
            </span>
          )
        })}
      </div>
    </div>
  )
}
