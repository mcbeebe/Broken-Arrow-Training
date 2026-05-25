import { useState, useMemo, useEffect } from 'react'
import { useDisplayPreferences } from '../hooks/useDisplayPreferences'
import type { TrainingWeek, ReadinessScore, GarminHealthData, DailyTRIMP, PerformanceMetrics, WeeklyRecommendation, HRZone, RaceInfo } from '../types'
import type { OverallCompliance } from '../hooks/useCompliance'
import type { RiskFlag } from '../utils/readiness'
import { parsePlanZones } from '../utils/zones'
import { getMilesNumber } from '../utils/format'
import { shouldTrackVerticalGain, parseRaceElevationFt } from '../utils/raceReadiness'
import { filterByTimeWindow, type TimeWindow } from '../utils/performance'
import ReadinessBanner from './ReadinessBanner'
import TRIMPBreakdown from './TRIMPBreakdown'
import PerformanceChart from './PerformanceChart'
import ComplianceWeekRow from './ComplianceWeekRow'
import CalendarHeatmap from './CalendarHeatmap'
import StrengthProgressSection from './StrengthProgressSection'
import DescentCapacitySection from './DescentCapacitySection'
import VolumeChart from './VolumeChart'

type DashSubTab = 'compliance' | 'readiness' | 'performance'

interface DashboardProps {
  weeks: TrainingWeek[]
  compliance: OverallCompliance
  raceDate: string
  race?: RaceInfo
  // Garmin/Readiness data (optional — renders only when available)
  todayScore?: ReadinessScore | null
  weekScores?: ReadinessScore[]
  todayHealth?: GarminHealthData
  healthHistory?: GarminHealthData[]
  dailyTrimp?: DailyTRIMP[]
  performance?: PerformanceMetrics[]
  weeklyRecommendations?: WeeklyRecommendation[]
  riskFlags?: RiskFlag[]
  garminConnected?: boolean
  sorenessLoadByDate?: Map<string, number>
  planZones?: HRZone[]
  athleteMaxHR?: number
  athleteId?: string
}

