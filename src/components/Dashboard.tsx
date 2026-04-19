import { useState, useMemo } from 'react'
import type { TrainingWeek, ReadinessScore, GarminHealthData, DailyTRIMP, PerformanceMetrics, WeeklyRecommendation, HRZone } from '../types'
import type { OverallCompliance } from '../hooks/useCompliance'
import type { RiskFlag } from '../utils/readiness'
import { parsePlanZones } from '../utils/zones'
import { getMilesNumber } from '../utils/format'
import { filterByTimeWindow, type TimeWindow } from '../utils/performance'
import ReadinessBanner from './ReadinessBanner'
import TRIMPBreakdown from './TRIMPBreakdown'
import PerformanceChart from './PerformanceChart'
import ComplianceWeekRow from './ComplianceWeekRow'
import CalendarHeatmap from './CalendarHeatmap'

type DashSubTab = 'compliance' | 'readiness' | 'performance'

interface DashboardProps {
  weeks: TrainingWeek[]
  compliance: OverallCompliance
  raceDate: string
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
}

export default function Dashboard({
  weeks,
  compliance,
  raceDate,
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
}: DashboardProps) {
  const [subTab, setSubTab] = useState<DashSubTab>('compliance')
  const parsedPlanZones = parsePlanZones(planZones, athleteMaxHR)


  const SUB_TABS: { id: DashSubTab; label: string; available: boolean }[] = [
    { id: 'compliance', label: 'Compliance', available: true },
    { id: 'readiness', label: 'Readiness', available: garminConnected },
    { id: 'performance', label: 'Performance', available: garminConnected || dailyTrimp.length > 0 },
  ]

  return (
    <div className="px-4 py-4 space-y-4">
      <h2 className="text-xl font-bold text-slate-800 dark:text-white">Dashboard</h2>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
        {SUB_TABS.filter(t => t.available).map(t => (
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
        <ComplianceTab weeks={weeks} compliance={compliance} planZones={parsedPlanZones} />
      )}
      {subTab === 'readiness' && (
        <ReadinessTab
          todayScore={todayScore}
          weekScores={weekScores}
          todayHealth={todayHealth}
          healthHistory={healthHistory}
          dailyTrimp={dailyTrimp}
          riskFlags={riskFlags}
        />
      )}
      {subTab === 'performance' && (
        <PerformanceTab
          dailyTrimp={dailyTrimp}
          performance={performance}
          recommendations={weeklyRecommendations}
          riskFlags={riskFlags}
          raceDate={raceDate}
          sorenessLoadByDate={sorenessLoadByDate}
        />
      )}
    </div>
  )
}

// ─── Compliance Sub-Tab ────────────────────────────────────────

function ComplianceTab({ weeks, compliance, planZones }: { weeks: TrainingWeek[]; compliance: OverallCompliance; planZones: ReturnType<typeof parsePlanZones> }) {
  // Only show past/current weeks in the weekly breakdown (up to current week #).
  // Future weeks have nothing to grade yet.
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
}: {
  todayScore?: ReadinessScore | null
  weekScores: ReadinessScore[]
  todayHealth?: GarminHealthData
  healthHistory: GarminHealthData[]
  dailyTrimp: DailyTRIMP[]
  riskFlags: RiskFlag[]
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
      <ReadinessGlossary />
    </div>
  )
}

// ─── Readiness Glossary ────────────────────────────────────────

