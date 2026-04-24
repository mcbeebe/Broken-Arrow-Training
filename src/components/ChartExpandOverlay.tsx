import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceArea,
} from 'recharts'
import type { StreamData } from '../utils/strava'
import type { HRZone } from '../types'
import { parseZoneRange } from '../utils/zones'

// Grade thresholds — mirrored from ElevationChart.gradeColor.
// Duplicated here to break the import cycle with ElevationChart.
function gradeColor(grade: number): string {
  const g = Math.abs(grade)
  if (g < 5) return '#22c55e'
  if (g < 10) return '#eab308'
  if (g < 15) return '#f97316'
  if (g < 20) return '#ef4444'
  return '#7f1d1d'
}

// See ElevationChart.tsx for the meaning of this window. Units:
// meters of horizontal path distance, centered on each sample.
const GRADE_WINDOW_METERS = 40

type Metric = 'hr' | 'pace' | 'elevation'

interface ChartExpandOverlayProps {
  children: (expanded: boolean) => React.ReactNode
  title: string
  // When `stream` is provided, the expanded view shows HR/Pace/Elevation
  // toggle pills and a combined ComposedChart. The collapsed view always
  // renders `children(false)`.
  stream?: StreamData
  zones?: HRZone[]
  targetZone?: string
  initialMetric?: Metric
}

