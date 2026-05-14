import { useMemo, useState } from 'react'
import type { ReadinessScore, GarminHealthData, CoachRecommendation, PerformanceMetrics, DailyTRIMP, CoachInsight, PlannedDay, HRZone, CoachSnapshot, CoachAction, RaceInfo } from '../types'
import type { RiskFlag } from '../utils/readiness'
import type { SorenessLevel } from '../hooks/useSoreness'
import { getTSBState, getTSBLabel, getACWRRisk, getACWRLabel } from '../utils/performance'
import { localDateStr } from '../utils/format'
import { findTrimpRecord } from '../utils/trimp'
import TodayBriefing from './TodayBriefing'
import TRIMPBreakdown from './TRIMPBreakdown'
import CoachInsightCard from './CoachInsightCard'
import WorkoutModal from './WorkoutModal'
import { getWorkoutStyle } from '../utils/styles'
import Term from './TermGlossary'
import RaceReadyHeroCard from './RaceReadyHeroCard'
import { computeRaceReadiness } from '../utils/raceReadiness'
import { weeksUntilRace } from '../utils/raceCountdown'

interface SummaryProps {
  athleteId: string
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
  rpeByDate?: Map<string, number>
  exerciseLoadByDate?: Map<string, number>
  domsCarryByDate?: Map<string, number>
  coachEnabled?: boolean
  dailyInsight?: CoachInsight | null
  dailyInsightLoading?: boolean
  onAskCoach?: (seed: string) => void
  coachName?: string
  onRegenerateDailyInsight?: () => void
  todayPlannedWorkout?: PlannedDay | null
  currentWeekNum?: number
  /** Full plan weeks — passed through to WorkoutModal so the strength
   *  progression display inside exercise cards has history to look up. */
  weeks?: import('../types').TrainingWeek[]
  zones?: HRZone[]
  coachSnapshot?: CoachSnapshot | null
  riskFlags?: RiskFlag[]
  getPlannedDay?: (weekNum: number, dayIndex: number) => PlannedDay | null
  onApproveInsightProposal?: (action: CoachAction) => string | undefined
  onUndoInsightProposal?: (overrideId: string) => void
  /** Goal race — drives the race-ready hero card in the final ~8 weeks. */
  race?: RaceInfo
}

// ─── Scale bar component ──────────────────────────────────────
// Consistent 6-segment gauge: red → orange → yellow → light green → green → darker green
// Midpoint (boundary between yellow and light green) = balanced/neutral zone

