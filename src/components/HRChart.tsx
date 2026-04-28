import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts'
import type { HRZone, SportType } from '../types'
import type { StreamData } from '../utils/strava'
import { parseZoneRange, HR_ZONE_TOLERANCE_BPM } from '../utils/zones'
import ChartExpandOverlay from './ChartExpandOverlay'
import ZoneBreakdownTable from './ZoneBreakdownTable'

interface HRChartProps {
  stream: StreamData
  zones?: HRZone[]
  targetZone?: string
  /** When set, the minute-by-minute table picks up Grade + MIM columns
   *  (running variants → Minetti run polynomial; hiking variants →
   *  Minetti walk; other sports show grade only). */
  sportType?: SportType
}

export default function HRChart({ stream, zones, targetZone, sportType }: HRChartProps) {
  if (!stream.heartrate.length || !stream.time.length) {
    return <p className="text-xs text-slate-400 italic">No heart rate data available</p>
  }

  const step = Math.max(1, Math.floor(stream.heartrate.length / 200))
  const data = stream.time
    .filter((_, i) => i % step === 0)
    .map((t, idx) => {
      const i = idx * step
      return {
        time: Math.round(t / 60),
        hr: stream.heartrate[i],
        alt: stream.altitude[i] ? Math.round(stream.altitude[i] * 3.28084) : undefined,
      }
    })

  const maxHR = Math.max(...data.map(d => d.hr).filter(Boolean))
  const minHR = Math.min(...data.map(d => d.hr).filter(Boolean))

  const zoneBoundaries = zones?.map(z => {
    const match = z.hr.match(/(\d+)\s*[–-]\s*(\d+)/)
    if (!match) return null
    return { name: z.zone.split('–')[0].trim(), low: parseInt(match[1]), high: parseInt(match[2]) }
  }).filter(Boolean) || []

  const target = targetZone ? parseZoneRange(targetZone) : null

  const yMin = Math.max(60, minHR - 10)
  const yMax = maxHR + 10

  const renderChart = (expanded: boolean) => (
    <div>
      {!expanded && (
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Heart Rate Over Time</p>
          <span className="text-[10px] text-slate-400">Tap to expand</span>
        </div>
      )}
      <div style={expanded ? { width: '100%', height: 'calc(100vh - 120px)' } : undefined} className={expanded ? '' : 'h-40'}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: expanded ? 0 : -20, bottom: 0 }}>
            <defs>
              <linearGradient id={expanded ? 'hrGradientExp' : 'hrGradient'} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
              </linearGradient>
              {target && (
                <linearGradient id={expanded ? 'targetZoneGradExp' : 'targetZoneGrad'} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0.15} />
                </linearGradient>
              )}
            </defs>
            {target && (
              <ReferenceArea
                y1={Math.max(target.low, yMin)}
                y2={Math.min(target.high, yMax)}
                fill={expanded ? 'url(#targetZoneGradExp)' : 'url(#targetZoneGrad)'}
                stroke="#22c55e"
                strokeOpacity={0.4}
                strokeDasharray="4 4"
              />
            )}
            <XAxis
              dataKey="time"
              tick={{ fontSize: expanded ? 12 : 10, fill: document.documentElement.classList.contains('dark') ? '#cbd5e1' : '#64748b' }}
              tickFormatter={v => `${v}m`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: expanded ? 12 : 10, fill: document.documentElement.classList.contains('dark') ? '#cbd5e1' : '#64748b' }}
              axisLine={false}
              tickLine={false}
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
                  stroke={document.documentElement.classList.contains('dark') ? '#475569' : '#94a3b8'}
                  strokeDasharray="3 3"
                  strokeWidth={0.5}
                />
              )
            ))}
            {target && (
              <>
                <ReferenceLine
                  y={target.low}
                  stroke="#22c55e"
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  label={expanded ? { value: `${target.low}`, position: 'left', fill: '#22c55e', fontSize: 11 } : undefined}
                />
                <ReferenceLine
                  y={target.high}
                  stroke="#22c55e"
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  label={expanded ? { value: `${target.high}`, position: 'left', fill: '#22c55e', fontSize: 11 } : undefined}
                />
              </>
            )}
            <Area
              type="monotone"
              dataKey="hr"
              stroke="#ef4444"
              strokeWidth={expanded ? 2 : 1.5}
              fill={expanded ? 'url(#hrGradientExp)' : 'url(#hrGradient)'}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {expanded && target && (
        <div className="flex items-center gap-2 mt-2 px-2">
          <span className="w-3 h-3 rounded-sm border-2 border-green-500 bg-green-500/20" />
          <span className="text-xs text-slate-300">Target zone: {target.low}–{target.high} bpm</span>
        </div>
      )}
    </div>
  )

  return (
    <div>
      <ChartExpandOverlay
        title="Heart Rate"
        stream={stream}
        zones={zones}
        targetZone={targetZone}
        initialMetric="hr"
      >
        {renderChart}
      </ChartExpandOverlay>

      {zones && (
        <ZoneComplianceSummary
          heartrates={stream.heartrate}
          times={stream.time}
          zones={zones}
          targetZone={targetZone}
        />
      )}

      {targetZone && (
        <ZoneBreakdownTable
          heartrates={stream.heartrate}
          times={stream.time}
          altitude={stream.altitude}
          distance={stream.distance}
          targetZone={targetZone}
          sportType={sportType}
        />
      )}
    </div>
  )
}

