import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { StreamData } from '../utils/strava'
import ChartExpandOverlay from './ChartExpandOverlay'

interface ElevationChartProps {
  stream: StreamData
}

// Grade color bands, in absolute %. 5-pct blocks keep the legend simple
// even though descents and ascents of the same magnitude color the same
// (downhill pounding is still a load signal).
// NOTE: mirrored in ChartExpandOverlay.tsx — kept local to avoid an
// ElevationChart → ChartExpandOverlay → ElevationChart import cycle.
function gradeColor(grade: number): string {
  const g = Math.abs(grade)
  if (g < 5) return '#22c55e'   // green-500
  if (g < 10) return '#eab308'  // yellow-500
  if (g < 15) return '#f97316'  // orange-500
  if (g < 20) return '#ef4444'  // red-500
  return '#7f1d1d'              // red-900 — stairs / extreme
}

// Window for the rolling grade estimate. Units: **meters of horizontal
// distance along the path** (summed GPS-leg lengths from stream.distance).
// 40m total (±20m around each sample) is tight enough to show punchy
// climbs but wide enough to not chase altimeter noise — at 10 min/mi
// that's ~15 seconds of running per window.
const GRADE_WINDOW_METERS = 40

export default function ElevationChart({ stream }: ElevationChartProps) {
  if (!stream.altitude?.length || !stream.distance?.length || !stream.time?.length) return null
  if (stream.altitude.every(a => !a)) return null

  const step = Math.max(1, Math.floor(stream.altitude.length / 200))
  const data = stream.time
    .filter((_, i) => i % step === 0)
    .map((_, idx) => {
      const i = idx * step
      let lo = i, hi = i
      while (lo > 0 && stream.distance[i] - stream.distance[lo - 1] < GRADE_WINDOW_METERS / 2) lo--
      while (hi < stream.distance.length - 1 && stream.distance[hi + 1] - stream.distance[i] < GRADE_WINDOW_METERS / 2) hi++
      const dDist = stream.distance[hi] - stream.distance[lo]
      const dElev = stream.altitude[hi] - stream.altitude[lo]
      const grade = dDist > 0 ? (dElev / dDist) * 100 : 0
      return {
        dist: Math.round((stream.distance[i] / 1609.344) * 100) / 100,
        alt: Math.round(stream.altitude[i] * 3.28084),
        grade: Math.round(grade * 10) / 10,
      }
    })

  if (data.length === 0) return null

  const altValues = data.map(d => d.alt)
  const minAlt = Math.min(...altValues)
  const maxAlt = Math.max(...altValues)
  const yMin = Math.max(0, minAlt - 50)
  const yMax = maxAlt + 50

  // Cumulative ascent from the smoothed per-sample altitude — close
  // enough for a chart caption. The canonical Strava elevation gain
  // lives on `actual.elevationGain`.
  let totalGain = 0
  for (let i = 1; i < data.length; i++) {
    const diff = data[i].alt - data[i - 1].alt
    if (diff > 0) totalGain += diff
  }

  const renderChart = (expanded: boolean) => (
    <div>
      {!expanded && (
        <div className="flex items-center justify-between mb-1 mt-3">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Elevation & Grade</p>
          <span className="text-[10px] text-slate-400">+{Math.round(totalGain)} ft · Tap to expand</span>
        </div>
      )}
      <div style={expanded ? { width: '100%', height: 'calc(100vh - 120px)' } : undefined} className={expanded ? '' : 'h-40'}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: expanded ? 0 : -20, bottom: 0 }}>
            <defs>
              <linearGradient id={expanded ? 'elevGradeFillExp' : 'elevGradeFill'} x1="0" y1="0" x2="1" y2="0">
                {data.map((d, i) => (
                  <stop
                    key={i}
                    offset={`${(i / Math.max(1, data.length - 1)) * 100}%`}
                    stopColor={gradeColor(d.grade)}
                    stopOpacity={0.5}
                  />
                ))}
              </linearGradient>
              <linearGradient id={expanded ? 'elevGradeStrokeExp' : 'elevGradeStroke'} x1="0" y1="0" x2="1" y2="0">
                {data.map((d, i) => (
                  <stop
                    key={i}
                    offset={`${(i / Math.max(1, data.length - 1)) * 100}%`}
                    stopColor={gradeColor(d.grade)}
                    stopOpacity={1}
                  />
                ))}
              </linearGradient>
            </defs>
            <XAxis
              dataKey="dist"
              type="number"
              domain={['dataMin', 'dataMax']}
              tick={{ fontSize: expanded ? 12 : 10, fill: document.documentElement.classList.contains('dark') ? '#cbd5e1' : '#64748b' }}
              tickFormatter={v => `${v} mi`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: expanded ? 12 : 10, fill: document.documentElement.classList.contains('dark') ? '#cbd5e1' : '#64748b' }}
              tickFormatter={v => `${v}'`}
              axisLine={false}
              tickLine={false}
              width={42}
            />
            <Tooltip
              contentStyle={{
                fontSize: expanded ? 14 : 12,
                borderRadius: 8,
                border: document.documentElement.classList.contains('dark') ? '1px solid #334155' : '1px solid #e2e8f0',
                padding: '6px 10px',
                backgroundColor: document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff',
                color: document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#1e293b',
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: unknown, name: unknown, props: any) => {
                if (name === 'alt') {
                  const g = props?.payload?.grade
                  return [`${value} ft${g != null ? ` · ${g}%` : ''}`, 'Elevation']
                }
                return [`${value}`, `${name}`]
              }}
              labelFormatter={v => `mile ${v}`}
            />
            <Area
              type="monotone"
              dataKey="alt"
              stroke={expanded ? 'url(#elevGradeStrokeExp)' : 'url(#elevGradeStroke)'}
              strokeWidth={expanded ? 2 : 1.5}
              fill={expanded ? 'url(#elevGradeFillExp)' : 'url(#elevGradeFill)'}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {expanded && (
        <div className="flex items-center gap-3 flex-wrap mt-2 px-2 text-xs text-slate-500 dark:text-slate-300">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: '#22c55e' }} />0–5%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: '#eab308' }} />5–10%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: '#f97316' }} />10–15%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: '#ef4444' }} />15–20%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: '#7f1d1d' }} />20%+</span>
          <span className="ml-auto">Total gain: +{Math.round(totalGain)} ft</span>
        </div>
      )}
    </div>
  )

  return (
    <ChartExpandOverlay title="Elevation & Grade" stream={stream} initialMetric="elevation">
      {renderChart}
    </ChartExpandOverlay>
  )
}
