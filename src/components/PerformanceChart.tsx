import type { PerformanceMetrics, WeeklyRecommendation } from '../types'
import { getTSBState, getTSBLabel, getACWRRisk, getACWRLabel } from '../utils/performance'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, CartesianGrid,
} from 'recharts'

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
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <p className="text-sm font-semibold text-slate-700">Fitness / Fatigue / Form</p>
        <p className="text-xs text-slate-400 mt-1">Connect Garmin and sync activities to see performance trends</p>
      </div>
    )
  }

  const latest = performance[performance.length - 1]
  const tsbState = getTSBState(latest.tsb)
  const acwrRisk = getACWRRisk(latest.acwr)

  // Prepare chart data with short date labels
  const chartData = performance.map(m => ({
    ...m,
    label: m.date.slice(5), // MM-DD
  }))

  return (
    <div className="space-y-3">
      {/* CTL / ATL / TSB Chart */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-slate-700">Fitness / Fatigue / Form</p>
            <p className="text-xs text-slate-400">Banister model · Race: {raceDate}</p>
          </div>
        </div>

        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 9, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                formatter={(value, name) => [
                  typeof value === 'number' ? value.toFixed(1) : String(value),
                  name === 'ctl' ? 'Fitness (CTL)' :
                  name === 'atl' ? 'Fatigue (ATL)' :
                  'Form (TSB)',
                ]}
              />
              {/* Target TSB zone for race day */}
              <ReferenceArea
                y1={15} y2={25}
                fill="#059669"
                fillOpacity={0.05}
                label={{ value: 'Race Target', fontSize: 8, fill: '#059669' }}
              />
              {/* Zero line for TSB */}
              <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="2 2" />
              {/* CTL (fitness) - blue filled */}
              <Area
                type="monotone"
                dataKey="ctl"
                stroke="#3B82F6"
                fill="#3B82F6"
                fillOpacity={0.1}
                strokeWidth={2}
                dot={false}
              />
              {/* ATL (fatigue) - red line */}
              <Area
                type="monotone"
                dataKey="atl"
                stroke="#EF4444"
                fill="transparent"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
              />
              {/* TSB (form) - green/red area */}
              <Area
                type="monotone"
                dataKey="tsb"
                stroke="#059669"
                fill="#059669"
                fillOpacity={0.15}
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-4 mt-2 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-blue-500 inline-block rounded" /> Fitness (CTL)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-red-400 inline-block rounded" style={{ borderBottom: '1px dashed' }} /> Fatigue (ATL)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-green-600 inline-block rounded" /> Form (TSB)
          </span>
        </div>
      </div>

      {/* Current stats cards */}
      <div className="grid grid-cols-4 gap-2">
        <PerfStatCard label="Fitness" value={latest.ctl.toFixed(0)} sub="CTL" color="blue" />
        <PerfStatCard label="Fatigue" value={latest.atl.toFixed(0)} sub="ATL" color="red" />
        <PerfStatCard
          label="Form"
          value={`${latest.tsb >= 0 ? '+' : ''}${latest.tsb.toFixed(0)}`}
          sub={getTSBLabel(tsbState)}
          color={tsbState === 'peaked' || tsbState === 'well_rested' ? 'green' : tsbState === 'productive' ? 'slate' : 'red'}
        />
        <PerfStatCard
          label="ACWR"
          value={latest.acwr.toFixed(2)}
          sub={getACWRLabel(acwrRisk)}
          color={acwrRisk === 'sweet_spot' ? 'green' : acwrRisk === 'caution' ? 'amber' : 'red'}
        />
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">Recommendations</p>
          {recommendations.map((rec, i) => {
            const s = SEVERITY_STYLES[rec.severity]
            return (
              <div key={i} className={`rounded-xl p-3 border ${s.bg} ${s.border}`}>
                <p className={`text-xs font-medium ${s.text}`}>
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

function PerfStatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-700',
    red: 'text-red-600',
    green: 'text-green-700',
    amber: 'text-amber-600',
    slate: 'text-slate-700',
  }
  return (
    <div className="bg-white rounded-xl p-2 shadow-sm border border-slate-100 text-center">
      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold ${colorMap[color] || 'text-slate-800'}`}>{value}</p>
      <p className="text-[9px] text-slate-400 leading-tight">{sub}</p>
    </div>
  )
}
