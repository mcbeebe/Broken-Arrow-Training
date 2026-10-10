import type { ReactNode } from 'react'
import { niceTicks } from '../utils/metricTrend'
import { isDarkMode } from '../utils/styles'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, CartesianGrid } from 'recharts'

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
  data: { date: string; value: number }[]
  /** Line colour (a hex: it's an SVG stroke). */
  color: string
  /** Decimals for the axis and tooltip. */
  dp: number
  /** A dashed reference line (Recovery Balance's zero). */
  baseline?: number
  /** A shaded band (Load Ratio's in-range zone) and its colour. */
  band?: [number, number]
  bandColor?: string
  /** Name for the tooltip row and screen readers. */
  name: string
}

/**
 * One load metric, full width: the tile's number, zone, change and note
 * over a real chart with dates and a y-axis, following the Performance
 * tab's 7d / 30d / 90d / All window. The Performance tab draws these where
 * Today draws the compact tiles, so a tap on a tile lands on its card.
 */
export default function MetricTrendCard({
  id, label, swatch, value, valueClass, sub, change, note, data, color, dp, baseline, band, bandColor = '#16a34a', name,
}: Props) {
  const values = data.map(d => d.value)
  const include = [...(baseline !== undefined ? [baseline] : []), ...(band ?? [])]
  const lo = values.length ? Math.min(...values, ...include) : 0
  const hi = values.length ? Math.max(...values, ...include) : 1
  const ticks = niceTicks(lo, hi)
  const domain: [number, number] = [ticks[0] ?? lo, ticks[ticks.length - 1] ?? hi]
  // As many decimals as the ticks themselves need: 60 / 65 / 70, not
  // 60.0 at high precision; 0.75 / 1.00 / 1.25 for Load Ratio.
  const tickDp = Math.max(0, ...ticks.map(t => (String(t).split('.')[1] ?? '').length))
  const isDark = isDarkMode()
  const first = data[0]
  const last = data[data.length - 1]

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
        <div className="mt-2" style={{ height: 160 }} role="img" aria-label={`${name} from ${first.date} (${first.value.toFixed(dp)}) to ${last.date} (${last.value.toFixed(dp)})`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={isDark ? '#334155' : '#e2e8f0'} strokeDasharray="3 3" vertical={false} />
              {band && (
                <ReferenceArea y1={band[0]} y2={band[1]} fill={bandColor} fillOpacity={0.12} stroke="none" ifOverflow="extendDomain" />
              )}
              {baseline !== undefined && (
                <ReferenceLine y={baseline} stroke="#94a3b8" strokeDasharray="4 4" />
              )}
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.slice(5)}
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                domain={domain}
                ticks={ticks}
                interval={0}
                tickFormatter={(v: number) => v.toFixed(tickDp)}
                tick={{ fontSize: 11, fill: '#94A3B8' }}
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
                formatter={(v) => [Number(v).toFixed(dp), name]}
              />
              <Line
                className="metric-trend-line"
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
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
