import { useState } from 'react'
import type { TrainingWeek, ReadinessScore, GarminHealthData, DailyTRIMP, PerformanceMetrics, WeeklyRecommendation } from '../types'
import type { OverallCompliance } from '../hooks/useCompliance'
import { getMilesNumber } from '../utils/format'
import ReadinessBanner from './ReadinessBanner'
import TRIMPBreakdown from './TRIMPBreakdown'
import PerformanceChart from './PerformanceChart'

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
  garminConnected?: boolean
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
  garminConnected = false,
}: DashboardProps) {
  const [subTab, setSubTab] = useState<DashSubTab>('compliance')

  const daysUntilRace = Math.max(0, Math.ceil(
    (new Date('2026-06-20').getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  ))

  const SUB_TABS: { id: DashSubTab; label: string; available: boolean }[] = [
    { id: 'compliance', label: 'Compliance', available: true },
    { id: 'readiness', label: 'Readiness', available: garminConnected },
    { id: 'performance', label: 'Performance', available: garminConnected || dailyTrimp.length > 0 },
  ]

  return (
    <div className="px-4 py-4 space-y-4">
      <h2 className="text-lg font-bold text-slate-800">Dashboard</h2>

      {/* Race countdown */}
      <div className="bg-slate-800 rounded-xl p-4 text-white text-center">
        <p className="text-3xl font-bold">{daysUntilRace}</p>
        <p className="text-sm text-slate-300">days until race</p>
        <p className="text-xs text-teal-400 mt-1">{raceDate}</p>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
        {SUB_TABS.filter(t => t.available).map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
              subTab === t.id
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {subTab === 'compliance' && (
        <ComplianceTab weeks={weeks} compliance={compliance} />
      )}
      {subTab === 'readiness' && (
        <ReadinessTab
          todayScore={todayScore}
          weekScores={weekScores}
          todayHealth={todayHealth}
          healthHistory={healthHistory}
        />
      )}
      {subTab === 'performance' && (
        <PerformanceTab
          dailyTrimp={dailyTrimp}
          performance={performance}
          recommendations={weeklyRecommendations}
          raceDate={raceDate}
        />
      )}
    </div>
  )
}

// ─── Compliance Sub-Tab (existing content) ──────────────────────

function ComplianceTab({ weeks, compliance }: { weeks: TrainingWeek[]; compliance: OverallCompliance }) {
  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Completion"
          value={`${compliance.completionRate}%`}
          sub={`${compliance.totalCompleted} / ${compliance.totalCompleted + compliance.totalMissed} workouts`}
          color="teal"
        />
        <StatCard
          label="Actual Miles"
          value={`${compliance.totalActualMiles}`}
          sub={`of ${compliance.totalPlannedMiles} planned`}
          color="blue"
        />
        <StatCard
          label="Elevation"
          value={`${compliance.totalActualElevation.toLocaleString()} ft`}
          sub="total gain"
          color="amber"
        />
        <StatCard
          label="HR Compliance"
          value={`${compliance.overallHRCompliance}%`}
          sub="in target zone"
          color="rose"
        />
      </div>

      {/* Weekly compliance breakdown */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Weekly Breakdown</h3>
        <div className="space-y-2">
          {compliance.weeks.map(wk => (
            <div key={wk.weekNum} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800">Week {wk.weekNum}</span>
                <div className="flex gap-1.5">
                  {wk.completed > 0 && (
                    <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5">
                      {wk.completed} done
                    </span>
                  )}
                  {wk.missed > 0 && (
                    <span className="text-xs bg-red-100 text-red-700 rounded-full px-2 py-0.5">
                      {wk.missed} missed
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2">
                <div className="flex justify-between text-xs text-slate-500 mb-0.5">
                  <span>{wk.actualMiles} mi actual</span>
                  <span>{wk.plannedMiles} mi planned</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, wk.plannedMiles > 0 ? (wk.actualMiles / wk.plannedMiles) * 100 : 0)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Planned vs Actual volume chart */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Planned vs Actual Mileage</h3>
        <div className="flex items-end gap-1 h-32">
          {weeks.map((w, i) => {
            const planned = getMilesNumber(w.miles)
            const actual = compliance.weeks[i]?.actualMiles ?? 0
            const max = Math.max(...weeks.map(wk => getMilesNumber(wk.miles)), 1)
            const pPct = (planned / max) * 100
            const aPct = (actual / max) * 100
            return (
              <div key={w.num} className="flex-1 flex flex-col items-center gap-0.5">
                <span className="text-[8px] text-slate-400">{actual > 0 ? actual : ''}</span>
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
                <span className="text-[9px] text-slate-400">{w.num}</span>
              </div>
            )
          })}
        </div>
        <div className="flex justify-center gap-4 mt-2 text-xs text-slate-500">
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
}: {
  todayScore?: ReadinessScore | null
  weekScores: ReadinessScore[]
  todayHealth?: GarminHealthData
  healthHistory: GarminHealthData[]
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

      {/* 7-day readiness trend */}
      {weekScores.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <p className="text-sm font-semibold text-slate-700 mb-3">7-Day Readiness Trend</p>
          <div className="flex items-end gap-1.5 h-20">
            {weekScores.map((s, i) => {
              const height = `${Math.max(s.composite, 5)}%`
              const bg =
                s.status === 'GREEN' ? 'bg-green-500' :
                s.status === 'YELLOW' ? 'bg-amber-400' :
                'bg-red-500'
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[9px] text-slate-400">{s.composite}</span>
                  <div
                    className={`w-full rounded-t ${bg} transition-all`}
                    style={{ height }}
                  />
                  <span className="text-[9px] text-slate-400">{s.date.slice(5)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!todayScore && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 text-center">
          <p className="text-sm text-slate-500">Connect Garmin and sync to see readiness data</p>
        </div>
      )}

      {/* Glossary */}
      <ReadinessGlossary />
    </div>
  )
}

// ─── Readiness Glossary ────────────────────────────────────────

function ReadinessGlossary() {
  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">Understanding Your Readiness</p>
      <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
        <div>
          <p className="font-semibold text-slate-700">Readiness Score (0–100)</p>
          <p>A composite score reflecting how prepared your body is to train today. It combines four biometric inputs from your Garmin watch, each weighted by its predictive importance for recovery.</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700">HRV — Heart Rate Variability (40% weight)</p>
          <p>The variation in time between heartbeats, measured overnight. Higher HRV generally indicates better recovery and parasympathetic (rest-and-digest) nervous system activation. Your score is based on how today's HRV compares to your personal 30-day rolling baseline — not absolute numbers.</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700">RHR — Resting Heart Rate (20% weight)</p>
          <p>Your lowest heart rate while at rest. A lower-than-baseline RHR suggests good recovery; an elevated RHR can signal fatigue, stress, dehydration, or illness. Scored inversely — lower is better.</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700">Sleep (20% weight)</p>
          <p>A combination of sleep duration and Garmin's sleep score. Both quantity (hours) and quality (deep, REM, and light sleep distribution) matter for recovery. The readiness engine weighs duration at 50% and quality at 50%.</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700">Training Load (20% weight)</p>
          <p>How much stress your recent training has placed on your body, measured via TRIMP (Training Impulse). A high recent training load relative to your baseline reduces readiness. Scored inversely — less recent load means more readiness.</p>
        </div>
        <div className="pt-2 border-t border-slate-200">
          <p className="font-semibold text-slate-700">Traffic Light Signals</p>
          <p>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 mr-1 align-middle" />
            <strong>GREEN (70–100):</strong> Execute your planned workout as written.
          </p>
          <p>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 mr-1 align-middle" />
            <strong>YELLOW (40–69):</strong> Reduce intensity or volume. Specific adjustments are shown.
          </p>
          <p>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 mr-1 align-middle" />
            <strong>RED (0–39):</strong> Swap for an easy walk or full rest day. Your body needs recovery.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Performance Sub-Tab ────────────────────────────────────────

function PerformanceTab({
  dailyTrimp,
  performance,
  recommendations,
  raceDate,
}: {
  dailyTrimp: DailyTRIMP[]
  performance: PerformanceMetrics[]
  recommendations: WeeklyRecommendation[]
  raceDate: string
}) {
  return (
    <div className="space-y-4">
      <PerformanceChart
        performance={performance}
        recommendations={recommendations}
        raceDate={raceDate}
      />
      <TRIMPBreakdown dailyTrimp={dailyTrimp} />
      <PerformanceGlossary />
    </div>
  )
}

// ─── Performance Glossary ──────────────────────────────────────

function PerformanceGlossary() {
  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">Understanding Your Performance Metrics</p>
      <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
        <div>
          <p className="font-semibold text-slate-700">Fitness (CTL) — Chronic Training Load</p>
          <p>A 42-day exponentially weighted rolling average of your daily training load (TRIMP). It represents your accumulated fitness over roughly the past 6 weeks. CTL rises slowly with consistent training and decays slowly during rest. Think of it as your "fitness bank account" — it takes weeks to build and weeks to lose.</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700">Fatigue (ATL) — Acute Training Load</p>
          <p>A 7-day exponentially weighted rolling average of your daily TRIMP. It captures the fatigue from your most recent training. ATL responds quickly — a hard workout spikes it, and a rest day drops it. When ATL is much higher than CTL, you're accumulating fatigue faster than fitness.</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700">Form (TSB) — Training Stress Balance</p>
          <p>The difference between Fitness and Fatigue (CTL minus ATL). A positive TSB means you're fresher than your fitness level — ideal for racing. A negative TSB means you're carrying fatigue — normal during hard training blocks. For race day, the target is TSB between +15 and +25 ("peak form").</p>
          <ul className="mt-1 ml-3 space-y-0.5 list-disc">
            <li><strong>+15 to +25:</strong> Peak form — race ready</li>
            <li><strong>+5 to +14:</strong> Fresh — good for quality sessions</li>
            <li><strong>-10 to +4:</strong> Productive training — building fitness</li>
            <li><strong>-30 to -11:</strong> Tired — accumulating fatigue, normal in build weeks</li>
            <li><strong>Below -30:</strong> Overreaching — injury/burnout risk, consider backing off</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-slate-700">ACWR — Acute:Chronic Workload Ratio</p>
          <p>The ratio of your recent training load (ATL) to your long-term fitness (CTL). It flags injury risk from training spikes.</p>
          <ul className="mt-1 ml-3 space-y-0.5 list-disc">
            <li><strong>0.8–1.3:</strong> Sweet spot — safe and productive</li>
            <li><strong>1.3–1.5:</strong> Caution — elevated injury risk</li>
            <li><strong>Above 1.5:</strong> High risk — you've ramped up too fast</li>
            <li><strong>Below 0.8:</strong> Detraining — you may be doing too little</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-slate-700">TRIMP — Training Impulse</p>
          <p>A single number that quantifies the training stress of a workout, based on the Banister formula. It combines duration, heart rate intensity (how hard your heart worked relative to your max), and sport type. Higher TRIMP = more training stress. A 60-minute easy run might score ~80, while a 90-minute hill workout could score ~200+.</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700">Weekly TRIMP</p>
          <p>Your total training load for the past 7 days, broken down by sport type (running, strength, hiking, etc.). This helps you see how different activities contribute to your overall fatigue and fitness. The stacked bar chart shows the distribution — a balanced mix is generally better than all-or-nothing training.</p>
        </div>
        <div className="pt-2 border-t border-slate-200">
          <p className="font-semibold text-slate-700">The Banister Model</p>
          <p>All of these metrics come from the Banister impulse-response model, a peer-reviewed framework used in sport science since the 1970s. The core idea: every workout produces both a <em>fitness</em> gain (slow to build, slow to fade) and a <em>fatigue</em> cost (fast to build, fast to fade). Your "form" at any moment is the balance between the two. Proper tapering before a race lets fatigue drop faster than fitness, producing peak performance.</p>
        </div>
      </div>
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
      <p className="text-xs opacity-75">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
      <p className="text-xs opacity-60 mt-0.5">{sub}</p>
    </div>
  )
}
