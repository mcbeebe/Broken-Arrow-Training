import type { PerformanceMetrics, WeeklyRecommendation } from '../types'
import { getTSBState, getTSBLabel, getACWRRisk, getACWRLabel } from '../utils/performance'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, CartesianGrid,
} from 'recharts'
import ChartExpandOverlay from './ChartExpandOverlay'

interface PerformanceChartProps {
  performance: PerformanceMetrics[]
  recommendations: WeeklyRecommendation[]
  raceDate: string
}

const SEVERITY_STYLES = {
  info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: 'i' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: '!' },
  alert: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: '!!' },
}

export default function PerformanceChart({
  performance,
  recommendations,
  raceDate,
}: PerformanceChartProps) {
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

  // Prepare chart data — smooth for regular view, full detail for expanded
  const rawData = performance.map(m => ({
    ...m,
    label: m.date.slice(5),
  }))

  const smoothedData = smoothSeries(rawData, 5)

  const renderChart = (expanded: boolean) => {
    const chartData = expanded ? rawData : smoothedData
    return (
      <div>
        {!expanded && (
          <div className="flex items-center justify-end mb-1">
            <span className="text-[10px] text-slate-400">Tap to expand</span>
          </div>
        )}
        <div style={expanded ? { width: '100%', height: 'calc(100vh - 120px)' } : { height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={expanded ? '#334155' : '#f1f5f9'} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: expanded ? 12 : 11, fill: expanded ? '#cbd5e1' : '#94A3B8' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: expanded ? 12 : 11, fill: expanded ? '#cbd5e1' : '#94A3B8' }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  fontSize: expanded ? 14 : 13,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  backgroundColor: expanded ? '#1e293b' : '#ffffff',
                  color: expanded ? '#f1f5f9' : '#1e293b',
                }}
                formatter={(value, name) => [
                  typeof value === 'number' ? value.toFixed(1) : String(value),
                  name === 'ctl' ? 'Fitness (CTL)' :
                  name === 'atl' ? 'Fatigue (ATL)' :
                  name === 'tsbSmooth' ? 'Recovery Balance (TSB)' :
                  'Recovery Balance (TSB)',
                ]}
              />
              {/* Training band: productive overreach zone (TSB -10 to +5) */}
              <ReferenceArea
                y1={-10} y2={5}
                fill="#3B82F6"
                fillOpacity={0.04}
                label={expanded ? { value: 'Training Zone', fontSize: 10, fill: '#3B82F6', position: 'insideBottomLeft' } : undefined}
              />
              {/* Race day band: peak performance zone (TSB +15 to +25) */}
              <ReferenceArea
                y1={15} y2={25}
                fill="#059669"
                fillOpacity={0.08}
                label={{ value: 'Race Day Target', fontSize: expanded ? 12 : 10, fill: '#059669' }}
              />
              <ReferenceLine y={0} stroke={expanded ? '#475569' : '#cbd5e1'} strokeDasharray="2 2" />
              <Area type="natural" dataKey="ctl" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.1} strokeWidth={expanded ? 2.5 : 2} dot={false} isAnimationActive={false} />
              <Area type="natural" dataKey="atl" stroke="#EF4444" fill="transparent" strokeWidth={expanded ? 2 : 1.5} strokeDasharray="4 2" dot={false} isAnimationActive={false} />
              <Area type="natural" dataKey={expanded ? 'tsb' : 'tsbSmooth'} stroke="#059669" fill="#059669" fillOpacity={0.15} strokeWidth={expanded ? 2.5 : 2} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {/* Legend */}
        <div className={`flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2 text-sm ${expanded ? 'text-slate-300' : 'text-slate-600 dark:text-slate-300'}`}>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-blue-500 inline-block rounded" /> Fitness (CTL)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-red-400 inline-block rounded" style={{ borderBottom: '1px dashed' }} /> Fatigue (ATL)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-green-600 inline-block rounded" /> Recovery (TSB)
          </span>
        </div>
        {expanded && (
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 bg-blue-500/10 border border-blue-500/30 inline-block rounded" /> Training Zone (TSB -10 to +5)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 bg-green-600/20 border border-green-600/30 inline-block rounded" /> Race Day Peak (TSB +15 to +25)
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
          label="Fitness"
          value={latest.ctl.toFixed(0)}
          sub="CTL"
          color="blue"
          note={
            latest.ctl < 20 ? 'Building base — keep training consistently'
            : latest.ctl < 40 ? 'Moderate fitness — on track for build phase'
            : latest.ctl < 60 ? 'Strong fitness — maintain through quality sessions'
            : 'High fitness — protect with smart recovery'
          }
        />
        <PerfStatCard
          label="Fatigue"
          value={latest.atl.toFixed(0)}
          sub="ATL"
          color="red"
          note={
            latest.atl > latest.ctl * 1.5 ? 'Very high — consider an easy day soon'
            : latest.atl > latest.ctl ? 'Fatigue exceeds fitness — normal in build weeks'
            : latest.atl > latest.ctl * 0.8 ? 'Balanced — productive training zone'
            : 'Low fatigue — room to push harder'
          }
        />
        <PerfStatCard
          label="Recovery Balance"
          value={`${latest.tsb >= 0 ? '+' : ''}${latest.tsb.toFixed(0)}`}
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
          label="ACWR"
          value={latest.acwr.toFixed(2)}
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

function PerfStatCard({ label, value, sub, color, note }: {
  label: string; value: string; sub: string; color: string; note?: string
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
  label: string
  date: string
  acwr: number
}

function smoothSeries(data: ChartPoint[], window: number): ChartPoint[] {
  if (data.length <= window) return data
  return data.map((point, i) => {
    const halfW = Math.floor(window / 2)
    const start = Math.max(0, i - halfW)
    const end = Math.min(data.length - 1, i + halfW)
    const slice = data.slice(start, end + 1)
    const n = slice.length
    return {
      ...point,
      ctl: slice.reduce((s, p) => s + p.ctl, 0) / n,
      atl: slice.reduce((s, p) => s + p.atl, 0) / n,
      tsbSmooth: slice.reduce((s, p) => s + p.tsb, 0) / n,
    }
  })
}
