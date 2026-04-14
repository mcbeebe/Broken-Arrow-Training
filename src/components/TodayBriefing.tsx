import { useState } from 'react'
import type {
  ReadinessScore,
  ReadinessStatus,
  GarminHealthData,
  CoachRecommendation,
  PerformanceMetrics,
  DailyTRIMP,
} from '../types'
import { localDateStr } from '../utils/format'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

interface TodayBriefingProps {
  todayScore: ReadinessScore
  todayHealth?: GarminHealthData
  healthHistory: GarminHealthData[]
  coachRecommendation?: CoachRecommendation
  onCoachSwap?: (fromIndex: number, toIndex: number) => void
  performance: PerformanceMetrics[]
  dailyTrimp: DailyTRIMP[]
}

// ─── Status visual styles ────────────────────────────────────────

const STATUS_STYLES: Record<ReadinessStatus, {
  bg: string; border: string; text: string; badge: string
  dot: string; accent: string; gradientFrom: string; gradientTo: string
}> = {
  PEAK: {
    bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-800',
    badge: 'bg-indigo-600', dot: 'bg-indigo-500', accent: '#6366F1',
    gradientFrom: 'from-indigo-50', gradientTo: 'to-indigo-100/50',
  },
  GREEN: {
    bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800',
    badge: 'bg-green-600', dot: 'bg-green-500', accent: '#059669',
    gradientFrom: 'from-green-50', gradientTo: 'to-green-100/50',
  },
  YELLOW: {
    bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800',
    badge: 'bg-amber-500', dot: 'bg-amber-500', accent: '#D97706',
    gradientFrom: 'from-amber-50', gradientTo: 'to-amber-100/50',
  },
  RED: {
    bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800',
    badge: 'bg-red-600', dot: 'bg-red-500', accent: '#DC2626',
    gradientFrom: 'from-red-50', gradientTo: 'to-red-100/50',
  },
}