export default function Dashboard({
  weeks,
  compliance,
  raceDate,
  race,
  todayScore,
  weekScores = [],
  todayHealth,
  healthHistory = [],
  dailyTrimp = [],
  performance = [],
  weeklyRecommendations = [],
  riskFlags = [],
  garminConnected = false,
  sorenessLoadByDate,
  planZones = [],
  athleteMaxHR,
  athleteId,
}: DashboardProps) {
  const [subTab, setSubTab] = useState<DashSubTab>('compliance')
  const [volumeActiveWeek, setVolumeActiveWeek] = useState(0)
  const { isSectionVisible, flags } = useDisplayPreferences(athleteId)
  // Newcomers (high verbosity) get the "what does this answer?" explainers
  // open by default; everyone else keeps them collapsed.
  const glossaryDefaultOpen = flags.explanationVerbosity === 'high'
  const parsedPlanZones = parsePlanZones(planZones, athleteMaxHR)
  const showVertical = shouldTrackVerticalGain(race)

  const SUB_TABS: { id: DashSubTab; label: string; available: boolean }[] = [
    { id: 'compliance', label: 'Compliance', available: true },
    { id: 'readiness', label: 'Readiness', available: garminConnected && isSectionVisible('dash.tabReadiness') },
    { id: 'performance', label: 'Performance', available: (garminConnected || dailyTrimp.length > 0) && isSectionVisible('dash.tabPerformance') },
  ]
  const visibleSubTabs = SUB_TABS.filter(t => t.available)

  // If the active sub-tab gets hidden (decluttered), fall back to the first
  // visible one — compliance is never hideable, so this can't go empty.
  const visibleIds = visibleSubTabs.map(t => t.id).join(',')
  useEffect(() => {
    if (!visibleSubTabs.some(t => t.id === subTab)) {
      setSubTab(visibleSubTabs[0]?.id ?? 'compliance')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds, subTab])

  return (
    <div className="px-4 py-4 space-y-4">
      <h2 className="text-xl font-bold text-slate-800 dark:text-white">Dashboard</h2>

      {compliance.weeks.length > 0 && isSectionVisible('dash.descentCapacity') && (
        <DescentCapacitySection
          weeks={compliance.weeks}
          race={race}
        />
      )}

      {isSectionVisible('dash.volume') && (
        <VolumeChart
          weeks={weeks}
          activeWeek={volumeActiveWeek}
          onWeekClick={setVolumeActiveWeek}
          compliance={compliance.weeks}
          showVertical={showVertical}
          athleteId={athleteId}
        />
      )}

      {/* Sub-tab navigation */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
        {visibleSubTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              subTab === t.id
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {subTab === 'compliance' && (
        <ComplianceTab
          weeks={weeks}
          compliance={compliance}
          planZones={parsedPlanZones}
          showVertical={showVertical}
          race={race}
        />
      )}
      {subTab === 'readiness' && (
        <ReadinessTab
          todayScore={todayScore}
          weekScores={weekScores}
          todayHealth={todayHealth}
          healthHistory={healthHistory}
          dailyTrimp={dailyTrimp}
          riskFlags={riskFlags}
          glossaryDefaultOpen={glossaryDefaultOpen}
        />
      )}
      {subTab === 'performance' && (
        <>
          <PerformanceTab
            dailyTrimp={dailyTrimp}
            performance={performance}
            recommendations={weeklyRecommendations}
            riskFlags={riskFlags}
            raceDate={raceDate}
            sorenessLoadByDate={sorenessLoadByDate}
            athleteId={athleteId}
          />
          {isSectionVisible('dash.strengthProgress') && <StrengthProgressSection weeks={weeks} />}
        </>
      )}
    </div>
  )
}

// ─── Compliance Sub-Tab ────────────────────────────────────────

function ComplianceTab({
  weeks,
  compliance,
  planZones,
  showVertical,
  race,
}: {
  weeks: TrainingWeek[]
  compliance: OverallCompliance
  planZones: ReturnType<typeof parsePlanZones>
  showVertical: boolean
  race?: RaceInfo
}) {
  // Only show past/current weeks in the weekly breakdown (up to current week #).
  // Future weeks have nothing to grade yet.
  const vertPct = showVertical && compliance.totalPlannedElevation > 0
    ? Math.round((compliance.totalActualElevation / compliance.totalPlannedElevation) * 100)
    : null
  const raceElevationFt = parseRaceElevationFt(race)
  const racePerMi = race && race.distanceMiles > 0 ? Math.round(raceElevationFt / race.distanceMiles) : 0
  return (
    <div className="space-y-4">
      {/* Summary cards — now includes Distance & Duration compliance */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Completion"
          value={`${compliance.completionRate}%`}
          sub={`${compliance.totalCompleted} / ${compliance.totalCompleted + compliance.totalMissed} workouts`}
          color="teal"
        />
        <StatCard
          label="Distance"
          value={`${compliance.overallDistanceCompliance}%`}
          sub={`${compliance.totalActualMiles} / ${compliance.totalPlannedMiles} mi`}
          color="blue"
        />
        <StatCard
          label="HR in Zone"
          value={`${compliance.overallHRCompliance}%`}
          sub={
            compliance.totalFlagged > 0
              ? `${compliance.totalFlagged} flagged`
              : 'on target'
          }
          color="rose"
        />
        <StatCard
          label="Duration"
          value={`${compliance.overallDurationCompliance}%`}
          sub="of planned time"
          color="amber"
        />
        {showVertical && (
          <StatCard
            label="Vertical"
            value={
              vertPct !== null
                ? `${vertPct}%`
                : `${formatFt(compliance.totalActualElevation)} ft`
            }
            sub={
              compliance.totalPlannedElevation > 0
                ? `${formatFt(compliance.totalActualElevation)} / ${formatFt(compliance.totalPlannedElevation)} ft climbed`
                : `${formatFt(compliance.totalActualElevation)} ft climbed${racePerMi ? ` · race ${racePerMi} ft/mi` : ''}`
            }
            color="indigo"
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-2">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" /> On target
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> Close
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> Missed
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-400 inline-block" /> Over
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 inline-block" /> Skipped
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-slate-100 dark:bg-slate-700 inline-block" /> No target
        </span>
      </div>

      {/* Weekly compliance breakdown */}
      <div>
        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-2">Weekly Breakdown</h3>
        <div className="space-y-2">
          {compliance.weeks.map((wk, i) => (
            <ComplianceWeekRow
              key={wk.weekNum}
              week={wk}
              weekLabel={weeks[i]?.dates}
              weekFocus={weeks[i]?.focus}
              planZones={planZones}
              showVertical={showVertical}
            />
          ))}
        </div>
      </div>

      {/* Planned vs Actual volume chart (kept — still useful high-level view) */}
      <div>
        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-2">Planned vs Actual Mileage</h3>
        <div className="flex items-end gap-1 h-32">
          {weeks.map((w, i) => {
            const planned = getMilesNumber(w.miles)
            const actual = compliance.weeks[i]?.actualMiles ?? 0
            const max = Math.max(...weeks.map(wk => getMilesNumber(wk.miles)), 1)
            const pPct = (planned / max) * 100
            const aPct = (actual / max) * 100
            return (
              <div key={w.num} className="flex-1 flex flex-col items-center gap-0.5">
                <span className="text-[10px] text-slate-500 dark:text-slate-400">{actual > 0 ? actual : ''}</span>
                <div className="w-full flex gap-px" style={{ height: `${Math.max(pPct, aPct)}%`, minHeight: 4 }}>
                  <div
                    className="flex-1 rounded-t bg-slate-300"
                    style={{ height: `${pPct}%` }}
                  />
                  {actual > 0 && (
                    <div
                      className="flex-1 rounded-t bg-teal-500"
                      style={{ height: `${aPct}%` }}
                    />
                  )}
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">{w.num}</span>
              </div>
            )
          })}
        </div>
        <div className="flex justify-center gap-4 mt-2 text-sm text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 inline-block" /> Planned
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-teal-500 inline-block" /> Actual
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Readiness Sub-Tab ──────────────────────────────────────────

function ReadinessTab({
  todayScore,
  weekScores,
  todayHealth,
  healthHistory,
  dailyTrimp,
  riskFlags,
  glossaryDefaultOpen = false,
}: {
  todayScore?: ReadinessScore | null
  weekScores: ReadinessScore[]
  todayHealth?: GarminHealthData
  healthHistory: GarminHealthData[]
  dailyTrimp: DailyTRIMP[]
  riskFlags: RiskFlag[]
  glossaryDefaultOpen?: boolean
}) {
  return (
    <div className="space-y-4">
      {todayScore && (
        <ReadinessBanner
          todayScore={todayScore}
          todayHealth={todayHealth}
          healthHistory={healthHistory}
        />
      )}

      <RiskFlagsCard flags={riskFlags} showAllClear />

      <CalendarHeatmap dailyTrimp={dailyTrimp} readinessScores={weekScores} />

      {/* 7-day readiness trend */}
      {weekScores.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
          <p className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-3">7-Day Readiness Trend</p>
          <div className="flex items-end gap-1.5 h-24">
            {weekScores.map((s, i) => {
              const barPx = Math.max(Math.round((s.displayScore / 100) * 64), 2)
              const bg =
                s.status === 'PEAK' ? 'bg-indigo-500' :
                s.status === 'GREEN' ? 'bg-green-500' :
                s.status === 'YELLOW' ? 'bg-amber-400' :
                'bg-red-500'
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">{s.displayScore}</span>
                  <div
                    className={`w-full rounded-t ${bg} transition-all`}
                    style={{ height: `${barPx}px` }}
                  />
                  <span className="text-xs text-slate-500 dark:text-slate-400">{s.date.slice(5)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Calibration notice */}
      {todayScore && weekScores.length < 7 && weekScores.length > 0 && (
        <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
          <p className="text-sm text-blue-700">
            <strong>Calibrating:</strong> {weekScores.length}/7 days of data. Scores will become more personalized as your baseline builds. Full calibration at 7+ days.
          </p>
        </div>
      )}

      {!todayScore && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 text-center">
          <p className="text-base text-slate-500 dark:text-slate-400">Connect Garmin and sync to see readiness data</p>
        </div>
      )}

      {/* Glossary */}
      <ReadinessGlossary defaultOpen={glossaryDefaultOpen} />
    </div>
  )
}

// ─── Readiness Glossary ────────────────────────────────────────

function ReadinessGlossary({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-100 dark:bg-slate-700 transition-colors"
      >
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">What does this tab answer?</p>
        <span className="text-sm text-teal-600 ml-2 shrink-0">{open ? '▴ Hide' : '▾ Show'}</span>
      </button>
      {open && (
      <div className="px-4 pb-4 space-y-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-200">
          <p className="font-semibold text-blue-800">Why this is different from the Performance tab</p>
          <p className="text-blue-700 mt-1">
            <strong>Readiness</strong> answers <em>"How recovered is my body right now?"</em> — based on this morning's biometrics (sleep, HRV, resting heart rate).
            <strong> Performance</strong> answers <em>"How does my fatigue debt compare to my fitness base?"</em> — based on weeks of training math.
            They can disagree, and that's fine — read both before changing your plan.
          </p>
        </div>

        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">What's the 0–100 score?</p>
          <p>A single number combining four signals from your watch: heart-rate variability, resting heart rate, sleep, and training load. Higher is better; under 50 means take it easy.</p>
        </div>

        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">How recovered is my nervous system today? <span className="text-slate-400 text-xs font-normal">(heart-rate variability · 40% of the score)</span></p>
          <p>The most responsive recovery signal — when HRV drops vs. your personal baseline, your body is still processing yesterday's stress. A noisy week (sick, traveling) can flatten the score; we cap it then so noise doesn't overweight.</p>
        </div>

        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">Is my engine idling higher than normal? <span className="text-slate-400 text-xs font-normal">(resting heart rate · 20%)</span></p>
          <p>An elevated resting HR is a slow-moving fatigue signal. Could be training stress, dehydration, alcohol, illness, or stress. Trends matter more than single mornings.</p>
        </div>

        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">Did I sleep enough? <span className="text-slate-400 text-xs font-normal">(sleep duration · 20%)</span></p>
          <p>8.5h+ counts as excellent, 7h+ good, 6h+ normal, under 6h drops you to "low." A night under 6h also forces YELLOW regardless of the other signals — no amount of fitness offsets sleep debt.</p>
        </div>

        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">Am I ramping safely? <span className="text-slate-400 text-xs font-normal">(load ratio · 20%)</span></p>
          <p>Last 7 days of training stress vs. last 28 days. 0.8–1.3 is the sweet spot; above 1.5 elevates injury risk and forces YELLOW. Different from the Performance tab's Load Ratio — same idea, slightly different math window.</p>
        </div>

        <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
          <p className="font-semibold text-slate-700 dark:text-slate-200">What does each color mean?</p>
          <p>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-500 mr-1 align-middle" />
            <strong>PEAK:</strong> top-tier recovery. Hit your hardest session of the week. Max 1 per week.
          </p>
          <p>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 mr-1 align-middle" />
            <strong>GREEN:</strong> execute the planned workout as written.
          </p>
          <p>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 mr-1 align-middle" />
            <strong>YELLOW:</strong> dial back intensity. Stay easy. The adjustment chip tells you exactly what to change.
          </p>
          <p>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 mr-1 align-middle" />
            <strong>RED:</strong> swap to an easy walk or take the day off. Body needs rest.
          </p>
        </div>

        <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
          <p className="font-semibold text-slate-700 dark:text-slate-200">What are training states?</p>
          <p>A higher-level read across multiple days — useful when a single day's color doesn't tell the whole story.</p>
          <ul className="mt-1 ml-3 space-y-0.5 list-disc">
            <li><strong>Well recovered (A):</strong> train as planned.</li>
            <li><strong>Not fully recovered (B):</strong> keep the volume, drop the intensity 10–15%.</li>
            <li><strong>Overreaching (C):</strong> two to three easy days. Walking, yoga, mobility.</li>
            <li><strong>Overtrained (D):</strong> five consecutive RED days or a falling 7-day HRV trend. Triggers a built-in deload.</li>
          </ul>
        </div>

        <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
          <p className="font-semibold text-slate-700 dark:text-slate-200">What are guardrails?</p>
          <p>Automatic overrides — applied <em>after</em> scoring so a single dangerous signal can't be averaged away by good news elsewhere. Shown as italic notes on the day when triggered.</p>
          <ul className="mt-1 ml-3 space-y-0.5 list-disc">
            <li>Load ratio above 1.5 forces YELLOW; above 1.3 caps at GREEN.</li>
            <li>Body battery under 25 forces YELLOW.</li>
            <li>Sleep under 6h forces YELLOW.</li>
            <li>HRV drop &gt;25% vs 7-day baseline forces RED.</li>
            <li>Max 2 GREEN/PEAK days in a row before a forced YELLOW; max 2 RED before YELLOW is allowed back.</li>
            <li>Max 1 PEAK per 7 days.</li>
          </ul>
        </div>
      </div>
      )}
    </div>
  )
}

// ─── Performance Sub-Tab ────────────────────────────────────────

function PerformanceTab({
  dailyTrimp,
  performance,
  recommendations,
  riskFlags,
  raceDate,
  sorenessLoadByDate,
  athleteId,
}: {
  dailyTrimp: DailyTRIMP[]
  performance: PerformanceMetrics[]
  recommendations: WeeklyRecommendation[]
  riskFlags: RiskFlag[]
  raceDate: string
  sorenessLoadByDate?: Map<string, number>
  athleteId?: string
}) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('all')
  const { isSectionVisible, flags } = useDisplayPreferences(athleteId)
  const filteredPerformance = useMemo(() => filterByTimeWindow(performance, timeWindow), [performance, timeWindow])
  return (
    <div className="space-y-4">
      <RiskFlagsCard flags={riskFlags} />
      <TimeWindowToggle value={timeWindow} onChange={setTimeWindow} />
      {isSectionVisible('dash.performanceChart') && (
        <PerformanceChart
          performance={filteredPerformance}
          recommendations={recommendations}
          raceDate={raceDate}
          dailyTrimp={dailyTrimp}
          athleteId={athleteId}
        />
      )}
      {isSectionVisible('dash.trimpBreakdown') && (
        <TRIMPBreakdown
          dailyTrimp={dailyTrimp}
          sorenessLoadByDate={sorenessLoadByDate}
          range={timeWindow}
          performance={performance}
          athleteId={athleteId}
        />
      )}
      <PerformanceGlossary defaultOpen={flags.explanationVerbosity === 'high'} />
    </div>
  )
}

// ─── Time Window Toggle ─────────────────────────────────────────

function TimeWindowToggle({ value, onChange }: { value: TimeWindow; onChange: (w: TimeWindow) => void }) {
  const options: { id: TimeWindow; label: string }[] = [
    { id: '7d', label: '7d' },
    { id: '30d', label: '30d' },
    { id: '90d', label: '90d' },
    { id: 'all', label: 'All' },
  ]
  return (
    <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
      {options.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
            value === o.id
              ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── Risk Flags Card ────────────────────────────────────────────

function RiskFlagsCard({ flags, showAllClear = false }: { flags: RiskFlag[]; showAllClear?: boolean }) {
  if (flags.length === 0) {
    if (!showAllClear) return null
    return (
      <div className="rounded-xl p-3 border bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900">
        <p className="text-sm font-semibold text-green-800 dark:text-green-300">✓ No injury risk flags</p>
        <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
          HRV trend, load ratio, and recovery markers all within safe ranges. Monitoring continues daily.
        </p>
      </div>
    )
  }
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

// ─── Performance Glossary ──────────────────────────────────────

function PerformanceGlossary({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-100 dark:bg-slate-700 transition-colors"
      >
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">What does this tab answer?</p>
        <span className="text-sm text-teal-600 ml-2 shrink-0">{open ? '▴ Hide' : '▾ Show'}</span>
      </button>
      {open && (
      <div className="px-4 pb-4 space-y-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-200">
          <p className="font-semibold text-blue-800">Why this is different from the Readiness tab</p>
          <p className="text-blue-700 mt-1">
            <strong>Performance</strong> is pure training math — fitness and fatigue accumulating over weeks. It doesn't look at your watch this morning.
            <strong> Readiness</strong> is the opposite — today's biometrics, no math memory.
            They can disagree, and that's fine. Recovery Balance can read "danger zone" while Readiness is GREEN — it just means your fatigue debt is high but your body is handling the day. Read both before changing your plan.
          </p>
        </div>

        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">Am I getting fitter? <span className="text-slate-400 text-xs font-normal">(Fitness, a.k.a. CTL)</span></p>
          <p>A rolling 42-day average of your training load. Slow to build, slow to lose — your fitness "bank account." If this is rising, you're getting fitter. If it's flat, you're maintaining. If it's dropping, you're losing fitness.</p>
        </div>

        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">Am I tired? <span className="text-slate-400 text-xs font-normal">(Fatigue, a.k.a. ATL)</span></p>
          <p>A rolling 7-day average of your training load. Fast to build, fast to fade — a hard week spikes it, a rest day drops it. When Fatigue is well above Fitness, you're piling up stress faster than your base can absorb.</p>
        </div>

        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">Am I fresh or fatigued? <span className="text-slate-400 text-xs font-normal">(Recovery Balance, a.k.a. TSB)</span></p>
          <p>Fitness minus Fatigue. Positive = fresher than your fitness level (ideal for racing). Deeply negative = fatigue has outrun your base. Common to see negative numbers early in a plan when fitness hasn't caught up yet — not a problem unless biometrics agree.</p>
          <ul className="mt-1 ml-3 space-y-0.5 list-disc">
            <li><strong>+15 to +25:</strong> peak form — race ready.</li>
            <li><strong>+5 to +14:</strong> fresh — good for quality sessions.</li>
            <li><strong>−10 to +4:</strong> productive training — building fitness.</li>
            <li><strong>−30 to −11:</strong> tired — normal in build weeks.</li>
            <li><strong>Below −30:</strong> overreaching. Cross-check the Readiness tab before changing the plan.</li>
          </ul>
        </div>

        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">Am I ramping safely? <span className="text-slate-400 text-xs font-normal">(Load Ratio, a.k.a. ACWR)</span></p>
          <p>Last 7 days vs. last 42 days of training stress. Tells you whether this week is a normal load relative to your base or a spike.</p>
          <ul className="mt-1 ml-3 space-y-0.5 list-disc">
            <li><strong>0.8–1.3:</strong> sweet spot.</li>
            <li><strong>1.3–1.5:</strong> caution — injury risk climbing.</li>
            <li><strong>Above 1.5:</strong> high risk — ramped too fast, back off.</li>
            <li><strong>Below 0.8:</strong> detraining — load fell below your base.</li>
          </ul>
        </div>

        <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
          <p className="font-semibold text-slate-700 dark:text-slate-200">Where do the load numbers come from?</p>
          <p>From your watch first (Garmin's on-device EPOC, the most accurate per-session estimate). If a session has no Garmin file — Strava-only, or no HR — we fall back to a published heart-rate-based formula (Banister TRIMP). Each session uses one source, never both. After that, every session is multiplied by a sport-specific weighting (climbing runs count for more than easy bike rides) plus a small bonus for vertical gain.</p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">The per-sport multipliers live in <strong>Settings → Training Load Multipliers (MIM)</strong> — you can see all 19 sports there and override any value.</p>
        </div>

        <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
          <p className="font-semibold text-slate-700 dark:text-slate-200">Why a "load ramp" model at all?</p>
          <p>The math here (impulse-response, Banister et al. 1975) has been the workhorse of sport science for fifty years. The core idea: every workout produces both a slow-to-build fitness gain (~6-week time constant) and a fast-to-fade fatigue cost (~1-week time constant). Tapering before a race lets the fatigue drop while the fitness sticks — that's where peak performance comes from.</p>
        </div>
      </div>
      )}
    </div>
  )
}

// ─── Shared StatCard ────────────────────────────────────────────

function formatFt(ft: number): string {
  if (ft >= 1000) {
    const k = ft / 1000
    return `${k % 1 === 0 ? k : k.toFixed(1)}k`
  }
  return `${Math.round(ft)}`
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    teal: 'bg-teal-50 border-teal-200 text-teal-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    rose: 'bg-rose-50 border-rose-200 text-rose-800',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-800',
  }
  const classes = colorMap[color] || colorMap.teal

  return (
    <div className={`rounded-xl p-3 border ${classes}`}>
      <p className="text-sm opacity-75">{label}</p>
      <p className="text-2xl font-bold mt-0.5">{value}</p>
      <p className="text-sm opacity-60 mt-0.5">{sub}</p>
    </div>
  )
}