const ZONE_COLORS = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444']

function ZoneComplianceSummary({
  heartrates, times, zones, targetZone,
}: {
  heartrates: number[]
  times: number[]
  zones: HRZone[]
  targetZone?: string
}) {
  const target = targetZone ? parseZoneRange(targetZone) : null

  const zoneTimes: Record<string, number> = {}
  zones.forEach(z => { zoneTimes[z.zone] = 0 })

  let inTargetSeconds = 0
  let totalSeconds = 0

  for (let i = 1; i < heartrates.length; i++) {
    const hr = heartrates[i]
    const dt = times[i] - times[i - 1]
    if (dt <= 0 || dt > 30) continue
    totalSeconds += dt

    if (target && hr >= target.low - HR_ZONE_TOLERANCE_BPM && hr <= target.high + HR_ZONE_TOLERANCE_BPM) {
      inTargetSeconds += dt
    }

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

  if (totalSeconds === 0) return null

  const inTargetPct = target ? Math.round((inTargetSeconds / totalSeconds) * 100) : null
  const inTargetMin = Math.round(inTargetSeconds / 60)
  const totalMin = Math.round(totalSeconds / 60)

  const complianceColor =
    inTargetPct === null ? '#94a3b8' :
    inTargetPct >= 75 ? '#22c55e' :
    inTargetPct >= 50 ? '#eab308' :
    '#ef4444'

  const complianceLabel =
    inTargetPct === null ? '' :
    inTargetPct >= 75 ? 'On Target' :
    inTargetPct >= 50 ? 'Close' :
    'Off Target'

  return (
    <div className="mt-3">
      {target && inTargetPct !== null && (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3 mb-2 border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Target Zone Compliance</p>
              <p className="text-[11px] text-slate-400">{target.low}–{target.high} bpm</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold" style={{ color: complianceColor }}>{inTargetPct}%</p>
              <p className="text-[10px] font-semibold" style={{ color: complianceColor }}>{complianceLabel}</p>
            </div>
          </div>

          {/* Compliance ring / progress bar */}
          <div className="relative h-4 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all"
              style={{ width: `${inTargetPct}%`, backgroundColor: complianceColor }}
            />
            {/* 75% threshold marker */}
            <div className="absolute inset-y-0 left-[75%] w-px bg-slate-400/60" />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-slate-400">{inTargetMin} of {totalMin} min in zone</span>
            <span className="text-[10px] text-slate-400">75% goal</span>
          </div>
        </div>
      )}

      {/* Zone breakdown bar */}
      <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">Time in Zone</p>
      <div className="flex rounded-full overflow-hidden h-3">
        {zones.map((z, i) => {
          const pct = (zoneTimes[z.zone] / totalSeconds) * 100
          if (pct < 1) return null
          const isTarget = target ? isZoneInTarget(z.hr, target.low, target.high) : false
          return (
            <div
              key={i}
              className="relative"
              style={{ width: `${pct}%`, backgroundColor: ZONE_COLORS[i] || ZONE_COLORS[0] }}
              title={`${z.zone}: ${Math.round(zoneTimes[z.zone] / 60)} min`}
            >
              {isTarget && (
                <div className="absolute inset-0 border-y-2 border-white/70" />
              )}
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
        {zones.map((z, i) => {
          const secs = zoneTimes[z.zone]
          const mins = Math.round(secs / 60)
          const pct = Math.round((secs / totalSeconds) * 100)
          if (mins === 0 && pct === 0) return null
          const isTarget = target ? isZoneInTarget(z.hr, target.low, target.high) : false
          return (
            <span key={i} className={`text-[10px] flex items-center gap-1 ${isTarget ? 'text-slate-700 dark:text-slate-200 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: ZONE_COLORS[i] }} />
              {z.zone.split('–')[0].trim()}: {mins}m ({pct}%)
              {isTarget && <span className="text-green-600 text-[8px]">TARGET</span>}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function isZoneInTarget(zoneHrStr: string, targetLow: number, targetHigh: number): boolean {
  const match = zoneHrStr.match(/(\d+)\s*[–-]\s*(\d+)/)
  if (!match) return false
  const low = parseInt(match[1])
  const high = parseInt(match[2])
  return high >= targetLow && low <= targetHigh
}