const STATUS_EMOJI: Record<ReadinessStatus, string> = {
  PEAK: '⭐', GREEN: '🟢', YELLOW: '🟡', RED: '🔴',
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

// ─── "Why" narrative builder ─────────────────────────────────────

function buildWhyNarrative(
  todayScore: ReadinessScore,
  todayHealth: GarminHealthData | undefined,
  healthHistory: GarminHealthData[],
  performance: PerformanceMetrics[],
  dailyTrimp: DailyTRIMP[],
): string[] {
  const lines: string[] = []
  const { components } = todayScore
  const today = localDateStr()

  // ── Sleep impact (most actionable driver) ──
  if (todayHealth?.sleep) {
    const hrs = todayHealth.sleep.durationSeconds / 3600
    if (hrs < 6) {
      lines.push(`Sleep was only ${hrs.toFixed(1)}h last night — that's the biggest drag on your readiness today.`)
    } else if (hrs < 7) {
      lines.push(`Sleep was short at ${hrs.toFixed(1)}h last night, pulling your score down.`)
    } else if (hrs >= 8 && components.sleep >= 1) {
      lines.push(`Solid ${hrs.toFixed(1)}h sleep last night is boosting your recovery.`)
    }
  }

  // ── HRV trend (last 2 days vs baseline) ──
  const recent = healthHistory
    .filter(d => d.date && d.hrv?.lastNightAvg)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7)

  if (recent.length >= 2) {
    const todayHRV = recent[recent.length - 1].hrv?.lastNightAvg
    const yesterdayHRV = recent[recent.length - 2].hrv?.lastNightAvg
    if (todayHRV && yesterdayHRV) {
      const delta = todayHRV - yesterdayHRV
      if (Math.abs(delta) >= 3) {
        lines.push(
          delta > 0
            ? `HRV up ${Math.abs(delta).toFixed(0)}ms from yesterday — your nervous system is recovering well.`
            : `HRV dropped ${Math.abs(delta).toFixed(0)}ms from yesterday — your body is still processing recent stress.`
        )
      }
    }
  }

  // ── Recent training load context (last 2 days) ──
  const recentDays = dailyTrimp
    .filter(d => d.date <= today && d.total > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)

  if (recentDays.length > 0) {
    const yesterday = recentDays.find(d => {
      const yd = localDateStr(new Date(Date.now() - 24 * 60 * 60 * 1000))
      return d.date === yd
    })
    const dayBefore = recentDays.find(d => {
      const dbd = localDateStr(new Date(Date.now() - 48 * 60 * 60 * 1000))
      return d.date === dbd
    })

    if (yesterday && yesterday.total > 0) {
      const topRecord = yesterday.records[0]
      const sport = topRecord ? topRecord.sportType.replace(/_/g, ' ') : 'workout'
      if (yesterday.total > 150) {
        lines.push(`Yesterday's ${sport} was a heavy session (${Math.round(yesterday.total)} load) — that's adding to today's fatigue.`)
      } else if (yesterday.total > 80) {
        lines.push(`Yesterday's ${sport} (${Math.round(yesterday.total)} load) is factoring into today's recovery.`)
      }
    }

    if (dayBefore && dayBefore.total > 100) {
      const topRecord = dayBefore.records[0]
      const sport = topRecord ? topRecord.sportType.replace(/_/g, ' ') : 'workout'
      lines.push(`Day before yesterday's ${sport} (${Math.round(dayBefore.total)} load) is still influencing your fatigue.`)
    }
  }

  // ── ACWR / load ratio context ──
  if (performance.length > 0) {
    const latest = performance[performance.length - 1]
    if (latest.acwr > 1.5) {
      lines.push(`Your load ratio (${latest.acwr.toFixed(2)}) is high — you've been training harder than your body is adapted to.`)
    } else if (latest.acwr > 1.3) {
      lines.push(`Load ratio (${latest.acwr.toFixed(2)}) is slightly elevated — you're pushing above your chronic base.`)
    } else if (latest.acwr < 0.6) {
      lines.push(`Load ratio is low (${latest.acwr.toFixed(2)}) — you've been resting more than usual.`)
    }
  }

  // ── Body battery ──
  if (todayHealth?.bodyBattery?.current != null) {
    const bb = todayHealth.bodyBattery.current
    if (bb < 30) {
      lines.push(`Body battery is low at ${bb}/100 — your body hasn't fully recharged.`)
    } else if (bb > 80 && todayScore.status !== 'RED') {
      lines.push(`Body battery is strong at ${bb}/100.`)
    }
  }

  // ── Guardrails ──
  if (todayScore.guardrailsTriggered && todayScore.guardrailsTriggered.length > 0) {
    for (const g of todayScore.guardrailsTriggered) {
      lines.push(`${g}`)
    }
  }

  return lines
}

