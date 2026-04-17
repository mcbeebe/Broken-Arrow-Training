import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { StreamData } from '../utils/strava'
import ChartExpandOverlay from './ChartExpandOverlay'

interface PaceChartProps {
  stream: StreamData
}

export default function PaceChart({ stream }: PaceChartProps) {
  if (!stream.velocity || stream.velocity.length === 0) return null
  if (!stream.time || stream.time.length === 0) return null

  const hasElevation = stream.altitude && stream.altitude.some(a => a > 0)

  const step = Math.max(1, Math.floor(stream.velocity.length / 200))
  const data = stream.time
    .filter((_, i) => i % step === 0)
    .map((t, idx) => {
      const i = idx * step
      const vMps = stream.velocity[i] || 0
      const paceMinMi = vMps > 0.3 ? 26.8224 / vMps : null
      const paceClean = paceMinMi != null && paceMinMi < 25 && paceMinMi > 3
        ? paceMinMi
        : null
      const altFt = hasElevation && stream.altitude[i]
        ? Math.round(stream.altitude[i] * 3.28084)
        : undefined
      return {
        time: Math.round(t / 60),
        pace: paceClean,
        alt: altFt,
      }
    })

  const paceValues = data.map(d => d.pace).filter((p): p is number => p != null)
  if (paceValues.length === 0) return null
  const minPace = Math.max(3, Math.min(...paceValues) - 0.5)
  const maxPace = Math.min(25, Math.max(...paceValues) + 0.5)

  const altValues = data.map(d => d.alt).filter((a): a is number => a != null)
  const minAlt = altValues.length > 0 ? Math.min(...altValues) : 0
  const maxAlt = altValues.length > 0 ? Math.max(...altValues) : 0
  const altDomain = altValues.length > 0
    ? [Math.max(0, minAlt - 50), maxAlt + 50]
    : [0, 1]

  const renderChart = (expanded: boolean) => (
    <div>
      {!expanded && (
        <div className="flex items-center justify-between mb-1 mt-3">
          <p className="text-xs font-semibold text-slate-600">Pace & Elevation</p>
          <span className="text-[10px] text-slate-400">Tap to expand</span>
        </div>
      )}
      <div className={expanded ? 'h-full min-h-[300px]' : 'h-40'}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 5, left: expanded ? 0 : -10, bottom: 0 }}>
            <defs>
              <linearGradient id={expanded ? 'elevGradientExp' : 'elevGradient'} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={expanded ? '#94a3b8' : '#94a3b8'} stopOpacity={0.3} />
                <stop offset="95%" stopColor={expanded ? '#94a3b8' : '#94a3b8'} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tick={{ fontSize: expanded ? 12 : 10, fill: expanded ? '#cbd5e1' : '#94a3b8' }}
              tickFormatter={v => `${v}m`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="pace"
              reversed
              domain={[minPace, maxPace]}
              tick={{ fontSize: expanded ? 12 : 10, fill: expanded ? '#cbd5e1' : '#94a3b8' }}
              tickFormatter={v => formatPace(v)}
              axisLine={false}
              tickLine={false}
              width={42}
            />
            {hasElevation && (
              <YAxis
                yAxisId="alt"
                orientation="right"
                domain={altDomain}
                tick={{ fontSize: expanded ? 12 : 10, fill: expanded ? '#cbd5e1' : '#94a3b8' }}
                tickFormatter={v => `${Math.round(v)}'`}
                axisLine={false}
                tickLine={false}
                width={38}
              />
            )}
            <Tooltip
              contentStyle={{
                fontSize: expanded ? 14 : 12,
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                padding: '6px 10px',
                backgroundColor: expanded ? '#1e293b' : '#ffffff',
                color: expanded ? '#f1f5f9' : '#1e293b',
              }}
              formatter={(value, name) => {
                if (name === 'pace' && typeof value === 'number') {
                  return [formatPace(value) + ' /mi', 'Pace']
                }
                if (name === 'alt') return [`${value} ft`, 'Elevation']
                return [`${value}`, `${name}`]
              }}
              labelFormatter={v => `${v} min`}
            />
            {hasElevation && (
              <Area
                yAxisId="alt"
                type="monotone"
                dataKey="alt"
                stroke={expanded ? '#64748b' : '#94a3b8'}
                strokeWidth={1}
                fill={expanded ? 'url(#elevGradientExp)' : 'url(#elevGradient)'}
                dot={false}
                isAnimationActive={false}
              />
            )}
            <Line
              yAxisId="pace"
              type="monotone"
              dataKey="pace"
              stroke="#0d9488"
              strokeWidth={expanded ? 2 : 1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )

  return (
    <ChartExpandOverlay title="Pace & Elevation">
      {renderChart}
    </ChartExpandOverlay>
  )
}

function formatPace(minMi: number): string {
  const m = Math.floor(minMi)
  const s = Math.round((minMi - m) * 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
