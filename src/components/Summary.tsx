import type { ReadinessScore, GarminHealthData, CoachRecommendation, PerformanceMetrics, DailyTRIMP } from '../types'
import { getTSBState, getTSBLabel, getACWRRisk, getACWRLabel } from '../utils/performance'
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

      {/* Quick performance snapshot */}
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
                <p className="text-[10px] text-slate-400">42-day training base (CTL)</p>
              </div>
              {/* Fatigue (ATL) */}
              <div className="bg-red-50 rounded-lg p-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-2xl font-bold text-red-600">{latestPerf.atl.toFixed(0)}</p>
                  <p className="text-[10px] text-red-500 font-medium">{fatigueLabel}</p>
                </div>
                <p className="text-xs font-medium text-slate-600 mt-0.5">Fatigue</p>
                <p className="text-[10px] text-slate-400">7-day cardio load (ATL)</p>
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
                <p className="text-[10px] text-slate-400">Fitness − Fatigue (TSB)</p>
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
                <p className="text-[10px] text-slate-400">ACWR · sweet spot 0.8–1.3</p>
              </div>
            </div>
          </div>
        )
      })()}

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
