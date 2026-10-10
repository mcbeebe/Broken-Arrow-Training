import type { ReactNode } from 'react'
import { niceTicks, SMOOTH_DAYS } from '../utils/metricTrend'
import { isDarkMode } from '../utils/styles'
import { ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts'
import ChartExpandOverlay from './ChartExpandOverlay'

/** One day on the card's chart: the line's value and, where known, the
 *  healthy range for that day. */
export interface TrendPoint {
  date: string
  value: number
  band?: [number, number] | null
}

interface Props {
  /** DOM id, so a tap on Today's tile can scroll here. */
  id: string
  /** The metric's name (may carry its glossary term) and its swatch. */
  label: ReactNode
  swatch?: string
  value: string
  valueClass: string
  /** Zone label under the value (Recovery Balance, Load Ratio). */
  sub?: ReactNode
  /** The change vs 7 days ago, already formatted and coloured. */
  change?: ReactNode
  note?: string
  /** The series over the chosen window, oldest first. */
  data: TrendPoint[]
  /** Line colour (a hex: it's an SVG stroke). */
  color: string
  /** Decimals for the tooltip. */
  dp: number
  /** A dashed reference line (Recovery Balance's zero). */
  baseline?: number
  /** What the green band means, under the chart. */
  bandCaption?: string
  /** The line is a SMOOTH_DAYS rolling average, not the daily value. */
  smoothed?: boolean
  /** Name for the tooltip row and screen readers. */
  name: string
}

const BAND_COLOR = '#16a34a'

/**
 * One load metric, full width: the tile's number, zone, change and note
 * over a real chart with dates, a y-axis and a green band for the healthy
 * range on each day. Tap the chart to open it full screen. The Performance
 * tab draws these where Today draws the compact tiles.
 */
export default function MetricTrendCard({
  id, label, swatch, value, valueClass, sub, change, note, data, color, dp, baseline, bandCaption, smoothed = false, name,
}: Props) {
  const values = data.map(d => d.value)
  const bandEdges = data.flatMap(d => d.band ?? [])
  const include = [...(baseline !== undefined ? [baseline] : []), ...bandEdges]
  const lo = values.length ? Math.min(...values, ...include) : 0
  const hi = values.length ? Math.max(...values, ...include) : 1
  const ticks = niceTicks(lo, hi)
  const domain: [number, number] = [ticks[0] ?? lo, ticks[ticks.length - 1] ?? hi]
  // As many decimals as the ticks themselves need: 60 / 65 / 70, not
  // 60.0 at high precision; 0.75 / 1.00 / 1.25 for Load Ratio.
  const tickDp = Math.max(0, ...ticks.map(t => (String(t).split('.')[1] ?? '').length))
  const isDark = isDarkMode()
  const hasBand = bandEdges.length > 0
  const first = data[0]
  const last = data[data.length - 1]
  const lineName = smoothed ? `${name} (${SMOOTH_DAYS}-day avg)` : name

  const chart = (expanded: boolean) => (
    <div
      style={{ height: expanded ? '100%' : 160 }}
      role="img"
      aria-label={`${lineName} from ${first.date} (${first.value.toFixed(dp)}) to ${last.date} (${last.value.toFixed(dp)})`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={isDark ? '#334155' : '#e2e8f0'} strokeDasharray="3 3" vertical={false} />
          {hasBand && (
            <Area
              className="metric-healthy-band"
              dataKey="band"
              type="monotone"
              stroke={BAND_COLOR}
              strokeOpacity={0.35}
              strokeWidth={1}
              fill={BAND_COLOR}
              fillOpacity={isDark ? 0.16 : 0.12}
              isAnimationActive={false}
              activeDot={false}
              tooltipType="none"
            />
          )}
          {baseline !== undefined && (
            <ReferenceLine y={baseline} stroke="#94a3b8" strokeDasharray="4 4" />
          )}
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => d.slice(5)}
            tick={{ fontSize: expanded ? 12 : 11, fill: '#94A3B8' }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            domain={domain}
            ticks={ticks}
            interval={0}
            tickFormatter={(v: number) => v.toFixed(tickDp)}
            tick={{ fontSize: expanded ? 12 : 11, fill: '#94A3B8' }}
            axisLine={false}
            tickLine={false}
            width={38}
          />
          <Tooltip
            contentStyle={{
              fontSize: 13,
              borderRadius: 8,
              border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
              backgroundColor: isDark ? '#1e293b' : '#ffffff',
              color: isDark ? '#f1f5f9' : '#1e293b',
            }}
            labelFormatter={(d) => String(d)}
            formatter={(v, key) => key === 'band' ? null : [Number(v).toFixed(dp), lineName]}
          />
          <Line
            className="metric-trend-line"
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={expanded ? 3 : 2.5}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )

  return (
    <section
      id={id}
      aria-label={name}
      className="scroll-mt-4 bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center">
            {swatch && <span aria-hidden className={`inline-block w-3 h-[3px] rounded-full mr-1.5 shrink-0 ${swatch}`} />}
            {label}
          </p>
          <p className={`text-3xl font-bold leading-tight ${valueClass}`}>{value}</p>
          {sub && <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight">{sub}</p>}
        </div>
        {change && <div className="text-right pt-4">{change}</div>}
      </div>
      {data.length >= 2 ? (
        <div className="mt-2">
          <ChartExpandOverlay title={lineName}>{chart}</ChartExpandOverlay>
          <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            {bandCaption && hasBand && <>{bandCaption} </>}
            <span className="text-slate-400 dark:text-slate-500">Tap the chart to expand.</span>
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Not enough history in this window yet.</p>
      )}
      {note && (
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-snug border-t border-slate-100 dark:border-slate-700 pt-2">{note}</p>
      )}
    </section>
  )
}
