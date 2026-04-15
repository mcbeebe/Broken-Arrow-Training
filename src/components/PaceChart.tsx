import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { StreamData } from '../utils/strava'

interface PaceChartProps {
  stream: StreamData
}

/**
 * Pace + elevation chart. Reads `velocity` (m/s) and `altitude` (m) from
 * the StreamData. Pace is inverted — faster speed = lower pace number —
 * so the Y axis is reversed so "up" means "harder/faster."
 *
 * Pace here is min/mile. We mask any implausibly slow pace (> 25 min/mi,
 * usually a stop or GPS dropout) so walking breaks don't destroy the
 * Y-axis scale.
 */
export default function PaceChart({ stream }: PaceChartProps) {
  if (!stream.velocity || stream.velocity.length === 0) return null
  if (!stream.time || stream.time.length === 0) return null

  const hasElevation = stream.altitude && stream.altitude.some(a => a > 0)

  // Downsample for perf
  const step = Math.max(1, Math.floor(stream.velocity.length / 200))
  const data = stream.time
    .filter((_, i) => i % step === 0)
    .map((t, idx) => {
      const i = idx * step
      const vMps = stream.velocity[i] || 0
      // Convert m/s → min/mile. 1609.344 m/mi, 60 s/min.
      // pace(min/mi) = 1609.344 / (v * 60) = 26.8224 / v
      const paceMinMi = vMps > 0.3 ? 26.8224 / vMps : null
      // Clip absurd values
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
  // Give elevation a bit of headroom so it sits below pace visually
  const altDomain = altValues.length > 0
    ? [Math.max(0, minAlt - 50), maxAlt + 50]
    : [0, 1]

  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-slate-600 mb-1">Pace & Elevation</p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="elevGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickFormatter={v => `${v}m`}
              axisLine={false}
              tickLine={false}
            />
            {/* Left axis: pace (reversed — lower min/mi on top) */}
            <YAxis
              yAxisId="pace"
              reversed
              domain={[minPace, maxPace]}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickFormatter={v => formatPace(v)}
              axisLine={false}
              tickLine={false}
              width={42}
            />
            {/* Right axis: elevation (optional) */}
            {hasElevation && (
              <YAxis
                yAxisId="alt"
                orientation="right"
                domain={altDomain}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickFormatter={v => `${Math.round(v)}'`}
                axisLine={false}
                tickLine={false}
                width={38}
              />
            )}
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                padding: '6px 10px',
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
                stroke="#94a3b8"
                strokeWidth={1}
                fill="url(#elevGradient)"
                dot={false}
                isAnimationActive={false}
              />
            )}
            <Line
              yAxisId="pace"
              type="monotone"
              dataKey="pace"
              stroke="#0d9488"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function formatPace(minMi: number): string {
  const m = Math.floor(minMi)
  const s = Math.round((minMi - m) * 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