// ─── Sparkline component ─────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const chartData = data.map((v, i) => ({ v, i }))
  return (
    <div style={{ width: 60, height: 28 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────

export default function TodayBriefing({
  todayScore,
  todayHealth,
  healthHistory,
  coachRecommendation,
  onCoachSwap,
  performance,
  dailyTrimp,
}: TodayBriefingProps) {
  const [expanded, setExpanded] = useState(true)
  const [swapDone, setSwapDone] = useState(false)
  const style = STATUS_STYLES[todayScore.status]
  const rec = coachRecommendation

  // Build "why" narrative
  const whyLines = buildWhyNarrative(todayScore, todayHealth, healthHistory, performance, dailyTrimp)

  // Sparklines from health history
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

  // Coach action colors
  const actionColors: Record<string, { icon: string; actionBg: string; actionText: string }> = {
    execute: { icon: '✅', actionBg: 'bg-green-100', actionText: 'text-green-800' },
    modify: { icon: '⚠️', actionBg: 'bg-amber-100', actionText: 'text-amber-800' },
    skip: { icon: '🛑', actionBg: 'bg-red-100', actionText: 'text-red-800' },
    swap: { icon: '🔄', actionBg: 'bg-blue-100', actionText: 'text-blue-800' },
    sleep_target: { icon: '🌙', actionBg: 'bg-indigo-100', actionText: 'text-indigo-800' },
  }

  const isMorning = rec?.timeOfDay === 'morning'
  const actionType = rec?.action?.type || (isMorning ? 'execute' : 'sleep_target')
  const actionStyle = actionColors[actionType] || actionColors.execute

  function handleSwap() {
    if (rec?.action?.swapFromIndex != null && rec?.action?.swapToIndex != null && onCoachSwap) {
      onCoachSwap(rec.action.swapFromIndex, rec.action.swapToIndex)
      setSwapDone(true)
    }
  }

  return (
    <div className={`rounded-xl ${style.bg} border ${style.border} overflow-hidden`}>
      {/* ── Header: Status + Score + Coach Headline ── */}
      <div
        className="px-4 pt-4 pb-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold text-white px-2 py-0.5 rounded-full ${style.badge}`}>
              {STATUS_EMOJI[todayScore.status]} {todayScore.status}
            </span>
            <span className={`text-lg font-bold ${style.text}`}>
              {todayScore.displayScore}/100
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400">
              {isMorning ? '☀️' : '🌙'} {isMorning ? 'Morning' : 'Evening'}
            </span>
            <span className="text-xs text-slate-400">{expanded ? '▼' : '›'}</span>
          </div>
        </div>

        {/* Coach headline */}
        {rec && (
          <p className={`text-sm font-bold ${style.text}`}>
            {actionStyle.icon} {rec.headline}
          </p>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* ── Coach Recommendation (what to do) ── */}
          {rec && (
            <div className={`rounded-lg px-3 py-2 ${actionStyle.actionBg}`}>
              <p className={`text-xs ${actionStyle.actionText} leading-relaxed`}>{rec.body}</p>

              {rec.action && rec.action.type !== 'swap' && (
                <p className={`text-xs ${actionStyle.actionText} opacity-75 italic mt-1`}>
                  💡 {rec.action.detail}
                </p>
              )}

              {rec.sleepTarget && (
                <div className="flex items-center gap-2 text-xs mt-1">
                  <span className="text-indigo-600 font-medium">🛏 Sleep target:</span>
                  <span className={`font-bold ${actionStyle.actionText}`}>{rec.sleepTarget}</span>
                </div>
              )}

              {rec.action?.type === 'swap' && !swapDone && onCoachSwap && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleSwap() }}
                  className="text-xs font-medium px-3 py-1.5 mt-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  {rec.action.label}
                </button>
              )}

              {swapDone && (
                <p className="text-xs font-medium text-green-700 mt-1">✅ Swap applied! Refresh to see updated plan.</p>
              )}
            </div>
          )}

          {/* ── Why: What's driving this ── */}
          {whyLines.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Why this recommendation
              </p>
              <div className="space-y-1">
                {whyLines.map((line, i) => (
                  <p key={i} className="text-xs text-slate-600 leading-relaxed">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* ── Health Metrics Grid ── */}
          <div className="grid grid-cols-4 gap-1.5">
            <MetricCard
              label="HRV"
              value={todayHealth?.hrv?.lastNightAvg ? `${Math.round(todayHealth.hrv.lastNightAvg)}` : '—'}
              unit="ms"
              score={todayScore.components.hrv}
              sparkline={<Sparkline data={hrvSparkline} color={style.accent} />}
            />
            <MetricCard
              label="RHR"
              value={todayHealth?.rhr ? `${todayHealth.rhr}` : '—'}
              unit="bpm"
              score={todayScore.components.rhr}
              sparkline={<Sparkline data={rhrSparkline} color={style.accent} />}
            />
            <MetricCard
              label="Sleep"
              value={sleepHours}
              unit="hrs"
              score={todayScore.components.sleep}
            />
            <MetricCard
              label="Battery"
              value={bodyBattery !== null ? `${bodyBattery}` : '—'}
              unit={bodyBattery !== null ? '/100' : ''}
              score={todayScore.components.trainingLoad}
              gated={bodyBattery !== null && bodyBattery < 25}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Metric Card ─────────────────────────────────────────────────

function MetricCard({
  label, value, unit, score, sparkline, gated,
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