function ReadinessGlossary() {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-100 dark:bg-slate-700 transition-colors"
      >
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Understanding Your Readiness</p>
        <span className="text-sm text-teal-600 ml-2 shrink-0">{open ? '▴ Hide' : '▾ Show'}</span>
      </button>
      {open && (
      <div className="px-4 pb-4 space-y-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-200">
          <p className="font-semibold text-blue-800">Readiness vs Performance — Two Different Questions</p>
          <p className="text-blue-700 mt-1">
            <strong>Readiness</strong> answers: <em>"How recovered is my body right now?"</em> — based on today's biometrics (HRV, RHR, sleep) plus training load ratio.
            <strong> Performance</strong> answers: <em>"How does my accumulated fatigue compare to my fitness base?"</em> — based purely on training stress math (Banister model).
            These systems are independent and can disagree. You can feel recovered (GREEN readiness) while carrying a large fatigue debt (negative Recovery Balance). Both are valid — check both.
          </p>
        </div>
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">Readiness Score (0–100)</p>
          <p>A composite biometric score from the ATE (Adaptive Training Engine). Internally scored on a -2.0 to +2.0 scale, then mapped to 0–100 for display. Combines four inputs from your Garmin watch, each weighted by its predictive importance for recovery.</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">HRV — Recovery Composite (40% weight)</p>
          <p>A three-part recovery signal based on Firstbeat white paper WP-G1. Combines: (1) ln(RMSSD) z-score vs your rolling baseline (50%), (2) RHR deviation z-score (25%), and (3) Garmin HRV Status string — poor/low/balanced/good (25%). If your HRV coefficient of variation exceeds 10%, the score is capped to account for measurement noise.</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">RHR — Resting Heart Rate (20% weight)</p>
          <p>Deviation from your personal baseline. Scored in buckets: 5+ bpm below baseline = Excellent (+2), 2-5 below = Good (+1), within +5 = Normal (0), above +5 = Low (-1). An elevated RHR can signal fatigue, stress, dehydration, or illness.</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">Sleep (20% weight)</p>
          <p>Hours-based scoring aligned with sleep science consensus. Scored in buckets: 8.5+ hrs = Excellent (+2), 7+ hrs = Good (+1), 6+ hrs = Normal (0), under 6 hrs = Low (-1). Sleep under 6 hours also triggers an acute guardrail that forces Readiness to YELLOW regardless of other metrics.</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">Training Load — ACWR (20% weight)</p>
          <p>Based on your Acute:Chronic Workload Ratio (Gabbett 2016). Uses a 7-day / 28-day span-based EWMA of your daily training load. Scored by zone: undertraining (&lt;0.8) = Good (+1), sweet spot (0.8–1.3) = Normal (0), caution (1.3–1.5) = Below (-0.5), danger (&gt;1.5) = Low (-1). This is fundamentally different from the Performance tab's Recovery Balance/TSB — ACWR measures your recent ramp rate, while TSB measures your net fatigue balance.</p>
        </div>
        <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
          <p className="font-semibold text-slate-700 dark:text-slate-200">Traffic Light Signals</p>
          <p>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-500 mr-1 align-middle" />
            <strong>PEAK:</strong> Top-tier recovery. Ideal for VO2max intervals, race-pace work, or time trials. Max 1 per 7 days (guardrail).
          </p>
          <p>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 mr-1 align-middle" />
            <strong>GREEN:</strong> Execute your planned workout as written.
          </p>
          <p>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 mr-1 align-middle" />
            <strong>YELLOW:</strong> Reduce intensity or volume. Stay in Zone 1-2. Specific adjustments are shown.
          </p>
          <p>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 mr-1 align-middle" />
            <strong>RED:</strong> Swap for an easy walk or full rest day. Your body needs recovery.
          </p>
        </div>
        <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
          <p className="font-semibold text-slate-700 dark:text-slate-200">Training States (Firstbeat WP-G2)</p>
          <p>Alongside the traffic light, the engine classifies your overall training state:</p>
          <ul className="mt-1 ml-3 space-y-0.5 list-disc">
            <li><strong>State A — Well Recovered:</strong> Composite above baseline. Train as planned.</li>
            <li><strong>State B — Not Fully Recovered:</strong> Maintain volume, reduce intensity 10-15%.</li>
            <li><strong>State C — Overreaching:</strong> 48-72h easy block. Walk, yoga, or mobility only.</li>
            <li><strong>State D — Overtrained:</strong> 5+ consecutive RED days or declining 7-day HRV. Triggers deload protocol and medical flag.</li>
          </ul>
        </div>
        <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
          <p className="font-semibold text-slate-700 dark:text-slate-200">Guardrails</p>
          <p>Automatic safety checks applied after scoring. Shown as italic notes when triggered:</p>
          <ul className="mt-1 ml-3 space-y-0.5 list-disc">
            <li><strong>ACWR cap:</strong> ACWR &gt;1.5 forces YELLOW; &gt;1.3 caps at GREEN</li>
            <li><strong>Body Battery gate:</strong> Garmin Body Battery &lt;25 forces YELLOW</li>
            <li><strong>Acute sleep:</strong> Sleep &lt;6h forces YELLOW</li>
            <li><strong>RMSSD drop:</strong> HRV drops &gt;25% vs 7-day mean forces RED</li>
            <li><strong>Consecutive limits:</strong> Max 2 consecutive GREEN/PEAK before forced YELLOW; max 2 consecutive RED before allowed YELLOW</li>
            <li><strong>PEAK limit:</strong> Max 1 PEAK signal per 7 days</li>
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
}: {
  dailyTrimp: DailyTRIMP[]
  performance: PerformanceMetrics[]
  recommendations: WeeklyRecommendation[]
  riskFlags: RiskFlag[]
  raceDate: string
  sorenessLoadByDate?: Map<string, number>
}) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('all')
  const filteredPerformance = useMemo(() => filterByTimeWindow(performance, timeWindow), [performance, timeWindow])
  const filteredTrimp = useMemo(() => filterByTimeWindow(dailyTrimp, timeWindow), [dailyTrimp, timeWindow])
  return (
    <div className="space-y-4">
      <RiskFlagsCard flags={riskFlags} />
      <TimeWindowToggle value={timeWindow} onChange={setTimeWindow} />
      <PerformanceChart
        performance={filteredPerformance}
        recommendations={recommendations}
        raceDate={raceDate}
        dailyTrimp={filteredTrimp}
      />
      <TRIMPBreakdown dailyTrimp={filteredTrimp} sorenessLoadByDate={sorenessLoadByDate} />
      <PerformanceGlossary />
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

function PerformanceGlossary() {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-100 dark:bg-slate-700 transition-colors"
      >
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Understanding Your Performance Metrics</p>
        <span className="text-sm text-teal-600 ml-2 shrink-0">{open ? '▴ Hide' : '▾ Show'}</span>
      </button>
      {open && (
      <div className="px-4 pb-4 space-y-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-200">
          <p className="font-semibold text-blue-800">Performance vs Readiness — Different Models, Same Load Data</p>
          <p className="text-blue-700 mt-1">
            The Performance tab uses the <strong>Banister impulse-response model</strong> (CTL/ATL/TSB) — a purely mathematical model of fitness vs fatigue accumulation over time. It does <em>not</em> look at your biometrics.
            The Readiness tab uses the <strong>ATE engine</strong> — a biometric-first model using HRV, RHR, sleep, and ACWR.
            Both consume the same daily training load (Garmin EPOC or Banister TRIMP), but they answer different questions.
            It's normal for Recovery Balance to show "Danger Zone" while Readiness shows GREEN — that means your fatigue debt is high but your body is recovering well day-to-day. Respect both signals.
          </p>
        </div>
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">Training Load Source</p>
          <p><strong>Primary:</strong> Garmin's on-device EPOC (activityTrainingLoad) — calculated by Firstbeat from beat-by-beat R-R intervals on your watch. This is the most accurate per-activity load estimate available, capturing both aerobic and anaerobic cost.</p>
          <p className="mt-1"><strong>Fallback:</strong> Banister TRIMP formula — used when Garmin EPOC is unavailable (e.g., Strava-only activities or activities without HR). Formula: duration × fHR × 0.64 × e^(1.92 × fHR), where fHR = (avgHR - restHR) / (maxHR - restHR).</p>
          <p className="mt-1">Each activity uses one source — never both. The load is then adjusted by a sport-specific MIM (Musculoskeletal Impact Modifier) multiplier plus an elevation bonus.</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">Fitness (CTL) — Chronic Training Load</p>
          <p>A 42-day exponentially weighted rolling average of your daily adjusted training load. It represents your accumulated fitness over roughly the past 6 weeks. CTL rises slowly with consistent training and decays slowly during rest. Think of it as your "fitness bank account" — it takes weeks to build and weeks to lose.</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">Fatigue (ATL) — Acute Training Load</p>
          <p>A 7-day exponentially weighted rolling average of your daily adjusted training load. It captures the fatigue from your most recent training. ATL responds quickly — a hard workout spikes it, and a rest day drops it. When ATL is much higher than CTL, you're accumulating fatigue faster than fitness.</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">Recovery Balance (TSB) — Are You Fresh or Fatigued?</p>
          <p>The difference between Fitness and Fatigue (CTL minus ATL). A positive TSB means you're fresher than your fitness level — ideal for racing. A deeply negative TSB means fatigue has outpaced your fitness base — normal in early build weeks when CTL hasn't had time to accumulate. For race day, the target is TSB between +15 and +25 ("peak form").</p>
          <ul className="mt-1 ml-3 space-y-0.5 list-disc">
            <li><strong>+15 to +25:</strong> Peak form — race ready</li>
            <li><strong>+5 to +14:</strong> Fresh — good for quality sessions</li>
            <li><strong>-10 to +4:</strong> Productive training — building fitness</li>
            <li><strong>-30 to -11:</strong> Tired — accumulating fatigue, normal in build weeks</li>
            <li><strong>Below -30:</strong> Overreaching — fatigue greatly exceeds fitness base. Common early in a plan when CTL is still building. Check Readiness tab for biometric confirmation before changing your plan.</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">ACWR — Acute:Chronic Workload Ratio (Performance tab)</p>
          <p>The ratio of your recent training load (ATL) to your long-term fitness (CTL). Uses tau-based EWMA (7d/42d). This is displayed on the Performance tab for trend visualization. Note: the Readiness tab uses a separate span-based ACWR (7d/28d) for its load scoring component — same concept, different math.</p>
          <ul className="mt-1 ml-3 space-y-0.5 list-disc">
            <li><strong>0.8–1.3:</strong> Sweet spot — safe and productive</li>
            <li><strong>1.3–1.5:</strong> Caution — elevated injury risk</li>
            <li><strong>Above 1.5:</strong> High risk — you've ramped up too fast</li>
            <li><strong>Below 0.8:</strong> Detraining — you may be doing too little</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">MIM — Musculoskeletal Impact Modifiers</p>
          <p>Different activities stress the body differently. Each sport type applies a validated multiplier (from the ATE engine) to the base training load:</p>
          <div className="mt-1.5 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-700">
                  <th className="text-left px-2 py-1 font-semibold text-slate-700 dark:text-slate-200">Sport</th>
                  <th className="text-right px-2 py-1 font-semibold text-slate-700 dark:text-slate-200">MIM</th>
                  <th className="text-left px-2 py-1 font-semibold text-slate-700 dark:text-slate-200">Why</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="bg-white dark:bg-slate-800"><td className="px-2 py-1">Strength (Lower)</td><td className="text-right px-2 py-1 font-mono">1.50×</td><td className="px-2 py-1 text-slate-500 dark:text-slate-400">Heavy eccentric load, high neural fatigue</td></tr>
                <tr className="bg-slate-50 dark:bg-slate-900"><td className="px-2 py-1">HIIT / Cardio</td><td className="text-right px-2 py-1 font-mono">1.30×</td><td className="px-2 py-1 text-slate-500 dark:text-slate-400">Anaerobic + cardiovascular demand</td></tr>
                <tr className="bg-white dark:bg-slate-800"><td className="px-2 py-1">Hiking (Steep)</td><td className="text-right px-2 py-1 font-mono">1.20×</td><td className="px-2 py-1 text-slate-500 dark:text-slate-400">&gt;500ft gain, eccentric descent loading</td></tr>
                <tr className="bg-slate-50 dark:bg-slate-900"><td className="px-2 py-1">Trail Running</td><td className="text-right px-2 py-1 font-mono">1.10×</td><td className="px-2 py-1 text-slate-500 dark:text-slate-400">Uneven terrain, elevation stress</td></tr>
                <tr className="bg-white dark:bg-slate-800"><td className="px-2 py-1">Running</td><td className="text-right px-2 py-1 font-mono">1.00×</td><td className="px-2 py-1 text-slate-500 dark:text-slate-400">Baseline reference sport</td></tr>
                <tr className="bg-slate-50 dark:bg-slate-900"><td className="px-2 py-1">Strength (Full Body)</td><td className="text-right px-2 py-1 font-mono">1.00×</td><td className="px-2 py-1 text-slate-500 dark:text-slate-400">Mixed compound movements</td></tr>
                <tr className="bg-white dark:bg-slate-800"><td className="px-2 py-1">Hiking (Flat)</td><td className="text-right px-2 py-1 font-mono">0.80×</td><td className="px-2 py-1 text-slate-500 dark:text-slate-400">Low impact, sustained aerobic</td></tr>
                <tr className="bg-slate-50 dark:bg-slate-900"><td className="px-2 py-1">Mountain Biking</td><td className="text-right px-2 py-1 font-mono">0.80×</td><td className="px-2 py-1 text-slate-500 dark:text-slate-400">Non-weight-bearing but technical</td></tr>
                <tr className="bg-white dark:bg-slate-800"><td className="px-2 py-1">Elliptical</td><td className="text-right px-2 py-1 font-mono">0.70×</td><td className="px-2 py-1 text-slate-500 dark:text-slate-400">Low impact cross-training</td></tr>
                <tr className="bg-slate-50 dark:bg-slate-900"><td className="px-2 py-1">Cycling</td><td className="text-right px-2 py-1 font-mono">0.65×</td><td className="px-2 py-1 text-slate-500 dark:text-slate-400">Non-weight-bearing, less impact</td></tr>
                <tr className="bg-white dark:bg-slate-800"><td className="px-2 py-1">E-Bike (default)</td><td className="text-right px-2 py-1 font-mono">0.30×</td><td className="px-2 py-1 text-slate-500 dark:text-slate-400">Pedal-assist covers most of the effort. Name ride "no/low assist" or "hard" to promote to regular Cycling 0.65× and capture grinding leg load that HR misses.</td></tr>
                <tr className="bg-white dark:bg-slate-800"><td className="px-2 py-1">Walking</td><td className="text-right px-2 py-1 font-mono">0.40×</td><td className="px-2 py-1 text-slate-500 dark:text-slate-400">Recovery-level effort</td></tr>
                <tr className="bg-slate-50 dark:bg-slate-900"><td className="px-2 py-1">Swimming</td><td className="text-right px-2 py-1 font-mono">0.35×</td><td className="px-2 py-1 text-slate-500 dark:text-slate-400">Non-weight-bearing, cooling effect</td></tr>
                <tr className="bg-white dark:bg-slate-800"><td className="px-2 py-1">Yoga / Pilates</td><td className="text-right px-2 py-1 font-mono">0.30×</td><td className="px-2 py-1 text-slate-500 dark:text-slate-400">Flexibility/mobility, minimal stress</td></tr>
                <tr className="bg-slate-50 dark:bg-slate-900"><td className="px-2 py-1">Strength (Upper)</td><td className="text-right px-2 py-1 font-mono">0.20×</td><td className="px-2 py-1 text-slate-500 dark:text-slate-400">Low running-muscle impact, low cardio</td></tr>
                <tr className="bg-white dark:bg-slate-800"><td className="px-2 py-1">Running Drills</td><td className="text-right px-2 py-1 font-mono">0.50×</td><td className="px-2 py-1 text-slate-500 dark:text-slate-400">Plyometric impact + HR elevated during A-skips, bounding, strides</td></tr>
                <tr className="bg-slate-50 dark:bg-slate-900"><td className="px-2 py-1">Myrtl</td><td className="text-right px-2 py-1 font-mono">0.10×</td><td className="px-2 py-1 text-slate-500 dark:text-slate-400">Hip activation — small but real muscular work on glutes/rotators</td></tr>
                <tr className="bg-white dark:bg-slate-800"><td className="px-2 py-1">Breathwork</td><td className="text-right px-2 py-1 font-mono">0.00×</td><td className="px-2 py-1 text-slate-500 dark:text-slate-400">Pure breath work — tracked for compliance, no mechanical load</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-slate-500 dark:text-slate-400 italic">Strength is auto-classified by activity name keywords (upper/lower/push/pull/legs) with HR inference fallback (&gt;60% HRR → lower body). Hiking is classified as steep when elevation gain exceeds 500 ft.</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">Elevation Bonus</p>
          <p>Workouts with significant climbing get an additional <strong>+10 per 1,000 ft</strong> of elevation gain. This accounts for eccentric loading on descents, altitude stress, and the extra cardiovascular demand of vertical work — critical for Broken Arrow Skyrace prep.</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">7-Day Training Load</p>
          <p>Your total adjusted training load for the past 7 days, broken down by sport type. Uses Garmin EPOC (primary) or Banister TRIMP (fallback), adjusted by MIM multiplier + elevation bonus. The stacked bar chart shows the distribution — a balanced mix across running, strength, and cross-training is generally better than all-or-nothing training.</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">Garmin Aerobic / Anaerobic Training Effect</p>
          <p>Displayed alongside your training load as supplementary context. Aerobic TE (0–5.0) indicates cardiovascular stimulus; Anaerobic TE (0–5.0) indicates high-intensity/muscular stimulus. These are Garmin's proprietary metrics — useful for understanding session character but <em>not</em> used in the training load model to avoid double-counting.</p>
        </div>
        <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
          <p className="font-semibold text-slate-700 dark:text-slate-200">The Impulse-Response Model (Banister et al., 1975)</p>
          <p>CTL, ATL, and TSB come from the impulse-response framework used in sport science since the 1970s. The core idea: every workout produces both a <em>fitness</em> gain (slow to build, slow to fade — 42-day time constant) and a <em>fatigue</em> cost (fast to build, fast to fade — 7-day time constant). Your recovery balance at any moment is the difference between the two.</p>
          <p className="mt-1">Early in a training plan, it's common to see deeply negative Recovery Balance (TSB &lt; -30) because fatigue accumulates quickly (7-day ATL ramps fast) while fitness builds slowly (42-day CTL needs weeks). This does <strong>not</strong> mean you're overtrained — check the Readiness tab for biometric confirmation. If Readiness is GREEN, your body is handling the load. Proper tapering before a race lets fatigue drop faster than fitness, producing peak performance.</p>
        </div>
      </div>
      )}
    </div>
  )
}

// ─── Shared StatCard ────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    teal: 'bg-teal-50 border-teal-200 text-teal-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    rose: 'bg-rose-50 border-rose-200 text-rose-800',
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