export default function ChartExpandOverlay({
  children, title, stream, zones, targetZone, initialMetric = 'hr',
}: ChartExpandOverlayProps) {
  const [expanded, setExpanded] = useState(false)
  const [metrics, setMetrics] = useState<Set<Metric>>(() => new Set([initialMetric]))

  const openExpanded = () => {
    // Default pills = every metric present in the stream, so the user
    // sees the full picture on open and filters down from there.
    if (stream) {
      const available = getAvailableMetrics(stream)
      if (available.size > 0) setMetrics(available)
      else setMetrics(new Set([initialMetric]))
    } else {
      setMetrics(new Set([initialMetric]))
    }
    setExpanded(true)
  }

  useEffect(() => {
    if (!expanded) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [expanded])

  const multiMode = !!stream
  const availableMetrics = multiMode ? getAvailableMetrics(stream!) : new Set<Metric>()

  const toggle = (m: Metric) => {
    setMetrics(prev => {
      const next = new Set(prev)
      if (next.has(m)) next.delete(m)
      else next.add(m)
      if (next.size === 0) next.add(m) // always keep at least one active
      return next
    })
  }

  return (
    <>
      <div
        onClick={openExpanded}
        className="cursor-pointer active:opacity-80 transition-opacity"
        role="button"
        tabIndex={0}
        aria-label={`Expand ${title} chart`}
      >
        {children(false)}
      </div>

      {expanded && createPortal(
        <div
          className="fixed inset-0 flex flex-col bg-white dark:bg-slate-900"
          style={{ zIndex: 9999 }}
          onClick={() => setExpanded(false)}
        >
          <div className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0 border-b border-slate-200 dark:border-slate-700">
            <p className="text-slate-800 dark:text-white font-semibold text-base">{title}</p>
            <button
              onClick={() => setExpanded(false)}
              className="text-teal-600 dark:text-teal-400 hover:text-teal-700 text-base font-semibold px-2 py-1"
            >
              Close
            </button>
          </div>

          {multiMode && availableMetrics.size > 1 && (
            <div
              className="flex gap-2 px-4 py-2 shrink-0 border-b border-slate-100 dark:border-slate-800"
              onClick={e => e.stopPropagation()}
            >
              {(['hr', 'pace', 'elevation'] as const).map(m => {
                if (!availableMetrics.has(m)) return null
                const active = metrics.has(m)
                const color = m === 'hr' ? '#ef4444' : m === 'pace' ? '#0d9488' : '#22c55e'
                const label = m === 'hr' ? 'Heart Rate' : m === 'pace' ? 'Pace' : 'Elevation'
                return (
                  <button
                    key={m}
                    onClick={() => toggle(m)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      active
                        ? 'text-white border-transparent'
                        : 'text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600 bg-transparent'
                    }`}
                    style={active ? { backgroundColor: color } : undefined}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          )}

          <div
            className="flex-1 px-2 pb-4"
            style={{ height: 'calc(100vh - 56px)' }}
            onClick={e => e.stopPropagation()}
          >
            {multiMode && stream
              ? <CombinedChart stream={stream} metrics={metrics} zones={zones} targetZone={targetZone} />
              : children(true)}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function getAvailableMetrics(stream: StreamData): Set<Metric> {
  const out = new Set<Metric>()
  if (stream.heartrate?.some(v => v > 0)) out.add('hr')
  if (stream.velocity?.some(v => v > 0.3)) out.add('pace')
  if (stream.altitude?.some(v => v > 0)) out.add('elevation')
  return out
}

function CombinedChart({
  stream, metrics, targetZone,
}: {
  stream: StreamData
  metrics: Set<Metric>
  zones?: HRZone[]
  targetZone?: string
}) {
  const step = Math.max(1, Math.floor(stream.time.length / 300))
  const data = stream.time
    .filter((_, i) => i % step === 0)
    .map((_, idx) => {
      const i = idx * step
      const vMps = stream.velocity?.[i] || 0
      const paceMinMi = vMps > 0.3 ? 26.8224 / vMps : null
      const pace = paceMinMi != null && paceMinMi < 25 && paceMinMi > 3 ? paceMinMi : null
      const alt = stream.altitude?.[i] != null ? Math.round(stream.altitude[i] * 3.28084) : undefined
      const hr = stream.heartrate?.[i] > 0 ? stream.heartrate[i] : undefined
      let lo = i, hi = i
      if (stream.distance?.length) {
        while (lo > 0 && stream.distance[i] - stream.distance[lo - 1] < GRADE_WINDOW_METERS / 2) lo--
        while (hi < stream.distance.length - 1 && stream.distance[hi + 1] - stream.distance[i] < GRADE_WINDOW_METERS / 2) hi++
      }
      const dDist = stream.distance ? stream.distance[hi] - stream.distance[lo] : 0
      const dElev = stream.altitude ? stream.altitude[hi] - stream.altitude[lo] : 0
      const grade = dDist > 0 ? Math.round(((dElev / dDist) * 100) * 10) / 10 : 0
      const dist = stream.distance?.[i] != null
        ? Math.round((stream.distance[i] / 1609.344) * 100) / 100
        : 0
      return { dist, hr, pace, alt, grade }
    })

  const target = targetZone ? parseZoneRange(targetZone) : null

  const hrValues = data.map(d => d.hr).filter((v): v is number => !!v)
  const hrDomain: [number, number] = hrValues.length > 0
    ? [Math.max(60, Math.min(...hrValues) - 10), Math.max(...hrValues) + 10]
    : [60, 200]

  const paceValues = data.map(d => d.pace).filter((v): v is number => v != null)
  const paceDomain: [number, number] = paceValues.length > 0
    ? [Math.max(3, Math.min(...paceValues) - 0.5), Math.min(25, Math.max(...paceValues) + 0.5)]
    : [5, 15]

  const altValues = data.map(d => d.alt).filter((v): v is number => v != null)
  // Compress elevation into the bottom ~40% of the plot so it reads as
  // background context under HR/pace rather than competing for the full
  // chart height. Axis is hidden — numeric elevation lives in the tooltip.
  const altDomain: [number, number] = (() => {
    if (altValues.length === 0) return [0, 1000]
    const min = Math.min(...altValues)
    const max = Math.max(...altValues)
    const span = Math.max(max - min, 50)
    return [Math.max(0, min - 25), max + span * 1.5]
  })()

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const tickStyle = { fontSize: 12, fill: isDark ? '#cbd5e1' : '#64748b' }

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 110px)' }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="combinedHRFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="combinedElevFill" x1="0" y1="0" x2="1" y2="0">
              {data.map((d, i) => (
                <stop
                  key={i}
                  offset={`${(i / Math.max(1, data.length - 1)) * 100}%`}
                  stopColor={gradeColor(d.grade)}
                  stopOpacity={0.35}
                />
              ))}
            </linearGradient>
          </defs>
          <XAxis
            dataKey="dist"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={tickStyle}
            tickFormatter={v => `${v} mi`}
            axisLine={false}
            tickLine={false}
          />
          {metrics.has('hr') && (
            <YAxis
              yAxisId="hr"
              domain={hrDomain}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              width={38}
              label={{ value: 'bpm', angle: -90, position: 'insideLeft', fill: '#ef4444', fontSize: 11 }}
            />
          )}
          {metrics.has('pace') && (
            <YAxis
              yAxisId="pace"
              orientation="right"
              reversed
              domain={paceDomain}
              tick={tickStyle}
              tickFormatter={v => formatPace(v)}
              axisLine={false}
              tickLine={false}
              width={46}
            />
          )}
          {metrics.has('elevation') && (
            <YAxis
              yAxisId="alt"
              orientation="right"
              domain={altDomain}
              hide
            />
          )}
          <Tooltip
            contentStyle={{
              fontSize: 14,
              borderRadius: 8,
              border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
              padding: '6px 10px',
              backgroundColor: isDark ? '#1e293b' : '#ffffff',
              color: isDark ? '#f1f5f9' : '#1e293b',
            }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: unknown, name: unknown, props: any) => {
              if (name === 'hr') return [`${value} bpm`, 'Heart Rate']
              if (name === 'pace' && typeof value === 'number') return [`${formatPace(value)} /mi`, 'Pace']
              if (name === 'alt') {
                const g = props?.payload?.grade
                return [`${value} ft${g != null ? ` · ${g}%` : ''}`, 'Elevation']
              }
              return [`${value}`, `${name}`]
            }}
            labelFormatter={v => `mile ${v}`}
          />
          {metrics.has('hr') && target && (
            <ReferenceArea
              yAxisId="hr"
              y1={Math.max(target.low, hrDomain[0])}
              y2={Math.min(target.high, hrDomain[1])}
              fill="#22c55e"
              fillOpacity={0.1}
              stroke="#22c55e"
              strokeOpacity={0.4}
              strokeDasharray="4 4"
            />
          )}
          {metrics.has('elevation') && (
            <Area
              yAxisId="alt"
              type="monotone"
              dataKey="alt"
              stroke="#64748b"
              strokeWidth={1}
              fill="url(#combinedElevFill)"
              dot={false}
              isAnimationActive={false}
            />
          )}
          {metrics.has('hr') && (
            <Area
              yAxisId="hr"
              type="monotone"
              dataKey="hr"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#combinedHRFill)"
              dot={false}
              isAnimationActive={false}
            />
          )}
          {metrics.has('pace') && (
            <Line
              yAxisId="pace"
              type="monotone"
              dataKey="pace"
              stroke="#0d9488"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function formatPace(minMi: number): string {
  const m = Math.floor(minMi)
  const s = Math.round((minMi - m) * 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
