import { useState } from 'react'
import type { PerformanceMetrics, WeeklyRecommendation, DailyTRIMP } from '../types'
import { getTSBState, getTSBLabel, getACWRRisk, getACWRLabel } from '../utils/performance'
import { localDateStr, formatLoadP } from '../utils/format'
import {
  ComposedChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, CartesianGrid,
} from 'recharts'
import ChartExpandOverlay from './ChartExpandOverlay'
import Term from './TermGlossary'
import { useDisplayPreferences } from '../hooks/useDisplayPreferences'
import { getChartColors } from '../utils/chartColors'

interface PerformanceChartProps {
  performance: PerformanceMetrics[]
  recommendations: WeeklyRecommendation[]
  raceDate: string
  dailyTrimp?: DailyTRIMP[]
  athleteId?: string
}

type MetricKey = 'ctl' | 'atl' | 'tsb' | 'load'
const DEFAULT_METRICS: Record<MetricKey, boolean> = { ctl: true, atl: true, tsb: true, load: true }
type LoadMode = 'daily' | '7d'

const SEVERITY_STYLES = {
  info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: 'i' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: '!' },
  alert: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: '!!' },
}

export default function PerformanceChart({
  performance,
  recommendations,
  raceDate,
  dailyTrimp = [],
  athleteId,
}: PerformanceChartProps) {
  const { flags } = useDisplayPreferences(athleteId)
  const [visible, setVisible] = useState<Record<MetricKey, boolean>>(() =>
    flags.showAdvancedCharts ? DEFAULT_METRICS : { ctl: true, atl: true, tsb: false, load: false },
  )
  const [loadMode, setLoadMode] = useState<LoadMode>('7d')
  const toggle = (k: MetricKey) => setVisible(v => ({ ...v, [k]: !v[k] }))
  if (performance.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
        <p className="text-base font-semibold text-slate-700 dark:text-slate-200">Fitness / Fatigue / Recovery Balance</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Connect Garmin and sync activities to see performance trends</p>
      </div>
    )
  }

  const latest = performance[performance.length - 1]
  const tsbState = getTSBState(latest.tsb)
  const acwrRisk = getACWRRisk(latest.acwr)

  // Index daily TRIMP by date for fast lookup. Caller passes the FULL
  // unfiltered dailyTrimp so the rolling 7-day sum has correct lookback
  // even when `performance` has been sliced to a short time window.
  const loadByDate = new Map(dailyTrimp.map(d => [d.date, d.total]))

  // Prepare chart data — smooth for regular view, full detail for expanded
  const rawData = performance.map((m) => {
    const dailyLoad = loadByDate.get(m.date) ?? 0
    // 7-day trailing sum: walk back by calendar date (not array index) so
    // the lookback crosses the start of the visible window into the
    // unfiltered history. Use local-date formatting — toISOString shifts
    // dates by ±1 outside UTC.
    const baseDate = new Date(m.date + 'T00:00:00')
    let trailingLoad = 0
    for (let j = 0; j < 7; j++) {
      const d = new Date(baseDate)
      d.setDate(d.getDate() - j)
      trailingLoad += loadByDate.get(localDateStr(d)) ?? 0
    }
    return {
      ...m,
      label: m.date.slice(5),
      acwrLow: m.ctl * 0.8,
      acwrHigh: m.ctl * 1.3,
      load: dailyLoad,
      load7d: Math.round(trailingLoad),
    }
  })

  const smoothedData = smoothSeries(rawData, 5)

  // Compute y-axis domain from RAW data so collapsed and expanded views
  // share the same scale — reference bands (Training Zone, Race Day)
  // stay at consistent visual positions.
  const allRawVals = rawData.flatMap(d => [d.ctl, d.atl, d.tsb])
  const rawMax = Math.max(...allRawVals)
  const rawMin = Math.min(...allRawVals)
  const fixedYMax = Math.ceil((Math.max(rawMax, 25) + 10) / 10) * 10
  const fixedYMin = Math.floor((Math.min(rawMin, -10) - 5) / 10) * 10
  const allLoadVals = rawData.map(d => loadMode === '7d' ? d.load7d : d.load)
  const fixedLoadMax = Math.ceil(Math.max(50, ...allLoadVals) * 1.1 / 50) * 50

  const renderChart = (expanded: boolean) => {
    const chartData = expanded ? rawData : smoothedData
    const isDark = document.documentElement.classList.contains('dark')
    const colors = getChartColors(isDark)
    const loadColor = colors.chart2
    const ctlColor = colors.chart3
    const atlColor = colors.chart4
    const showBands = visible.tsb // TSB bands only meaningful when TSB is shown
    return (
      <div>
        {!expanded && (
          <div className="flex items-center justify-end mb-1">
            <span className="text-[10px] text-slate-400">Tap to expand</span>
          </div>
        )}
        <div style={expanded ? { width: '100%', height: 'calc(100vh - 120px)' } : { height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: expanded ? 12 : 11, fill: isDark ? '#cbd5e1' : '#64748b' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="left"
                domain={[fixedYMin, fixedYMax]}
                tick={{ fontSize: expanded ? 12 : 11, fill: isDark ? '#cbd5e1' : '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              {visible.load && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, fixedLoadMax]}
                  tick={{ fontSize: expanded ? 11 : 10, fill: loadColor }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                  label={expanded ? { value: 'Daily Load', angle: 90, position: 'insideRight', fontSize: 11, fill: loadColor } : undefined}
                />
              )}
              <Tooltip
                contentStyle={{
                  fontSize: expanded ? 14 : 13,
                  borderRadius: 8,
                  border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                  padding: '6px 10px',
                  backgroundColor: isDark ? '#1e293b' : '#ffffff',
                  color: isDark ? '#f1f5f9' : '#1e293b',
                }}
                formatter={(value, name) => [
                  typeof value === 'number' ? value.toFixed(name === 'load' || name === 'load7d' ? 0 : 1) : String(value),
                  name === 'ctl' ? 'Fitness' :
                  name === 'atl' ? 'Fatigue' :
                  name === 'load' ? 'Daily Load' :
                  name === 'load7d' ? '7-Day Load' :
                  name === 'tsbSmooth' ? 'Recovery Balance' :
                  'Recovery Balance',
                ]}
              />
              {/* Training load line (right axis) — daily or 7-day trailing */}
              {visible.load && (
                <Area yAxisId="right" type="natural" dataKey={loadMode === '7d' ? 'load7d' : 'load'} stroke={loadColor} fill="none" strokeWidth={expanded ? 2.5 : 2} dot={false} isAnimationActive={false} />
              )}
              {/* Training band: productive overreach zone (TSB -30 to -10) */}
              {showBands && (
                <ReferenceArea
                  yAxisId="left"
                  y1={-30} y2={-10}
                  fill={isDark ? '#1e3a5f' : '#dbeafe'}
                  fillOpacity={isDark ? 0.5 : 0.4}
                  stroke="#3B82F6"
                  strokeOpacity={0.6}
                  strokeWidth={1}
                  label={{ value: 'Training Zone', fontSize: expanded ? 12 : 10, fill: isDark ? '#93c5fd' : '#1d4ed8', position: 'insideBottomLeft' }}
                />
              )}
              {/* Race day band: peak performance zone (TSB +5 to +25) */}
              {showBands && (
                <ReferenceArea
                  yAxisId="left"
                  y1={5} y2={25}
                  fill={isDark ? '#064e3b' : '#d1fae5'}
                  fillOpacity={isDark ? 0.5 : 0.4}
                  stroke="#059669"
                  strokeOpacity={0.6}
                  strokeWidth={1}
                  label={{ value: 'Race Day', fontSize: expanded ? 12 : 10, fill: isDark ? '#6ee7b7' : '#047857' }}
                />
              )}
              {/* TSB band boundary lines */}
              {showBands && <ReferenceLine yAxisId="left" y={-30} stroke="#3B82F6" strokeOpacity={0.4} strokeDasharray="4 4" strokeWidth={1} />}
              {showBands && <ReferenceLine yAxisId="left" y={-10} stroke="#3B82F6" strokeOpacity={0.4} strokeDasharray="4 4" strokeWidth={1} />}
              <ReferenceLine yAxisId="left" y={0} stroke={isDark ? '#475569' : '#94a3b8'} strokeDasharray="2 2" />
              {showBands && <ReferenceLine yAxisId="left" y={5} stroke="#059669" strokeOpacity={0.4} strokeDasharray="4 4" strokeWidth={1} />}
              {showBands && <ReferenceLine yAxisId="left" y={25} stroke="#059669" strokeOpacity={0.4} strokeDasharray="4 4" strokeWidth={1} />}
              {/* ACWR corridor: 0.8×CTL to 1.3×CTL — only when CTL is visible */}
              {visible.ctl && <Area yAxisId="left" type="natural" dataKey="acwrHigh" stroke="#7c3aed" strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.5} fill="none" dot={false} isAnimationActive={false} />}
              {visible.ctl && <Area yAxisId="left" type="natural" dataKey="acwrLow" stroke="#7c3aed" strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.5} fill="none" dot={false} isAnimationActive={false} />}
              {visible.ctl && <Area yAxisId="left" type="natural" dataKey="ctl" stroke={ctlColor} fill="none" strokeWidth={expanded ? 2.5 : 2} dot={false} isAnimationActive={false} />}
              {visible.atl && <Area yAxisId="left" type="natural" dataKey="atl" stroke={atlColor} fill="none" strokeWidth={expanded ? 2.5 : 2} dot={false} isAnimationActive={false} />}
              {visible.tsb && <Area yAxisId="left" type="natural" dataKey={expanded ? 'tsb' : 'tsbSmooth'} stroke="#059669" fill="#059669" fillOpacity={0.15} strokeWidth={expanded ? 2.5 : 2} dot={false} isAnimationActive={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {/* Metric toggle pills (also acts as legend). Hidden in the simplest
            view to reduce clutter — the chart still shows fitness + fatigue. */}
        {flags.showAdvancedCharts && (
          <div className="flex flex-wrap justify-center gap-1.5 mt-2">
            <MetricPill active={visible.ctl} onClick={() => toggle('ctl')} color="blue" label="Fitness" />
            <MetricPill active={visible.atl} onClick={() => toggle('atl')} color="red" label="Fatigue" />
            <MetricPill active={visible.tsb} onClick={() => toggle('tsb')} color="green" label="Recovery" />
            <MetricPill active={visible.load} onClick={() => toggle('load')} color="amber" label={loadMode === '7d' ? '7d Load' : 'Daily Load'} />
            {visible.load && (
              <button
                onClick={() => setLoadMode(m => m === 'daily' ? '7d' : 'daily')}
                className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 text-amber-600 bg-amber-50"
              >
                {loadMode === '7d' ? '→ daily' : '→ 7-day'}
              </button>
            )}
          </div>
        )}
        {expanded && (
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 bg-blue-500/10 border border-blue-500/30 inline-block rounded" /> Training Zone (TSB -30 to -10)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 bg-green-600/20 border border-green-600/30 inline-block rounded" /> Race Day Peak (TSB +5 to +25)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 bg-violet-400/20 border border-violet-400/30 inline-block rounded" /> Fatigue Corridor (0.8–1.3× Fitness)
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* CTL / ATL / TSB Chart */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <p className="text-base font-semibold text-slate-700 dark:text-slate-200">Fitness / Fatigue / Recovery Balance</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Banister impulse-response model · Race: {raceDate}</p>
          </div>
        </div>

        <ChartExpandOverlay title="Fitness / Fatigue / Recovery">
          {renderChart}
        </ChartExpandOverlay>
      </div>

      {/* Current stats cards with contextual notes */}
      <div className="grid grid-cols-2 gap-2">
        <PerfStatCard
          label={<Term name="ctl" />}
          value={formatLoadP(latest.ctl, flags.numericPrecision)}
          sub=""
          color="blue"
          note={
            latest.ctl < 20 ? 'Building base — keep training consistently'
            : latest.ctl < 40 ? 'Moderate fitness — on track for build phase'
            : latest.ctl < 60 ? 'Strong fitness — maintain through quality sessions'
            : 'High fitness — protect with smart recovery'
          }
        />
        <PerfStatCard
          label={<Term name="atl" />}
          value={formatLoadP(latest.atl, flags.numericPrecision)}
          sub=""
          color="red"
          note={
            latest.atl > latest.ctl * 1.5 ? 'Very high — consider an easy day soon'
            : latest.atl > latest.ctl ? 'Fatigue exceeds fitness — normal in build weeks'
            : latest.atl > latest.ctl * 0.8 ? 'Balanced — productive training zone'
            : 'Low fatigue — room to push harder'
          }
        />
        <PerfStatCard
          label={<Term name="tsb">Recovery Balance</Term>}
          value={`${latest.tsb >= 0 ? '+' : ''}${formatLoadP(latest.tsb, flags.numericPrecision)}`}
          sub={getTSBLabel(tsbState)}
          color={tsbState === 'peaked' || tsbState === 'well_rested' ? 'green' : tsbState === 'productive' ? 'slate' : 'red'}
          note={
            latest.tsb >= 15 ? 'Peak form — ideal for racing or time trials'
            : latest.tsb >= 5 ? 'Fresh — good day for a quality workout'
            : latest.tsb >= -10 ? 'Productive — building fitness, some fatigue'
            : latest.tsb >= -30 ? 'Tired — back off if this persists 3+ days'
            : 'Fatigue exceeds fitness base — common early in a plan. Check Readiness tab for biometric confirmation.'
          }
        />
        <PerfStatCard
          label={<Term name="acwr">Load Ratio</Term>}
          value={latest.acwr.toFixed(flags.numericPrecision === 'low' ? 1 : 2)}
          sub={getACWRLabel(acwrRisk)}
          color={acwrRisk === 'sweet_spot' ? 'green' : acwrRisk === 'caution' ? 'amber' : 'red'}
          note={
            acwrRisk === 'sweet_spot' ? 'Safe zone — training load matches your fitness'
            : acwrRisk === 'caution' ? 'Ramping up fast — watch for soreness or tightness'
            : acwrRisk === 'high_risk' ? 'Injury risk elevated — reduce volume this week'
            : 'Undertraining — add volume gradually to avoid detraining'
          }
        />
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="space-y-2">
          <p className="text-base font-semibold text-slate-700 dark:text-slate-200">Recommendations</p>
          {recommendations.map((rec, i) => {
            const s = SEVERITY_STYLES[rec.severity]
            return (
              <div key={i} className={`rounded-xl p-3 border ${s.bg} ${s.border}`}>
                <p className={`text-sm font-medium ${s.text}`}>
                  {rec.severity === 'alert' ? '🚨' : rec.severity === 'warning' ? '⚠️' : 'i'}{' '}
                  {rec.message}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MetricPill({ active, onClick, color, label }: {
  active: boolean; onClick: () => void; color: 'blue' | 'red' | 'green' | 'amber'; label: string
}) {
  const colorMap = {
    blue: { on: 'bg-blue-500 text-white border-blue-500', off: 'border-blue-300 text-blue-600' },
    red: { on: 'bg-red-500 text-white border-red-500', off: 'border-red-300 text-red-600' },
    green: { on: 'bg-green-600 text-white border-green-600', off: 'border-green-300 text-green-700' },
    amber: { on: 'bg-amber-500 text-white border-amber-500', off: 'border-amber-300 text-amber-600' },
  }
  const c = colorMap[color]
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition ${
        active ? c.on : `${c.off} bg-transparent opacity-60`
      }`}
    >
      {active ? '✓ ' : ''}{label}
    </button>
  )
}

function PerfStatCard({ label, value, sub, color, note }: {
  label: React.ReactNode; value: string; sub: React.ReactNode; color: string; note?: string
}) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-700',
    red: 'text-red-600',
    green: 'text-green-700',
    amber: 'text-amber-600',
    slate: 'text-slate-700 dark:text-slate-200',
  }
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-100 dark:border-slate-700">
      <div className="flex items-baseline gap-2">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
          <p className={`text-2xl font-bold ${colorMap[color] || 'text-slate-800 dark:text-white'}`}>{value}</p>
          <p className="text-xs text-slate-400 leading-tight">{sub}</p>
        </div>
      </div>
      {note && (
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-snug border-t border-slate-100 dark:border-slate-700 pt-1.5">{note}</p>
      )}
    </div>
  )
}

interface ChartPoint {
  ctl: number
  atl: number
  tsb: number
  tsbSmooth?: number
  acwrLow: number
  acwrHigh: number
  label: string
  date: string
  acwr: number
  load: number
  load7d: number
}

function smoothSeries(data: ChartPoint[], window: number): ChartPoint[] {
  if (data.length <= window) return data
  return data.map((point, i) => {
    const halfW = Math.floor(window / 2)
    const start = Math.max(0, i - halfW)
    const end = Math.min(data.length - 1, i + halfW)
    const slice = data.slice(start, end + 1)
    const n = slice.length
    const smoothCtl = slice.reduce((s, p) => s + p.ctl, 0) / n
    return {
      ...point,
      ctl: smoothCtl,
      atl: slice.reduce((s, p) => s + p.atl, 0) / n,
      tsbSmooth: slice.reduce((s, p) => s + p.tsb, 0) / n,
      load: slice.reduce((s, p) => s + p.load, 0) / n,
      load7d: slice.reduce((s, p) => s + p.load7d, 0) / n,
      acwrLow: smoothCtl * 0.8,
      acwrHigh: smoothCtl * 1.3,
    }
  })
}