function GaugeBar({ value, min, max, labels, targetLines, zones }: {
  value: number; min: number; max: number; labels: string[]
  targetLines?: { pos: number; color: string; label?: string }[]
  zones?: string[]
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  return (
    <>
      <div className="relative mt-2.5 h-4 rounded-full overflow-hidden flex border border-slate-200 dark:border-slate-700">
        <div className="h-full bg-red-300" style={{ width: '16.67%' }} />
        <div className="h-full bg-orange-200" style={{ width: '16.67%' }} />
        <div className="h-full bg-amber-200" style={{ width: '16.67%' }} />
        <div className="h-full bg-green-200" style={{ width: '16.67%' }} />
        <div className="h-full bg-green-300" style={{ width: '16.67%' }} />
        <div className="h-full bg-emerald-400" style={{ width: '16.65%' }} />
        {targetLines?.map((t, i) => (
          <div key={i} className="absolute top-0 h-full border-l-2 border-dashed" style={{ left: `${((t.pos - min) / (max - min)) * 100}%`, borderColor: t.color }} />
        ))}
        <div
          className="absolute top-0 w-2.5 h-full bg-slate-900 rounded shadow"
          style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
        />
      </div>
      {zones && (
        <div className="flex mt-0.5">
          {zones.map((z, i) => (
            <span key={i} className="text-[8px] text-slate-400 text-center italic" style={{ width: '16.67%' }}>{z}</span>
          ))}
        </div>
      )}
      {targetLines?.some(t => t.label) && (
        <div className="relative h-3 mt-0">
          {targetLines.filter(t => t.label).map((t, i) => (
            <span key={i} className="absolute text-[8px] font-semibold" style={{ left: `${((t.pos - min) / (max - min)) * 100}%`, transform: 'translateX(-50%)', color: t.color }}>{t.label}</span>
          ))}
        </div>
      )}
      <div className={`flex justify-between text-[9px] text-slate-400 ${zones || targetLines?.some(t => t.label) ? 'mt-0' : 'mt-1'}`}>
        {labels.map((l, i) => <span key={i}>{l}</span>)}
      </div>
    </>
  )
}

// ACWR gauge: 6 equal segments, 1.0 centered in green
// blue → light blue → green → green → yellow → red

function ACWRGaugeBar({ value }: { value: number }) {
  const maxACWR = 2.0
  const pct = Math.max(0, Math.min(100, (value / maxACWR) * 100))
  return (
    <>
      <div className="relative mt-2.5 h-4 rounded-full overflow-hidden flex border border-slate-200 dark:border-slate-700">
        <div className="h-full bg-blue-300" style={{ width: '16.67%' }} />
        <div className="h-full bg-blue-200" style={{ width: '16.67%' }} />
        <div className="h-full bg-green-300" style={{ width: '16.67%' }} />
        <div className="h-full bg-green-200" style={{ width: '16.67%' }} />
        <div className="h-full bg-amber-300" style={{ width: '16.67%' }} />
        <div className="h-full bg-red-300" style={{ width: '16.65%' }} />
        <div className="absolute top-0 h-full border-l-2 border-dashed border-green-700/60" style={{ left: `${(0.8 / maxACWR) * 100}%` }} />
        <div className="absolute top-0 h-full border-l-2 border-dashed border-green-700/60" style={{ left: `${(1.3 / maxACWR) * 100}%` }} />
        <div
          className="absolute top-0 w-2.5 h-full bg-slate-900 rounded shadow"
          style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
        />
      </div>
      <div className="flex mt-0.5">
        <span className="text-[8px] text-slate-400 text-center italic" style={{ width: '16.67%' }}>Detrained</span>
        <span className="text-[8px] text-slate-400 text-center italic" style={{ width: '16.67%' }}>Under</span>
        <span className="text-[8px] text-green-600 text-center italic font-semibold" style={{ width: '33.34%' }}>Sweet Spot</span>
        <span className="text-[8px] text-slate-400 text-center italic" style={{ width: '16.67%' }}>Caution</span>
        <span className="text-[8px] text-slate-400 text-center italic" style={{ width: '16.65%' }}>Danger</span>
      </div>
      <div className="flex justify-between text-[9px] text-slate-400 mt-0">
        <span>0</span>
        <span>0.33</span>
        <span>0.67</span>
        <span className="font-semibold text-green-600">1.0</span>
        <span>1.33</span>
        <span>1.67</span>
        <span>2.0</span>
      </div>
    </>
  )
}

// Inline 7-day sparkline rendered as a tiny SVG
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const h = 16, w = 36
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 2) - 1}`
  ).join(' ')
  return (
    <svg width={w} height={h} className="inline-block mr-1 align-middle">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
  athleteId,
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
  rpeByDate,
  exerciseLoadByDate,
  domsCarryByDate,
  coachEnabled,
  dailyInsight,
  dailyInsightLoading,
  onAskCoach,
  coachName,
  onRegenerateDailyInsight,
  todayPlannedWorkout,
  currentWeekNum,
  weeks,
  zones,
  coachSnapshot,
  riskFlags = [],
  getPlannedDay,
  onApproveInsightProposal,
  onUndoInsightProposal,
  race,
}: SummaryProps) {
  const latestPerf = performance.length > 0 ? performance[performance.length - 1] : null
  const [perfOpen, setPerfOpen] = useState(false)
  const [narrativeOpen, setNarrativeOpen] = useState(true)
  const [showTodayModal, setShowTodayModal] = useState(false)

  const weekNarrative = useMemo(
    () => buildWeekNarrative(performance, dailyTrimp),
    [performance, dailyTrimp],
  )

  // Race-ready hero is pinned to the top of Summary in the last ~8 weeks
  // before a goal race. The window is wide enough to span a full taper
  // (which begins ~2-3 weeks out) and the final build block.
  const raceReadiness = useMemo(() => {
    if (!race) return null
    const weeks = weeksUntilRace(race.date)
    if (weeks == null || weeks < 0 || weeks > 8) return null
    return computeRaceReadiness({ race, performance })
  }, [race, performance])

  return (
    <div className="px-3 py-4 space-y-3">
      {race && raceReadiness && (
        <RaceReadyHeroCard race={{ name: race.name, distance: race.distance }} summary={raceReadiness} />
      )}
      {coachEnabled && (
        <CoachInsightCard
          insight={dailyInsight ?? null}
          loading={!!dailyInsightLoading}
          onAsk={onAskCoach}
          coachName={coachName}
          onRegenerate={onRegenerateDailyInsight}
          athleteId={athleteId}
          getPlannedDay={getPlannedDay}
          onApproveProposal={onApproveInsightProposal}
          onUndoProposal={onUndoInsightProposal}
        />
      )}

      {/* Today's Workout CTA */}
      {todayPlannedWorkout && todayPlannedWorkout.type !== 'rest' && (() => {
        const style = getWorkoutStyle(todayPlannedWorkout.type)
        const isCompleted = !!todayPlannedWorkout.actual
        return (
          <>
            <button
              onClick={() => setShowTodayModal(true)}
              className="w-full text-left rounded-xl border-2 px-3 py-2.5 transition-colors"
              style={{ borderColor: style.border, backgroundColor: isCompleted ? style.bg : 'white' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    {isCompleted ? 'Completed' : "Today's Workout"}
                  </p>
                  <p className="font-bold text-slate-800 dark:text-white mt-0.5">{todayPlannedWorkout.workout}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                    {todayPlannedWorkout.zone !== '—' && todayPlannedWorkout.zone}
                    {todayPlannedWorkout.time !== '—' && ` · ${todayPlannedWorkout.time}`}
                  </p>
                </div>
                <span className="text-2xl">{style.label}</span>
              </div>
            </button>
            {showTodayModal && (
              <WorkoutModal
                day={todayPlannedWorkout}
                weekNum={currentWeekNum ?? 1}
                onClose={() => setShowTodayModal(false)}
                zones={zones || []}
                weeks={weeks}
                readiness={todayScore ?? undefined}
                latestPerf={latestPerf}
                coachSnapshot={coachSnapshot ?? undefined}
                athleteId={athleteId}
                trimpRecord={findTrimpRecord(
                  dailyTrimp,
                  localDateStr(),
                  todayPlannedWorkout.actual?.name,
                )}
              />
            )}
          </>
        )
      })()}

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
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
          <p className="text-base font-semibold text-slate-700 dark:text-slate-200">Readiness</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {garminConnected
              ? 'Syncing Garmin data — readiness score will appear after first sync completes.'
              : 'Connect Garmin in Settings to see daily readiness scoring.'}
          </p>
        </div>
      )}

      {/* Forward-looking risk alerts — only renders when active flags present */}
      {riskFlags.length > 0 && <SummaryRiskFlags flags={riskFlags} />}

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
        const last7 = performance.slice(-7)
        const ctlSpark = last7.map(p => p.ctl)
        const atlSpark = last7.map(p => p.atl)
        const tsbSpark = last7.map(p => p.tsb)
        const acwrSpark = last7.map(p => p.acwr)
        return (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
            <button
              onClick={() => setPerfOpen(!perfOpen)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-slate-700 dark:text-slate-200">Performance Snapshot</p>
                {!perfOpen && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    {fitnessLabel} fitness · {fatigueLabel} fatigue · {latestPerf.tsb >= 5 ? 'Fresh' : latestPerf.tsb >= -10 ? 'Balanced' : latestPerf.tsb >= -25 ? 'Tired' : 'Deep fatigue'}
                  </p>
                )}
                {perfOpen && <p className="text-xs text-slate-400 mt-0.5">Garmin EPOC · 42d / 7d EWMA</p>}
              </div>
              <span className="text-sm text-teal-600 ml-2 shrink-0">{perfOpen ? '▴ Hide' : '▾ Details'}</span>
            </button>
            {perfOpen && (
            <div className="px-4 pb-4 space-y-5">
              {/* Fitness (CTL) — 0-100 scale, 6 equal segments, midpoint at 50 */}
              <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl font-bold text-blue-700">{latestPerf.ctl.toFixed(0)}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">/ 100</span>
                  </div>
                  <p className="text-xs text-blue-600 font-semibold"><Sparkline data={ctlSpark} color="#2563eb" />{fitnessLabel}</p>
                </div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300"><Term name="ctl" athleteId={athleteId} /> <span className="text-slate-400 font-normal">— 42-day training base</span></p>
                <p className="text-[9px] text-slate-400 mt-0.5 italic">Cardiovascular + musculoskeletal load · EPOC + MIM + DOMS + soreness</p>
                <GaugeBar
                  value={latestPerf.ctl}
                  min={0} max={100}
                  labels={['0', '17', '33', '50', '67', '83', '100']}
                  zones={['Untrained', 'Beginner', 'Recreational', 'Trained', 'Competitive', 'Elite']}
                />
              </div>

              {/* Fatigue (ATL) — flipped: 120→0, high fatigue on left */}
              <div className="bg-red-50 dark:bg-red-950 rounded-lg p-4">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl font-bold text-red-600">{latestPerf.atl.toFixed(0)}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">vs fitness {latestPerf.ctl.toFixed(0)}</span>
                  </div>
                  <p className="text-xs text-red-500 font-semibold"><Sparkline data={atlSpark} color="#ef4444" />{fatigueLabel}</p>
                </div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300"><Term name="atl" athleteId={athleteId} /> <span className="text-slate-400 font-normal">— 7-day recent load</span></p>
                <p className="text-[9px] text-slate-400 mt-0.5 italic">Includes DOMS carry-over + perceived soreness from check-in</p>
                <GaugeBar
                  value={100 - latestPerf.atl}
                  min={0} max={100}
                  labels={['100', '83', '67', '50', '33', '17', '0']}
                  zones={['Overload', 'Very High', 'High', 'Moderate', 'Balanced', 'Fresh']}
                  targetLines={[
                    { pos: 100 - latestPerf.ctl * 1.3, color: 'rgba(139,92,246,0.7)', label: '1.3×' },
                    { pos: 100 - latestPerf.ctl * 0.8, color: 'rgba(139,92,246,0.7)', label: '0.8×' },
                  ]}
                />
              </div>

              {/* Recovery Balance (TSB) — -30 to +25 */}
              <div className={`rounded-lg p-4 ${
                tsbState === 'peaked' || tsbState === 'well_rested' ? 'bg-green-50 dark:bg-green-950'
                : tsbState === 'productive' ? 'bg-slate-50 dark:bg-slate-900'
                : 'bg-amber-50 dark:bg-amber-950'
              }`}>
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className={`text-2xl font-bold ${
                      latestPerf.tsb >= 5 ? 'text-green-700'
                      : latestPerf.tsb >= -10 ? 'text-slate-700 dark:text-slate-200'
                      : 'text-amber-700'
                    }`}>{latestPerf.tsb >= 0 ? '+' : ''}{latestPerf.tsb.toFixed(0)}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">range: -30 to +25</span>
                  </div>
                  <p className={`text-xs font-semibold ${
                    latestPerf.tsb >= 5 ? 'text-green-600'
                    : latestPerf.tsb >= -10 ? 'text-slate-500 dark:text-slate-400'
                    : 'text-amber-600'
                  }`}><Sparkline data={tsbSpark} color="#059669" />{getTSBLabel(tsbState)}</p>
                </div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300"><Term name="tsb" athleteId={athleteId}>Recovery Balance</Term> <span className="text-slate-400 font-normal">— are you fresh or fatigued?</span></p>
                <p className="text-[9px] text-slate-400 mt-0.5 italic">Fitness minus Fatigue · negative = cardio + muscle fatigue exceeds base</p>
                <GaugeBar
                  value={latestPerf.tsb + 30}
                  min={0} max={55}
                  labels={['-30', '-21', '-12', '-2', '+7', '+16', '+25']}
                  zones={['Deep fatigue', 'Overreach', 'Productive', 'Balanced', 'Fresh', 'Race ready']}
                  targetLines={[
                    { pos: -30 + 30, color: 'rgba(59,130,246,0.7)', label: 'Training ▸' },
                    { pos: -10 + 30, color: 'rgba(59,130,246,0.7)', label: '◂' },
                    { pos: 5 + 30, color: 'rgba(5,150,105,0.7)', label: 'Race ▸' },
                    { pos: 25 + 30, color: 'rgba(5,150,105,0.7)', label: '◂' },
                  ]}
                />
              </div>

              {/* ACWR — 5-segment: blue, light blue, green, yellow, red */}
              <div className={`rounded-lg p-4 ${
                acwrRisk === 'sweet_spot' ? 'bg-green-50 dark:bg-green-950'
                : acwrRisk === 'high_risk' ? 'bg-red-50 dark:bg-red-950'
                : 'bg-amber-50 dark:bg-amber-950'
              }`}>
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className={`text-2xl font-bold ${
                      acwrRisk === 'sweet_spot' ? 'text-green-700'
                      : acwrRisk === 'high_risk' ? 'text-red-600'
                      : 'text-amber-600'
                    }`}>{latestPerf.acwr.toFixed(2)}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">sweet spot: 0.8–1.3</span>
                  </div>
                  <p className={`text-xs font-semibold ${
                    acwrRisk === 'sweet_spot' ? 'text-green-600'
                    : acwrRisk === 'high_risk' ? 'text-red-500'
                    : 'text-amber-600'
                  }`}><Sparkline data={acwrSpark} color="#d97706" />{getACWRLabel(acwrRisk)}</p>
                </div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300"><Term name="acwr" athleteId={athleteId}>Load Ratio</Term> <span className="text-slate-400 font-normal">— acute vs chronic workload</span></p>
                <p className="text-[9px] text-slate-400 mt-0.5 italic">How fast you're ramping · includes all load: cardio, strength, DOMS, soreness</p>
                <ACWRGaugeBar value={latestPerf.acwr} />
              </div>
            </div>
            )}
          </div>
        )
      })()}

      {/* What Changed This Week */}
      {weekNarrative.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
          <button
            onClick={() => setNarrativeOpen(!narrativeOpen)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900 transition-colors"
          >
            <p className="text-base font-semibold text-slate-700 dark:text-slate-200">What Changed This Week</p>
            <span className="text-sm text-teal-600 ml-2 shrink-0">{narrativeOpen ? '▴ Hide' : '▾ Show'}</span>
          </button>
          {narrativeOpen && (
            <div className="px-4 pb-4 space-y-1.5">
              {weekNarrative.map((line, i) => (
                <p key={i} className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{line}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 7-day training load */}
      {dailyTrimp.length > 0 && (
        <TRIMPBreakdown
          dailyTrimp={dailyTrimp}
          sorenessLoadByDate={sorenessLoadByDate}
          rpeByDate={rpeByDate}
          exerciseLoadByDate={exerciseLoadByDate}
          domsCarryByDate={domsCarryByDate}
        />
      )}

      {/* Week readiness trend */}
      {weekScores.length > 1 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
          <p className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-2">This Week's Readiness</p>
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
                  <p className="text-xs text-slate-500 dark:text-slate-400">{score.date.slice(5)}</p>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{score.displayScore}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryRiskFlags({ flags }: { flags: RiskFlag[] }) {
  const alerts = flags.filter(f => f.severity === 'alert')
  const warnings = flags.filter(f => f.severity === 'warning')
  const bgClass = alerts.length > 0
    ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900'
    : 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900'
  const icon = alerts.length > 0 ? '🚨' : '⚠️'
  const title = alerts.length > 0 ? 'Injury Risk Alert' : 'Heads up'
  return (
    <div className={`rounded-xl p-3 border ${bgClass}`}>
      <p className="text-sm font-bold text-slate-800 dark:text-white mb-2">{icon} {title}</p>
      <div className="space-y-2">
        {[...alerts, ...warnings].map(f => (
          <div key={f.id} className="bg-white/60 dark:bg-slate-900/40 rounded-lg p-2">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{f.title}</p>
              {f.metric && (
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{f.metric}</span>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug">{f.message}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
