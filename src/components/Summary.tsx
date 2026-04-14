import type { ReadinessScore, GarminHealthData, CoachRecommendation, PerformanceMetrics, DailyTRIMP } from '../types'
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
      {latestPerf && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <p className="text-sm font-semibold text-slate-700 mb-2">Performance Snapshot</p>
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center">
              <p className="text-lg font-bold text-blue-700">{latestPerf.ctl.toFixed(0)}</p>
              <p className="text-[9px] text-slate-400 uppercase">Fitness</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-red-600">{latestPerf.atl.toFixed(0)}</p>
              <p className="text-[9px] text-slate-400 uppercase">Fatigue</p>
            </div>
            <div className="text-center">
              <p className={`text-lg font-bold ${latestPerf.tsb >= 0 ? 'text-green-700' : 'text-slate-700'}`}>
                {latestPerf.tsb >= 0 ? '+' : ''}{latestPerf.tsb.toFixed(0)}
              </p>
              <p className="text-[9px] text-slate-400 uppercase">Form</p>
            </div>
            <div className="text-center">
              <p className={`text-lg font-bold ${
                latestPerf.acwr >= 0.8 && latestPerf.acwr <= 1.3 ? 'text-green-700'
                : latestPerf.acwr > 1.5 ? 'text-red-600' : 'text-amber-600'
              }`}>
                {latestPerf.acwr.toFixed(2)}
              </p>
              <p className="text-[9px] text-slate-400 uppercase">ACWR</p>
            </div>
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
                  <p className="text-[9px] text-slate-500">{score.date.slice(5)}</p>
                  <p className="text-[10px] font-medium text-slate-600">{score.displayScore}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
