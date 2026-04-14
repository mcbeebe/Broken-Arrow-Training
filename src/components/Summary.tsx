import { useMemo } from 'react'
import type { ReadinessScore, GarminHealthData, CoachRecommendation, PerformanceMetrics, DailyTRIMP } from '../types'
import { getTSBState, getTSBLabel, getACWRRisk, getACWRLabel } from '../utils/performance'
import { localDateStr } from '../utils/format'
import ReadinessBanner from './ReadinessBanner'
import CoachCard from './CoachCard'
import TRIMPBreakdown from './TRIMPBreakdown'

interface SummaryProps {
  todayScore: ReadinessScore | null
  weekScores: ReadinessScore[]
  todayHealth?: GarminHealthData
  healthHistory: GarminHealthData[]
  garminConnected: boolean
  coachRecommendation?: CoachRecommendation
  onCoachSwap?: (fromIndex: number, toIndex: number) => void
  dailyTrimp: DailyTRIMP[]
  performance: PerformanceMetrics[]
}

// ─── Scale bar component ──────────────────────────────────────
// Renders a horizontal gauge with colored zones and a marker

function ScaleBar({ value, zones, min, max }: {
  value: number
  zones: { from: number; to: number; color: string; label?: string }[]
  min: number
  max: number
}) {
  const range = max - min
  const pct = Math.max(0, Math.min(100, ((value - min) / range) * 100))

  return (
    <div className="mt-1.5">
      <div className="relative h-2 rounded-full overflow-hidden flex">
        {zones.map((z, i) => {
          const width = ((z.to - z.from) / range) * 100
          return (
            <div
              key={i}
              className="h-full"
              style={{ width: `${width}%`, backgroundColor: z.color, opacity: 0.3 }}
            />
          )
        })}
        {/* Marker */}
        <div
          className="absolute top-0 w-0.5 h-full bg-slate-800 rounded"
          style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
        />
      </div>
      <div className="flex justify-between mt-0.5">
        {zones.filter(z => z.label).map((z, i) => {
          const center = ((z.from + z.to) / 2 - min) / range * 100
          return (
            <span
              key={i}
              className="text-[8px] text-slate-400 absolute"
              style={{ left: `${center}%`, transform: 'translateX(-50%)' }}
            >
              {z.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ─── What Changed This Week narrative ─────────────────────────

function buildWeekNarrative(
  performance: PerformanceMetrics[],
  dailyTrimp: DailyTRIMP[],
): string[] {
  const lines: string[] = []
  if (performance.length < 2) return lines

  const today = localDateStr()
  const sevenAgo = localDateStr(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))

  // Get performance 7 days ago vs now
  const weekAgo = performance.find(p => p.date === sevenAgo) || performance[Math.max(0, performance.length - 8)]
  const latest = performance[performance.length - 1]

  if (!weekAgo || !latest) return lines

  // CTL trend
  const ctlDelta = latest.ctl - weekAgo.ctl
  if (Math.abs(ctlDelta) >= 1) {
    lines.push(
      ctlDelta > 0
        ? `📈 Fitness up ${Math.abs(ctlDelta).toFixed(0)} pts this week from consistent training.`
        : `📉 Fitness down ${Math.abs(ctlDelta).toFixed(0)} pts — lighter training or rest days pulled it down.`
    )
  }

  // Find biggest workout in last 7 days
  const recentDays = dailyTrimp.filter(d => d.date >= sevenAgo && d.date <= today && d.total > 0)
  if (recentDays.length > 0) {
    const biggest = recentDays.reduce((a, b) => a.total > b.total ? a : b)
    const topRecord = biggest.records[0]
    const dayName = new Date(biggest.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })
    const sportLabel = topRecord ? topRecord.sportType.replace(/_/g, ' ') : 'workout'
    lines.push(
      `💪 Biggest load: ${dayName} ${sportLabel} (${Math.round(biggest.total)} adjusted TRIMP).`
    )
  }

  // ATL vs CTL relationship
  if (latest.atl > latest.ctl * 1.3) {
    lines.push(`⚡ Recent training intensity exceeds your base — fatigue is building faster than fitness. Normal in build weeks.`)
  } else if (latest.atl < latest.ctl * 0.7) {
    lines.push(`🔋 Recovery mode — recent load is well below your fitness base. Good time for a quality session.`)
  }

  // Rest day count
  const restDays = recentDays.length === 0 ? 7 : 7 - recentDays.length
  if (restDays >= 3) {
    lines.push(`😴 ${restDays} rest days this week — recovery is pulling fatigue down.`)
  } else if (restDays === 0) {
    lines.push(`🔥 No rest days this week — consider scheduling recovery.`)
  }

  // Form direction
  const tsbDelta = latest.tsb - weekAgo.tsb
  if (Math.abs(tsbDelta) >= 3) {
    lines.push(
      tsbDelta > 0
        ? `🌱 Form improving (+${Math.abs(tsbDelta).toFixed(0)}) — you're getting fresher.`
        : `⬇️ Form dropped (${tsbDelta.toFixed(0)}) — fatigue accumulating from training load.`
    )
  }

  return lines
}

export default function Summary({
  todayScore,
  weekScores,
  todayHealth,
  healthHistory,
  garminConnected,
  coachRecommendation,
  onCoachSwap,
  dailyTrimp,
  performance,
}: SummaryProps) {
  const latestPerf = performance.length > 0 ? performance[performance.length - 1] : null

  const weekNarrative = useMemo(
    () => buildWeekNarrative(performance, dailyTrimp),
    [performance, dailyTrimp],
  )

  return (
    <div className="px-3 py-4 space-y-3">
      {/* AI Coach recommendation */}
      {coachRecommendation && (
        <CoachCard
          recommendation={coachRecommendation}
          onSwap={onCoachSwap ? (from, to) => onCoachSwap(from, to) : undefined}
        />
      )}

      {/* Readiness banner */}
      {garminConnected && todayScore ? (
        <ReadinessBanner
          todayScore={todayScore}
          todayHealth={todayHealth}
          healthHistory={healthHistory}
        />
      ) : (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <p className="text-sm font-semibold text-slate-700">Readiness</p>
          <p className="text-xs text-slate-400 mt-1">
            {garminConnected
              ? 'Syncing Garmin data — readiness score will appear after first sync completes.'
              : 'Connect Garmin in Settings to see daily readiness scoring.'}
          </p>
        </div>
      )}

      {/* Quick performance snapshot with scale bars */}
      {latestPerf && (() => {
        const tsbState = getTSBState(latestPerf.tsb)
        const acwrRisk = getACWRRisk(latestPerf.acwr)
        const fitnessLabel = latestPerf.ctl < 20 ? 'Building'
          : latestPerf.ctl < 40 ? 'Moderate'
          : latestPerf.ctl < 60 ? 'Strong'
          : latestPerf.ctl < 80 ? 'High'
          : 'Elite'
        const fatigueLabel = latestPerf.atl > latestPerf.ctl * 1.5 ? 'Very High'
          : latestPerf.atl > latestPerf.ctl ? 'Elevated'
          : latestPerf.atl > latestPerf.ctl * 0.8 ? 'Balanced'
          : 'Low'
        return (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-sm font-semibold text-slate-700">Performance Snapshot</p>
              <p className="text-[10px] text-slate-400">Garmin EPOC · 42d / 7d EWMA</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* Fitness (CTL) */}
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-2xl font-bold text-blue-700">{latestPerf.ctl.toFixed(0)}</p>
                  <p className="text-[10px] text-blue-500 font-medium">{fitnessLabel}</p>
                </div>
                <p className="text-xs font-medium text-slate-600 mt-0.5">Fitness</p>
                {/* Scale: 0─20─40─60─80─100 */}
                <div className="mt-1.5">
                  <div className="relative h-1.5 rounded-full overflow-hidden flex">
                    <div className="h-full" style={{ width: '20%', backgroundColor: '#BFDBFE' }} />
                    <div className="h-full" style={{ width: '20%', backgroundColor: '#93C5FD' }} />
                    <div className="h-full" style={{ width: '20%', backgroundColor: '#60A5FA' }} />
                    <div className="h-full" style={{ width: '20%', backgroundColor: '#3B82F6' }} />
                    <div className="h-full" style={{ width: '20%', backgroundColor: '#2563EB' }} />
                    <div
                      className="absolute top-0 w-1 h-full bg-blue-900 rounded"
                      style={{ left: `${Math.min(100, (latestPerf.ctl / 100) * 100)}%`, transform: 'translateX(-50%)' }}
                    />
                  </div>
                  <div className="flex justify-between text-[8px] text-slate-400 mt-0.5">
                    <span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span>
                  </div>
                </div>
              </div>
              {/* Fatigue (ATL) */}
              <div className="bg-red-50 rounded-lg p-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-2xl font-bold text-red-600">{latestPerf.atl.toFixed(0)}</p>
                  <p className="text-[10px] text-red-500 font-medium">{fatigueLabel}</p>
                </div>
                <p className="text-xs font-medium text-slate-600 mt-0.5">Fatigue</p>
                {/* Scale relative to fitness */}
                <div className="mt-1.5">
                  <div className="relative h-1.5 rounded-full overflow-hidden flex">
                    <div className="h-full" style={{ width: '40%', backgroundColor: '#BBF7D0' }} />
                    <div className="h-full" style={{ width: '20%', backgroundColor: '#FDE68A' }} />
                    <div className="h-full" style={{ width: '20%', backgroundColor: '#FECACA' }} />
                    <div className="h-full" style={{ width: '20%', backgroundColor: '#FCA5A5' }} />
                    <div
                      className="absolute top-0 w-1 h-full bg-red-900 rounded"
                      style={{ left: `${Math.min(100, (latestPerf.atl / 120) * 100)}%`, transform: 'translateX(-50%)' }}
                    />
                  </div>
                  <div className="flex justify-between text-[8px] text-slate-400 mt-0.5">
                    <span>Low</span><span>Balanced</span><span>High</span><span>Very High</span>
                  </div>
                </div>
              </div>
              {/* Form (TSB) */}
              <div className={`rounded-lg p-3 ${
                tsbState === 'peaked' || tsbState === 'well_rested' ? 'bg-green-50'
                : tsbState === 'productive' ? 'bg-slate-50'
                : 'bg-amber-50'
              }`}>
                <div className="flex items-baseline justify-between">
                  <p className={`text-2xl font-bold ${
                    latestPerf.tsb >= 5 ? 'text-green-700'
                    : latestPerf.tsb >= -10 ? 'text-slate-700'
                    : 'text-amber-700'
                  }`}>
                    {latestPerf.tsb >= 0 ? '+' : ''}{latestPerf.tsb.toFixed(0)}
                  </p>
                  <p className={`text-[10px] font-medium ${
                    latestPerf.tsb >= 5 ? 'text-green-600'
                    : latestPerf.tsb >= -10 ? 'text-slate-500'
                    : 'text-amber-600'
                  }`}>{getTSBLabel(tsbState)}</p>
                </div>
                <p className="text-xs font-medium text-slate-600 mt-0.5">Form</p>
                {/* Scale: -30 ── -10 ── +5 ── +15 ── +25 */}
                <div className="mt-1.5">
                  <div className="relative h-1.5 rounded-full overflow-hidden flex">
                    <div className="h-full" style={{ width: '18%', backgroundColor: '#FCA5A5' }} title="Danger" />
                    <div className="h-full" style={{ width: '18%', backgroundColor: '#FECACA' }} title="Overreaching" />
                    <div className="h-full" style={{ width: '28%', backgroundColor: '#E2E8F0' }} title="Productive" />
                    <div className="h-full" style={{ width: '18%', backgroundColor: '#BBF7D0' }} title="Fresh" />
                    <div className="h-full" style={{ width: '18%', backgroundColor: '#86EFAC' }} title="Peaked" />
                    <div
                      className="absolute top-0 w-1 h-full bg-slate-800 rounded"
                      style={{ left: `${Math.max(0, Math.min(100, ((latestPerf.tsb + 40) / 65) * 100))}%`, transform: 'translateX(-50%)' }}
                    />
                  </div>
                  <div className="flex justify-between text-[8px] text-slate-400 mt-0.5">
                    <span>-30 tired</span><span>0</span><span>+15 fresh</span><span>+25 peak</span>
                  </div>
                </div>
              </div>
              {/* ACWR */}
              <div className={`rounded-lg p-3 ${
                acwrRisk === 'sweet_spot' ? 'bg-green-50'
                : acwrRisk === 'high_risk' ? 'bg-red-50'
                : 'bg-amber-50'
              }`}>
                <div className="flex items-baseline justify-between">
                  <p className={`text-2xl font-bold ${
                    acwrRisk === 'sweet_spot' ? 'text-green-700'
                    : acwrRisk === 'high_risk' ? 'text-red-600'
                    : 'text-amber-600'
                  }`}>
                    {latestPerf.acwr.toFixed(2)}
                  </p>
                  <p className={`text-[10px] font-medium ${
                    acwrRisk === 'sweet_spot' ? 'text-green-600'
                    : acwrRisk === 'high_risk' ? 'text-red-500'
                    : 'text-amber-600'
                  }`}>{getACWRLabel(acwrRisk)}</p>
                </div>
                <p className="text-xs font-medium text-slate-600 mt-0.5">Load Ratio</p>
                {/* Scale: 0 ── 0.8 ── 1.3 ── 1.5 ── 2.0 */}
                <div className="mt-1.5">
                  <div className="relative h-1.5 rounded-full overflow-hidden flex">
                    <div className="h-full" style={{ width: '40%', backgroundColor: '#93C5FD' }} title="Undertraining" />
                    <div className="h-full" style={{ width: '25%', backgroundColor: '#86EFAC' }} title="Sweet Spot" />
                    <div className="h-full" style={{ width: '10%', backgroundColor: '#FDE68A' }} title="Caution" />
                    <div className="h-full" style={{ width: '25%', backgroundColor: '#FCA5A5' }} title="High Risk" />
                    <div
                      className="absolute top-0 w-1 h-full bg-slate-800 rounded"
                      style={{ left: `${Math.max(0, Math.min(100, (latestPerf.acwr / 2) * 100))}%`, transform: 'translateX(-50%)' }}
                    />
                  </div>
                  <div className="flex justify-between text-[8px] text-slate-400 mt-0.5">
                    <span>0</span><span>0.8</span><span>1.3</span><span>1.5</span><span>2.0</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* What Changed This Week */}
      {weekNarrative.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <p className="text-sm font-semibold text-slate-700 mb-2">What Changed This Week</p>
          <div className="space-y-1.5">
            {weekNarrative.map((line, i) => (
              <p key={i} className="text-xs text-slate-600 leading-relaxed">{line}</p>
            ))}
          </div>
        </div>
      )}

      {/* 7-day training load */}
      {dailyTrimp.length > 0 && (
        <TRIMPBreakdown dailyTrimp={dailyTrimp} />
      )}

      {/* Week readiness trend */}
      {weekScores.length > 1 && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <p className="text-sm font-semibold text-slate-700 mb-2">This Week's Readiness</p>
          <div className="flex gap-1">
            {weekScores.slice(-7).map((score, i) => {
              const dotColor =
                score.status === 'PEAK' ? 'bg-indigo-500'
                : score.status === 'GREEN' ? 'bg-green-500'
                : score.status === 'YELLOW' ? 'bg-amber-400'
                : 'bg-red-500'
              return (
                <div key={i} className="flex-1 text-center">
                  <div className={`w-4 h-4 rounded-full ${dotColor} mx-auto mb-1`} />
                  <p className="text-[10px] text-slate-500">{score.date.slice(5)}</p>
                  <p className="text-xs font-medium text-slate-600">{score.displayScore}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
