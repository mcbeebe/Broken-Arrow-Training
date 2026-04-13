import type { ReadinessScore, ReadinessStatus, GarminHealthData } from '../types'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

interface ReadinessBannerProps {
  todayScore: ReadinessScore
  todayHealth?: GarminHealthData
  healthHistory: GarminHealthData[]
}

const STATUS_STYLES: Record<ReadinessStatus, { bg: string; border: string; text: string; badge: string; dot: string; accent: string }> = {
  PEAK: {
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    text: 'text-indigo-800',
    badge: 'bg-indigo-600',
    dot: 'bg-indigo-500',
    accent: '#6366F1',
  },
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

const STATUS_EMOJI: Record<ReadinessStatus, string> = { PEAK: '⭐', GREEN: '🟢', YELLOW: '🟡', RED: '🔴' }

const STATE_LABELS: Record<string, string> = {
  A: 'State A — Well Recovered',
  B: 'State B — Not Fully Recovered',
  C: 'State C — Overreaching',
  D: 'State D — Overtrained',
}

const SCORE_LABELS: Record<string, { label: string; color: string }> = {
  '2': { label: 'Excellent', color: 'text-green-600' },
  '1': { label: 'Good', color: 'text-green-600' },
  '0': { label: 'Normal', color: 'text-slate-500' },
  '-0.5': { label: 'Below', color: 'text-amber-600' },
  '-1': { label: 'Low', color: 'text-red-600' },
}

function getScoreLabel(score: number): { label: string; color: string } {
  if (score >= 1.5) return SCORE_LABELS['2']
  if (score >= 0.5) return SCORE_LABELS['1']
  if (score >= -0.25) return SCORE_LABELS['0']
  if (score >= -0.75) return SCORE_LABELS['-0.5']
  return SCORE_LABELS['-1']
}

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
      {/* Header: status badge + score + training state */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className={`text-xs font-bold text-white px-2 py-0.5 rounded-full ${style.badge}`}>
            {STATUS_EMOJI[todayScore.status]} {todayScore.status}
          </span>
          <span className={`text-sm font-bold ${style.text}`}>
            {todayScore.displayScore}/100
          </span>
          {todayScore.trainingState !== 'A' && (
            <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
              {STATE_LABELS[todayScore.trainingState]}
            </span>
          )}
        </div>

        {/* ACWR warning */}
        {todayScore.acwr != null && todayScore.acwr > 1.3 && (
          <div className="mb-1.5 text-[10px] font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded inline-block">
            ⚠️ ACWR {todayScore.acwr.toFixed(2)} — {todayScore.acwr > 1.5 ? 'High injury risk' : 'Elevated'}
          </div>
        )}

        <p className={`text-sm ${style.text} leading-relaxed`}>
          {todayScore.message || 'Calculating readiness...'}
        </p>

        {todayScore.adjustment && todayScore.status !== 'GREEN' && todayScore.status !== 'PEAK' && (
          <div className={`mt-2 px-3 py-1.5 rounded-lg ${style.bg} border ${style.border} inline-block`}>
            <p className={`text-xs font-medium ${style.text}`}>
              💡 {todayScore.adjustment}
            </p>
          </div>
        )}

        {/* Guardrails triggered */}
        {todayScore.guardrailsTriggered && todayScore.guardrailsTriggered.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {todayScore.guardrailsTriggered.map((g, i) => (
              <p key={i} className="text-[9px] text-slate-500 italic">🛡️ {g}</p>
            ))}
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
        {/* Body Battery */}
        <MetricCard
          label="Battery"
          value={bodyBattery !== null ? `${bodyBattery}` : '—'}
          unit={bodyBattery !== null ? '/100' : ''}
          score={todayScore.components.trainingLoad}
          gated={bodyBattery !== null && bodyBattery < 25}
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
  gated,
}: {
  label: string
  value: string
  unit: string
  score: number
  sparkline?: React.ReactNode
  gated?: boolean
}) {
  const { label: scoreLabel, color: scoreColor } = getScoreLabel(score)

  return (
    <div className={`bg-white rounded-lg p-2 text-center ${gated ? 'ring-1 ring-red-300' : ''}`}>
      <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-base font-bold text-slate-800 leading-tight mt-0.5">
        {value}<span className="text-[9px] text-slate-400 font-normal ml-0.5">{unit}</span>
      </p>
      {sparkline && <div className="flex justify-center mt-1">{sparkline}</div>}
      <p className={`text-[9px] font-semibold mt-0.5 ${scoreColor}`}>{scoreLabel}</p>
      {gated && <p className="text-[8px] text-red-500 font-medium">⚠️ Low</p>}
    </div>
  )
}
