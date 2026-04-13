import type { ReadinessScore, GarminHealthData } from '../types'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

interface ReadinessBannerProps {
  todayScore: ReadinessScore
  todayHealth?: GarminHealthData
  healthHistory: GarminHealthData[]
}

const STATUS_STYLES = {
  GREEN: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-800',
    badge: 'bg-green-600',
    dot: 'bg-green-500',
    accent: '#059669',
  },
  YELLOW: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    badge: 'bg-amber-500',
    dot: 'bg-amber-500',
    accent: '#D97706',
  },
  RED: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    badge: 'bg-red-600',
    dot: 'bg-red-500',
    accent: '#DC2626',
  },
}

const STATUS_EMOJI = { GREEN: '🟢', YELLOW: '🟡', RED: '🔴' }

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const chartData = data.map((v, i) => ({ v, i }))
  return (
    <div style={{ width: 60, height: 28 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function ReadinessBanner({
  todayScore,
  todayHealth,
  healthHistory,
}: ReadinessBannerProps) {
  const style = STATUS_STYLES[todayScore.status]

  // Build sparkline data from health history (last 7 days)
  const recent7 = healthHistory
    .filter(d => d.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7)

  const hrvSparkline = recent7.map(d => d.hrv?.lastNightAvg ?? 0).filter(v => v > 0)
  const rhrSparkline = recent7.map(d => d.rhr ?? 0).filter(v => v > 0)

  const sleepHours = todayHealth?.sleep
    ? (todayHealth.sleep.durationSeconds / 3600).toFixed(1)
    : '—'
  const bodyBattery = todayHealth?.bodyBattery?.current ?? null

  return (
    <div className={`mx-3 mt-3 rounded-xl ${style.bg} border ${style.border} overflow-hidden`}>
      {/* Header: status badge + composite score + message */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-xs font-bold text-white px-2 py-0.5 rounded-full ${style.badge}`}>
            {STATUS_EMOJI[todayScore.status]} {todayScore.status}
          </span>
          <span className={`text-sm font-bold ${style.text}`}>
            {todayScore.composite}/100
          </span>
        </div>
        <p className={`text-sm ${style.text} leading-relaxed`}>
          {todayScore.message || 'Calculating readiness...'}
        </p>
        {todayScore.adjustment && todayScore.status !== 'GREEN' && (
          <div className={`mt-2 px-3 py-1.5 rounded-lg ${style.bg} border ${style.border} inline-block`}>
            <p className={`text-xs font-medium ${style.text}`}>
              💡 {todayScore.adjustment}
            </p>
          </div>
        )}
      </div>

      {/* Metric cards row */}
      <div className="grid grid-cols-4 gap-px bg-white/50 px-2 pb-2">
        {/* HRV */}
        <MetricCard
          label="HRV"
          value={todayHealth?.hrv?.lastNightAvg ? `${Math.round(todayHealth.hrv.lastNightAvg)}` : '—'}
          unit="ms"
          score={todayScore.components.hrv}
          sparkline={<Sparkline data={hrvSparkline} color={style.accent} />}
        />
        {/* RHR */}
        <MetricCard
          label="RHR"
          value={todayHealth?.rhr ? `${todayHealth.rhr}` : '—'}
          unit="bpm"
          score={todayScore.components.rhr}
          sparkline={<Sparkline data={rhrSparkline} color={style.accent} />}
        />
        {/* Sleep */}
        <MetricCard
          label="Sleep"
          value={sleepHours}
          unit="hrs"
          score={todayScore.components.sleep}
        />
        {/* Body Battery or Load */}
        <MetricCard
          label={bodyBattery !== null ? 'Battery' : 'Load'}
          value={bodyBattery !== null ? `${bodyBattery}` : `${todayScore.components.trainingLoad}`}
          unit={bodyBattery !== null ? '/100' : '/100'}
          score={todayScore.components.trainingLoad}
        />
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  unit,
  score,
  sparkline,
}: {
  label: string
  value: string
  unit: string
  score: number
  sparkline?: React.ReactNode
}) {
  const scoreColor =
    score >= 70 ? 'text-green-600' :
    score >= 40 ? 'text-amber-600' :
    'text-red-600'

  return (
    <div className="bg-white rounded-lg p-2 text-center">
      <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-base font-bold text-slate-800 leading-tight mt-0.5">
        {value}<span className="text-[9px] text-slate-400 font-normal ml-0.5">{unit}</span>
      </p>
      {sparkline && <div className="flex justify-center mt-1">{sparkline}</div>}
      <p className={`text-[9px] font-semibold mt-0.5 ${scoreColor}`}>{score}/100</p>
    </div>
  )
}
