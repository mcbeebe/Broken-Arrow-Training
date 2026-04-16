import { useMemo, useState } from 'react'
import type { ReadinessScore, GarminHealthData, CoachRecommendation, PerformanceMetrics, DailyTRIMP, CoachInsight } from '../types'
import type { SorenessLevel } from '../hooks/useSoreness'
import { getTSBState, getTSBLabel, getACWRRisk, getACWRLabel } from '../utils/performance'
import { localDateStr } from '../utils/format'
import TodayBriefing from './TodayBriefing'
import TRIMPBreakdown from './TRIMPBreakdown'
import CoachInsightCard from './CoachInsightCard'

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
  todaySoreness: SorenessLevel | null
  onLogSoreness: (date: string, level: SorenessLevel) => void
  sorenessLoadByDate: Map<string, number>
  coachEnabled?: boolean
  dailyInsight?: CoachInsight | null
  dailyInsightLoading?: boolean
  onAskCoach?: (seed: string) => void
  coachName?: string
  onRegenerateDailyInsight?: () => void
}

// ─── Scale bar component ──────────────────────────────────────
// Renders a horizontal gauge with colored zones and a marker

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

  // Recovery Balance direction
  const tsbDelta = latest.tsb - weekAgo.tsb
  if (Math.abs(tsbDelta) >= 3) {
    lines.push(
      tsbDelta > 0
        ? `🌱 Recovery Balance improving (+${Math.abs(tsbDelta).toFixed(0)}) — you're getting fresher.`
        : `⬇️ Recovery Balance dropped (${tsbDelta.toFixed(0)}) — fatigue accumulating from training load.`
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
  todaySoreness,
  onLogSoreness,
  sorenessLoadByDate,
  coachEnabled,
  dailyInsight,
  dailyInsightLoading,
  onAskCoach,
  coachName,
  onRegenerateDailyInsight,
}: SummaryProps) {
  const latestPerf = performance.length > 0 ? performance[performance.length - 1] : null
  const [perfOpen, setPerfOpen] = useState(false)
  const [narrativeOpen, setNarrativeOpen] = useState(true)

  const weekNarrative = useMemo(
    () => buildWeekNarrative(performance, dailyTrimp),
    [performance, dailyTrimp],
  )

  return (
    <div className="px-3 py-4 space-y-3">
      {/* LLM-generated daily coach read (Mike-only). Silent when Coach
          API is offline and no fallback text is wired. */}
      {coachEnabled && (
        <CoachInsightCard
          insight={dailyInsight ?? null}
          loading={!!dailyInsightLoading}
          onAsk={onAskCoach}
          coachName={coachName}
          onRegenerate={onRegenerateDailyInsight}
        />
      )}

      {/* Unified daily briefing: coach + readiness + why */}
      {garminConnected && todayScore ? (
        <TodayBriefing
          todayScore={todayScore}
          todayHealth={todayHealth}
          healthHistory={healthHistory}
          coachRecommendation={coachRecommendation}
          onCoachSwap={onCoachSwap}
          performance={performance}
          dailyTrimp={dailyTrimp}
          todaySoreness={todaySoreness}
          onLogSoreness={onLogSoreness}
        />
      ) : (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <p className="text-base font-semibold text-slate-700">Readiness</p>
          <p className="text-sm text-slate-500 mt-1">
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
        // CTL labels: coaching convention (Coggan/Allen 2010, TrainingPeaks).
        // Approximate ranges for recreational-to-competitive endurance athletes.
        const fitnessLabel = latestPerf.ctl < 20 ? 'Building'
          : latestPerf.ctl < 40 ? 'Moderate'
          : latestPerf.ctl < 60 ? 'Strong'
          : latestPerf.ctl < 80 ? 'High'
          : 'Elite'
        // ATL labels: relative to CTL (more meaningful than absolute thresholds).
        // ATL > 1.5× CTL indicates acute overload beyond chronic capacity.
        const fatigueLabel = latestPerf.atl > latestPerf.ctl * 1.5 ? 'Very High'
          : latestPerf.atl > latestPerf.ctl ? 'Elevated'
          : latestPerf.atl > latestPerf.ctl * 0.8 ? 'Balanced'
          : 'Low'
        return (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <button
              onClick={() => setPerfOpen(!perfOpen)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-slate-700">Performance Snapshot</p>
                {!perfOpen && (
                  <p className="text-sm text-slate-500 mt-0.5">
                    Fitness {latestPerf.ctl.toFixed(0)} · Fatigue {latestPerf.atl.toFixed(0)} · Balance {latestPerf.tsb >= 0 ? '+' : ''}{latestPerf.tsb.toFixed(0)} · ACWR {latestPerf.acwr.toFixed(2)}
                  </p>
                )}
                {perfOpen && <p className="text-xs text-slate-400 mt-0.5">Garmin EPOC · 42d / 7d EWMA</p>}
              </div>
              <span className="text-sm text-teal-600 ml-2 shrink-0">{perfOpen ? '▴ Hide' : '▾ Details'}</span>
            </button>
            {perfOpen && (
            <div className="px-4 pb-4 space-y-3">
              {/* Fitness (CTL) — left=worst (red), right=best (green) */}
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl font-bold text-blue-700">{latestPerf.ctl.toFixed(0)}</span>
                    <span className="text-xs text-slate-500 ml-2">/ 100</span>
                  </div>
                  <p className="text-xs text-blue-600 font-semibold">{fitnessLabel}</p>
                </div>
                <p className="text-xs font-medium text-slate-600">Fitness <span className="text-slate-400 font-normal">— 42-day training base (CTL)</span></p>
                <p className="text-[9px] text-slate-400 mt-0.5 italic">Cardiovascular + musculoskeletal load · EPOC + MIM + DOMS + soreness</p>
                <div className="relative mt-2 h-3 rounded-full overflow-hidden flex border border-blue-200">
                  <div className="h-full bg-red-200" style={{ width: '20%' }} />
                  <div className="h-full bg-orange-200" style={{ width: '20%' }} />
                  <div className="h-full bg-amber-200" style={{ width: '20%' }} />
                  <div className="h-full bg-green-300" style={{ width: '20%' }} />
                  <div className="h-full bg-emerald-400" style={{ width: '20%' }} />
                  <div
                    className="absolute top-0 w-1.5 h-full bg-slate-900 rounded shadow"
                    style={{ left: `${Math.min(100, (latestPerf.ctl / 100) * 100)}%`, transform: 'translateX(-50%)' }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                  <span>0 Beginner</span><span>20</span><span>40</span><span>60</span><span>80 Competitive</span><span>100+</span>
                </div>
              </div>

              {/* Fatigue (ATL) — flipped: left=high fatigue (red), right=fresh (green) */}
              <div className="bg-red-50 rounded-lg p-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl font-bold text-red-600">{latestPerf.atl.toFixed(0)}</span>
                    <span className="text-xs text-slate-500 ml-2">vs fitness {latestPerf.ctl.toFixed(0)}</span>
                  </div>
                  <p className="text-xs text-red-500 font-semibold">{fatigueLabel}</p>
                </div>
                <p className="text-xs font-medium text-slate-600">Fatigue <span className="text-slate-400 font-normal">— 7-day recent load (ATL)</span></p>
                <p className="text-[9px] text-slate-400 mt-0.5 italic">Includes DOMS carry-over + perceived soreness from check-in</p>
                <div className="relative mt-2 h-3 rounded-full overflow-hidden flex border border-red-200">
                  <div className="h-full bg-red-300" style={{ width: '23%' }} />
                  <div className="h-full bg-red-200" style={{ width: '22%' }} />
                  <div className="h-full bg-amber-200" style={{ width: '22%' }} />
                  <div className="h-full bg-green-300" style={{ width: '33%' }} />
                  <div
                    className="absolute top-0 w-1.5 h-full bg-slate-900 rounded shadow"
                    style={{ left: `${Math.max(0, Math.min(100, (1 - latestPerf.atl / 120) * 100))}%`, transform: 'translateX(-50%)' }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                  <span>120 Very High</span><span>80 High</span><span>40 Balanced</span><span>0 Fresh</span>
                </div>
              </div>

              {/* Recovery Balance (TSB) — left=deep fatigue (red), right=peak (green) */}
              <div className={`rounded-lg p-3 ${
                tsbState === 'peaked' || tsbState === 'well_rested' ? 'bg-green-50'
                : tsbState === 'productive' ? 'bg-slate-50'
                : 'bg-amber-50'
              }`}>
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className={`text-2xl font-bold ${
                      latestPerf.tsb >= 5 ? 'text-green-700'
                      : latestPerf.tsb >= -10 ? 'text-slate-700'
                      : 'text-amber-700'
                    }`}>{latestPerf.tsb >= 0 ? '+' : ''}{latestPerf.tsb.toFixed(0)}</span>
                    <span className="text-xs text-slate-500 ml-2">range: -30 to +25</span>
                  </div>
                  <p className={`text-xs font-semibold ${
                    latestPerf.tsb >= 5 ? 'text-green-600'
                    : latestPerf.tsb >= -10 ? 'text-slate-500'
                    : 'text-amber-600'
                  }`}>{getTSBLabel(tsbState)}</p>
                </div>
                <p className="text-xs font-medium text-slate-600">Recovery Balance <span className="text-slate-400 font-normal">— are you fresh or fatigued? (TSB)</span></p>
                <p className="text-[9px] text-slate-400 mt-0.5 italic">Fitness minus Fatigue · negative = cardio + muscle fatigue exceeds base</p>
                <div className="relative mt-2 h-3 rounded-full overflow-hidden flex border border-slate-200">
                  <div className="h-full bg-red-300" style={{ width: '15%' }} />
                  <div className="h-full bg-orange-200" style={{ width: '16%' }} />
                  <div className="h-full bg-amber-200" style={{ width: '23%' }} />
                  <div className="h-full bg-green-200" style={{ width: '16%' }} />
                  <div className="h-full bg-green-300" style={{ width: '15%' }} />
                  <div className="h-full bg-emerald-400" style={{ width: '15%' }} />
                  <div
                    className="absolute top-0 w-2 h-full bg-slate-900 rounded shadow"
                    style={{ left: `${Math.max(0, Math.min(100, ((latestPerf.tsb + 30) / 55) * 100))}%`, transform: 'translateX(-50%)' }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                  <span>-30 Deep fatigue</span><span>-10</span><span>0</span><span>+5</span><span>+15 Fresh</span><span>+25 Peak</span>
                </div>
              </div>

              {/* ACWR — full width */}
              <div className={`rounded-lg p-3 ${
                acwrRisk === 'sweet_spot' ? 'bg-green-50'
                : acwrRisk === 'high_risk' ? 'bg-red-50'
                : 'bg-amber-50'
              }`}>
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className={`text-2xl font-bold ${
                      acwrRisk === 'sweet_spot' ? 'text-green-700'
                      : acwrRisk === 'high_risk' ? 'text-red-600'
                      : 'text-amber-600'
                    }`}>{latestPerf.acwr.toFixed(2)}</span>
                    <span className="text-xs text-slate-500 ml-2">sweet spot: 0.8–1.3</span>
                  </div>
                  <p className={`text-xs font-semibold ${
                    acwrRisk === 'sweet_spot' ? 'text-green-600'
                    : acwrRisk === 'high_risk' ? 'text-red-500'
                    : 'text-amber-600'
                  }`}>{getACWRLabel(acwrRisk)}</p>
                </div>
                <p className="text-xs font-medium text-slate-600">Load Ratio <span className="text-slate-400 font-normal">— acute vs chronic workload (ACWR)</span></p>
                <p className="text-[9px] text-slate-400 mt-0.5 italic">How fast you're ramping · includes all load: cardio, strength, DOMS, soreness</p>
                {/* ACWR as a "safety" gauge: marker position = how close
                    you are to the sweet-spot center (1.05). Farther away
                    (either direction) → marker drifts left toward red.
                    Deep in sweet spot → marker far right in green. */}
                {(() => {
                  const safety = Math.max(0, Math.min(1, 1 - Math.abs(latestPerf.acwr - 1.05) / 0.95))
                  return (
                    <>
                      <div className="relative mt-2 h-3 rounded-full overflow-hidden flex border border-slate-200">
                        <div className="h-full bg-red-300" style={{ width: '25%' }} />
                        <div className="h-full bg-amber-300" style={{ width: '25%' }} />
                        <div className="h-full bg-green-300" style={{ width: '25%' }} />
                        <div className="h-full bg-emerald-400" style={{ width: '25%' }} />
                        <div
                          className="absolute top-0 w-2 h-full bg-slate-900 rounded shadow"
                          style={{ left: `${safety * 100}%`, transform: 'translateX(-50%)' }}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                        <span>Danger</span><span>Caution</span><span>Good</span><span className="font-semibold text-green-600">Sweet Spot</span>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
            )}
          </div>
        )
      })()}

      {/* What Changed This Week */}
      {weekNarrative.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <button
            onClick={() => setNarrativeOpen(!narrativeOpen)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
          >
            <p className="text-base font-semibold text-slate-700">What Changed This Week</p>
            <span className="text-sm text-teal-600 ml-2 shrink-0">{narrativeOpen ? '▴ Hide' : '▾ Show'}</span>
          </button>
          {narrativeOpen && (
            <div className="px-4 pb-4 space-y-1.5">
              {weekNarrative.map((line, i) => (
                <p key={i} className="text-sm text-slate-600 leading-relaxed">{line}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 7-day training load */}
      {dailyTrimp.length > 0 && (
        <TRIMPBreakdown dailyTrimp={dailyTrimp} sorenessLoadByDate={sorenessLoadByDate} />
      )}

      {/* Week readiness trend */}
      {weekScores.length > 1 && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <p className="text-base font-semibold text-slate-700 mb-2">This Week's Readiness</p>
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
                  <p className="text-xs text-slate-500">{score.date.slice(5)}</p>
                  <p className="text-sm font-medium text-slate-600">{score.displayScore}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
