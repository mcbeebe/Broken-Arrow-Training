import { useState, useMemo, useEffect, useCallback } from 'react'
import type { ViewId, CoachSnapshot, CoachAction, PlannedDay } from './types'
import { plans } from './data'
import { generateHyroxPlan } from './utils/planGenerator'
import { useStrava } from './hooks/useStrava'
import { useGarmin } from './hooks/useGarmin'
import { useCompliance } from './hooks/useCompliance'
import { useManualLog } from './hooks/useManualLog'
import { usePlanOverrides } from './hooks/usePlanOverrides'
import { useDaySwap } from './hooks/useDaySwap'
import { useReadiness } from './hooks/useReadiness'
import { useOnboarding } from './hooks/useOnboarding'
import Onboarding from './components/Onboarding'
import { useSoreness } from './hooks/useSoreness'
import { useMIMCalibration } from './hooks/useMIMCalibration'
import { useDOMSCalibration } from './hooks/useDOMSCalibration'
import { useCoachMemory } from './hooks/useCoachMemory'
import { useCoachInsight } from './hooks/useCoachInsight'
import { useProactivePings } from './hooks/useProactivePings'
import { useCoachTelemetry } from './hooks/useCoachTelemetry'
import { matchActivitiesToPlan, mergeGarminDetailIntoWeeks } from './utils/matching'
import { calculateExerciseLoad } from './utils/trimp'
import { localDateStr } from './utils/format'
import { generateMorningCoach, generateEveningCoach, getCoachTimeOfDay } from './utils/coach'
import { checkStorageVersion, clearAllCachedData, clearAllAppData } from './utils/storageVersion'
import { buildCoachSnapshot } from './utils/coachSnapshot'
import WeeklyPlan from './components/WeeklyPlan'
import Summary from './components/Summary'
import Dashboard from './components/Dashboard'
import RaceInfo from './components/RaceInfo'
// Methodology is now a subsection within Settings
import Settings from './components/Settings'
import CoachTab from './components/CoachTab'
import CoachPingToast from './components/CoachPingToast'
import LoginScreen from './components/LoginScreen'
import { useHRZones } from './hooks/useHRZones'
import { useMaxHR } from './hooks/useMaxHR'
import { getStoredSession, clearSession, type AuthSession } from './utils/auth'
import { useTheme } from './hooks/useTheme'

// Auto-clear stale caches on app startup when data format changes
checkStorageVersion()

function getAthleteFromHash(): string {
  const hash = window.location.hash.replace('#', '').toLowerCase()
  if (hash in plans) return hash
  return 'mike'
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(() => getStoredSession())

  const handleLogin = useCallback((s: AuthSession) => {
    setSession(s)
    window.location.hash = s.athleteId
  }, [])

  const handleLogout = useCallback(() => {
    clearSession()
    setSession(null)
  }, [])

  // If no session and no Google client ID configured, fall back to hash-based auth
  const googleConfigured = !!import.meta.env.VITE_GOOGLE_CLIENT_ID
  const requireLogin = googleConfigured && !session

  if (requireLogin) {
    return <LoginScreen onLogin={handleLogin} />
  }

  return <AuthenticatedApp session={session} onLogout={handleLogout} />
}

function AuthenticatedApp({ session, onLogout }: { session: AuthSession | null; onLogout: () => void }) {
  const [view, setView] = useState<ViewId>('summary')
  const [athleteId, setAthleteId] = useState(() => (session?.athleteId || getAthleteFromHash()).toLowerCase())
  const [chatSeed, setChatSeed] = useState<string | null>(null)
  const theme = useTheme()
  const onboarding = useOnboarding(athleteId)
  const plan = plans[athleteId]

  if (!plan && !onboarding.isOnboarded) {
    return (
      <Onboarding
        onComplete={(config) => {
          onboarding.save(config)
        }}
        onSkip={onLogout}
      />
    )
  }

  // Generate plan from onboarding config if no pre-built plan exists
  const generatedPlan = useMemo(() => {
    if (plan || !onboarding.config) return null
    if (onboarding.config.raceType === 'hyrox') return generateHyroxPlan(onboarding.config)
    return null
  }, [plan, onboarding.config])

  const activePlan = plan || generatedPlan

  if (!activePlan) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
        <div className="text-center space-y-4">
          <span className="text-5xl">{onboarding.config?.raceType === 'hyrox' ? '🏋️' : onboarding.config?.raceType === 'trail' ? '🏔' : '💪'}</span>
          <h1 className="text-2xl font-bold text-slate-800">Welcome, {onboarding.config?.athleteName || athleteId}!</h1>
          <p className="text-slate-500">
            Plan generation for <strong>{onboarding.config?.raceType || 'your goal'}</strong> is coming soon.
            {onboarding.config?.raceType === 'trail' && ' Trail race plan generator is in development.'}
          </p>
          <div className="pt-4 space-y-2">
            <button onClick={() => onboarding.clear()} className="text-teal-600 font-medium text-sm">Redo onboarding</button>
            <br />
            <button onClick={onLogout} className="text-slate-400 font-medium text-sm">Sign out</button>
          </div>
        </div>
      </div>
    )
  }
  const strava = useStrava(athleteId)
  const garmin = useGarmin(athleteId)

  useEffect(() => {
    function onHashChange() {
      setAthleteId(getAthleteFromHash())
      setView('summary')
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  const manualLog = useManualLog(athleteId)
  const daySwap = useDaySwap(athleteId)
  const planOverrides = usePlanOverrides(athleteId)
  const soreness = useSoreness(athleteId)
  const hrZones = useHRZones(athleteId, activePlan.zones)
  const maxHROverride = useMaxHR(athleteId, activePlan.athlete.maxHR)
  const effectiveAthlete = useMemo(
    () => ({ ...activePlan.athlete, maxHR: maxHROverride.maxHR }),
    [activePlan.athlete, maxHROverride.maxHR],
  )
  const handleSaveHRZones = useCallback(
    (zones: import('./types').HRZone[], nextMaxHR: number) => {
      hrZones.save(zones)
      if (nextMaxHR > 0 && nextMaxHR !== activePlan.athlete.maxHR) {
        maxHROverride.save(nextMaxHR)
      } else if (nextMaxHR === activePlan.athlete.maxHR && maxHROverride.isCustomized) {
        maxHROverride.reset()
      }
    },
    [hrZones, maxHROverride, activePlan.athlete.maxHR],
  )
  const handleResetHRZones = useCallback(() => {
    hrZones.reset()
    maxHROverride.reset()
  }, [hrZones, maxHROverride])
  const showStrava = true  // All athletes can connect Strava and Garmin
  // Coach is now available to all athletes. Per-athlete isolation is
  // handled server-side via athleteId-keyed KV memory. Soft cost caps
  // enforced in api/coach/_core.py budget helpers.
  const coachEnabled = true
  const coachMemory = useCoachMemory(athleteId, coachEnabled)
  const coachTelemetry = useCoachTelemetry(athleteId, coachEnabled)

  const TABS: { id: ViewId; label: string; badge?: number }[] = useMemo(() => {
    const base: { id: ViewId; label: string; badge?: number }[] = [
      { id: 'summary', label: 'Summary' },
      { id: 'plan', label: 'Plan' },
      { id: 'dashboard', label: 'Stats' },
    ]
    if (coachEnabled) {
      // Hide the badge when the user is already on the Coach tab —
      // they're reading the messages, so the dot is redundant and
      // the onMarkRead() effect will clear unread flags anyway.
      base.push({ id: 'coach', label: 'Coach', badge: view === 'coach' ? 0 : coachMemory.unreadCount })
    }
    base.push({ id: 'settings', label: 'Settings' })
    return base
  }, [coachEnabled, coachMemory.unreadCount, view])

  // Merge Strava or manual log data into training plan
  const weeks = useMemo(() => {
    let w = activePlan.weeks
    w = daySwap.applySwapsToWeeks(w)
    // Coach-proposed plan overrides (e.g. swap strength for mobility)
    // apply BEFORE actuals so actual matches still line up by day label.
    w = planOverrides.applyOverridesToWeeks(w)
    if (showStrava && strava.activities.length > 0) {
      w = matchActivitiesToPlan(w, strava.activities)
    }
    // Garmin detail enriches/overrides Strava actuals
    if (garmin.connected && Object.keys(garmin.activityDetails).length > 0) {
      w = mergeGarminDetailIntoWeeks(w, garmin.activityDetails)
    }
    w = manualLog.applyLogsToWeeks(w)
    return w
  }, [activePlan.weeks, strava.activities, showStrava, manualLog.applyLogsToWeeks, daySwap.applySwapsToWeeks, planOverrides.applyOverridesToWeeks, garmin.connected, garmin.activityDetails])

  const compliance = useCompliance(weeks)
  const raceName = activePlan.race.name || (activePlan.race.distance.includes('18K') ? 'BROKEN ARROW 18K' : 'BROKEN ARROW 11K')

  const daysUntilRace = useMemo(() => {
    const raceStr = activePlan.race.date.match(/\w+,\s*(.+)/)?.[1] || activePlan.race.date
    const raceDate = new Date(raceStr)
    return Math.max(0, Math.ceil((raceDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
  }, [activePlan.race.date])

  // Determine current week number
  const currentWeekNum = useMemo(() => {
    const now = new Date()
    const planStart = new Date('2026-04-13')
    const weeksSinceStart = Math.floor((now.getTime() - planStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
    return Math.max(1, Math.min(10, weeksSinceStart + 1))
  }, [])

  // Find today's planned workout
  const todayPlannedWorkout = useMemo(() => {
    const today = new Date()
    const month = today.getMonth() + 1
    const day = today.getDate()
    const dayLabel = `${month}/${day}`
    for (const week of weeks) {
      for (const d of week.days) {
        if (d.day.includes(dayLabel)) return d
      }
    }
    return undefined
  }, [weeks])

  // Find tomorrow's planned workout
  const tomorrowPlannedWorkout = useMemo(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const month = tomorrow.getMonth() + 1
    const day = tomorrow.getDate()
    const dayLabel = `${month}/${day}`
    for (const week of weeks) {
      for (const d of week.days) {
        if (d.day.includes(dayLabel)) return d
      }
    }
    return undefined
  }, [weeks])

  // Current week days and today's index for coach engine
  const currentWeekDays = useMemo(() => {
    const currentWeek = weeks.find(w => w.num === currentWeekNum)
    return currentWeek?.days || []
  }, [weeks, currentWeekNum])

  const todayDayIndex = useMemo(() => {
    const today = new Date()
    const dayLabel = `${today.getMonth() + 1}/${today.getDate()}`
    return currentWeekDays.findIndex(d => d.day.includes(dayLabel))
  }, [currentWeekDays])

  // Extract RPE ratings and manual exercise load from actuals
  const { rpeByDate, exerciseLoadByDate } = useMemo(() => {
    const rpeMap = new Map<string, number>()
    const exMap = new Map<string, number>()
    for (const week of weeks) {
      for (const day of week.days) {
        if (!day.actual?.startDate) continue
        const date = day.actual.startDate.slice(0, 10)
        if (day.actual.rpe) {
          rpeMap.set(date, day.actual.rpe)
        }
        if (day.actual.strengthLog?.length) {
          const load = calculateExerciseLoad(day.actual.strengthLog)
          if (load > 0) exMap.set(date, load)
        }
      }
    }
    return { rpeByDate: rpeMap, exerciseLoadByDate: exMap }
  }, [weeks])

  // Readiness engine (combines Garmin health data + Strava/Garmin activities)
  const readiness = useReadiness({
    healthData: garmin.healthData,
    stravaActivities: strava.activities,
    garminActivities: garmin.garminActivities,
    garminActivityDetails: garmin.activityDetails,
    rpeByDate,
    exerciseLoadByDate,
    sorenessLoadByDate: soreness.sorenessLoadByDate,
    maxHR: maxHROverride.maxHR,
    todayPlannedWorkout,
    currentWeekNum,
    raceDate: activePlan.race.date,
    athleteId,
  })

  // Today's health data for banner
  const todayHealth = useMemo(() => {
    const today = localDateStr()
    return garmin.healthData.find(d => d.date === today)
  }, [garmin.healthData])

  const latestPerf = useMemo(
    () => (readiness.performance.length > 0 ? readiness.performance[readiness.performance.length - 1] : null),
    [readiness.performance],
  )
  const mimCalibration = useMIMCalibration(athleteId, readiness.dailyTrimp, soreness.sorenessLoadByDate)
  const domsCalibration = useDOMSCalibration(athleteId, readiness.dailyTrimp, soreness.sorenessLoadByDate)

  // Yesterday's readiness score — for proactive ping trigger detection
  const yesterdayScore = useMemo(() => {
    const today = localDateStr()
    const yesterday = localDateStr(new Date(Date.now() - 86400000))
    // Find a score with yesterday's date in the full weekScores (sorted)
    const match = readiness.weekScores.find(s => s.date === yesterday)
    if (match) return match
    // Fallback: if todayScore is the last entry, the one before it is yesterday
    const scores = readiness.weekScores
    if (scores.length >= 2 && scores[scores.length - 1].date === today) {
      return scores[scores.length - 2]
    }
    return null
  }, [readiness.weekScores])

  // AI Coach recommendation (legacy heuristic — still drives TodayBriefing)
  const coachRecommendation = useMemo(() => {
    const timeOfDay = getCoachTimeOfDay()
    if (timeOfDay === 'morning') {
      return generateMorningCoach(
        readiness.todayScore,
        todayPlannedWorkout,
        currentWeekDays,
        todayDayIndex,
        latestPerf,
        todayHealth?.sleep,
        readiness.trainingStateInfo,
      )
    } else {
      return generateEveningCoach(
        readiness.todayScore,
        tomorrowPlannedWorkout,
        todayHealth?.sleep,
        todayHealth?.bodyBattery,
        latestPerf,
        readiness.trainingStateInfo,
      )
    }
  }, [readiness.todayScore, todayPlannedWorkout, tomorrowPlannedWorkout, currentWeekDays, todayDayIndex, latestPerf, todayHealth, readiness.trainingStateInfo])

  // Handler for coach swap
  const handleCoachSwap = useCallback((fromIndex: number, toIndex: number) => {
    daySwap.swapDays(currentWeekNum, fromIndex, toIndex)
  }, [daySwap, currentWeekNum])

  // Assemble the CoachSnapshot for LLM calls
  const coachSnapshot: CoachSnapshot | null = useMemo(() => {
    if (!coachEnabled) return null
    // Wait for Garmin sync to finish before building the snapshot so the
    // coach sees fresh data, not stale cache from the previous session.
    if (garmin.connected && garmin.loading) return null
    if (!readiness.todayScore && readiness.performance.length === 0) return null
    const snap = buildCoachSnapshot({
      athleteProfile: effectiveAthlete,
      race: activePlan.race,
      zones: activePlan.zones,
      raceDistanceMiles: activePlan.race.distanceMiles,
      raceElevationFt: parseInt((activePlan.race.elevation || '0').replace(/[^0-9]/g, ''), 10) || 0,
      currentWeekNum,
      weeks,
      plannedToday: todayPlannedWorkout,
      plannedTomorrow: tomorrowPlannedWorkout,
      readiness: readiness.todayScore,
      performance: readiness.performance,
      dailyTrimp: readiness.dailyTrimp,
      compliance,
      todaySoreness: soreness.todaySoreness,
      sorenessLog: [],
      planStartDate: '2026-04-13',
      todayHealth,
      // Raw activity feeds so the coach can see workouts outside the
      // plan window (pre-plan base, non-plan-day bonus runs, etc.)
      stravaActivities: strava.activities,
      garminActivities: garmin.garminActivities,
      garminActivityDetails: garmin.activityDetails,
    })
    // Attach persona so the API can shape the system prompt voice
    const persona = coachMemory.coachPersona
    if (persona && (persona.name || persona.traits.length > 0)) {
      snap.coachPersona = persona
    }
    // Attach proactive injury risk flags so the coach can raise concerns
    if (readiness.riskFlags && readiness.riskFlags.length > 0) {
      snap.riskFlags = readiness.riskFlags
    }
    return snap
  }, [
    coachEnabled,
    effectiveAthlete,
    activePlan.race,
    currentWeekNum,
    weeks,
    todayPlannedWorkout,
    tomorrowPlannedWorkout,
    readiness.todayScore,
    readiness.performance,
    readiness.dailyTrimp,
    compliance,
    soreness.todaySoreness,
    todayHealth,
    coachMemory.coachPersona,
    strava.activities,
    garmin.garminActivities,
  ])

  // Daily LLM insight (shared between Summary + Coach tab)
  const dailyInsight = useCoachInsight({
    athleteId,
    surface: 'daily',
    snapshot: coachSnapshot,
    enabled: coachEnabled && !!coachSnapshot,
  })

  // Proactive pings driver (Mike-only)
  useProactivePings({
    athleteId,
    enabled: coachEnabled,
    snapshot: coachSnapshot,
    stravaActivities: strava.activities,
    garminActivities: garmin.garminActivities,
    todayScore: readiness.todayScore,
    yesterdayScore,
    plannedToday: todayPlannedWorkout,
    memory: coachMemory,
  })

  // "Ask about this" → seed chat + open Coach tab
  const handleAskCoach = useCallback(
    (seed: string) => {
      setChatSeed(seed)
      setView('coach')
      coachTelemetry.logInteraction('ask_tapped')
    },
    [coachTelemetry],
  )

  // Resolve a planned day by (weekNum, dayIndex). Uses base plan days
  // (pre-override) so the ProposalCard can show a "before → after" diff
  // with the original workout.
  const getPlannedDay = useCallback((weekNum: number, dayIndex: number): PlannedDay | null => {
    const w = activePlan.weeks.find(wk => wk.num === weekNum)
    if (!w) return null
    return w.days[dayIndex] ?? null
  }, [activePlan.weeks])

  const handleApproveAction = useCallback((turnId: string, action: CoachAction) => {
    if (action.type !== 'propose_edit' || !action.proposedEdit) return
    const overrideId = planOverrides.applyOverride({
      weekNum: action.proposedEdit.weekNum,
      dayIndex: action.proposedEdit.dayIndex,
      updates: action.proposedEdit.updates,
      rationale: action.proposedEdit.rationale,
    })
    coachMemory.updateTurn(turnId, { actionStatus: 'applied', actionOverrideId: overrideId })
  }, [planOverrides, coachMemory])

  const handleRejectAction = useCallback((turnId: string) => {
    coachMemory.updateTurn(turnId, { actionStatus: 'rejected' })
  }, [coachMemory])

  const handleUndoAction = useCallback((turnId: string, overrideId: string) => {
    planOverrides.removeOverride(overrideId)
    coachMemory.updateTurn(turnId, { actionStatus: 'pending', actionOverrideId: undefined })
  }, [planOverrides, coachMemory])

  // Daily-insight proposals don't live in coachMemory, so they get their
  // own approve/undo path that just touches planOverrides. The card
  // tracks its own pending/applied/rejected status in localStorage.
  const handleApproveInsightProposal = useCallback((action: CoachAction): string | undefined => {
    if (action.type !== 'propose_edit' || !action.proposedEdit) return undefined
    return planOverrides.applyOverride({
      weekNum: action.proposedEdit.weekNum,
      dayIndex: action.proposedEdit.dayIndex,
      updates: action.proposedEdit.updates,
      rationale: action.proposedEdit.rationale,
    })
  }, [planOverrides])

  const handleUndoInsightProposal = useCallback((overrideId: string) => {
    planOverrides.removeOverride(overrideId)
  }, [planOverrides])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 dark:text-slate-200 transition-colors" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      {/* Header */}
      <div className="bg-slate-800 dark:bg-slate-900 text-white px-3 py-2.5">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-bold tracking-tight leading-tight">{raceName}</h1>
          <span className="text-teal-400 text-sm font-semibold">{daysUntilRace} days</span>
        </div>
        <p className="text-slate-300 text-xs mt-0.5">
          {activePlan.athlete.name} · {activePlan.race.date}
        </p>
        <p className="text-teal-400 text-[10px] mt-0.5">{activePlan.athlete.weeklyStructure}</p>
      </div>

      {/* Proactive coach ping toast */}
      {coachEnabled && (
        <CoachPingToast
          unreadCount={coachMemory.unreadCount}
          onOpen={() => setView('coach')}
          onDismiss={() => coachTelemetry.logInteraction('toast_dismissed')}
        />
      )}

      {/* Content */}
      {view === 'summary' && (<>
        {mimCalibration.pendingSuggestions.length > 0 && (
          <div className="px-3 mb-3 space-y-2">
            {mimCalibration.pendingSuggestions.map(s => (
              <div key={s.sport} className="bg-amber-50 dark:bg-amber-950 rounded-xl p-3 border border-amber-200 dark:border-amber-800">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">Training Load Calibration</p>
                <p className="text-sm text-amber-800 dark:text-amber-200">{s.reason}</p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => {
                      const note = mimCalibration.acceptSuggestion(s.sport)
                      if (note && coachMemory.saveAboutMe) {
                        const existing = coachMemory.aboutMe || ''
                        const updated = existing ? `${existing}\n${note}` : note
                        coachMemory.saveAboutMe(updated)
                      }
                    }}
                    className="text-xs px-3 py-1 rounded-lg bg-amber-600 text-white font-medium"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => mimCalibration.dismissSuggestion(s.sport)}
                    className="text-xs px-3 py-1 rounded-lg border border-amber-300 text-amber-700 font-medium"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {domsCalibration.pendingSuggestions.length > 0 && (
          <div className="px-3 mb-3 space-y-2">
            {domsCalibration.pendingSuggestions.map(s => (
              <div key={s.sport} className="bg-orange-50 dark:bg-orange-950 rounded-xl p-3 border border-orange-200 dark:border-orange-900">
                <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">Recovery Calibration</p>
                <p className="text-sm text-orange-800 dark:text-orange-200">{s.reason}</p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => {
                      const note = domsCalibration.acceptSuggestion(s.sport)
                      if (note && coachMemory.saveAboutMe) {
                        const existing = coachMemory.aboutMe || ''
                        const updated = existing ? `${existing}\n${note}` : note
                        coachMemory.saveAboutMe(updated)
                      }
                    }}
                    className="text-xs px-3 py-1 rounded-lg bg-orange-600 text-white font-medium"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => domsCalibration.dismissSuggestion(s.sport)}
                    className="text-xs px-3 py-1 rounded-lg border border-orange-300 text-orange-700 font-medium"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <Summary
          athleteId={athleteId}
          todayScore={readiness.todayScore}
          weekScores={readiness.weekScores}
          todayHealth={todayHealth}
          healthHistory={garmin.healthData}
          garminConnected={garmin.connected}
          coachRecommendation={coachRecommendation}
          onCoachSwap={handleCoachSwap}
          dailyTrimp={readiness.dailyTrimp}
          performance={readiness.performance}
          todaySoreness={soreness.todaySoreness}
          onLogSoreness={soreness.logSoreness}
          sorenessLoadByDate={soreness.sorenessLoadByDate}
          rpeByDate={rpeByDate}
          exerciseLoadByDate={exerciseLoadByDate}
          domsCarryByDate={readiness.domsCarryByDate}
          coachEnabled={coachEnabled}
          dailyInsight={dailyInsight.insight}
          dailyInsightLoading={dailyInsight.loading}
          onAskCoach={handleAskCoach}
          coachName={coachMemory.coachPersona?.name}
          onRegenerateDailyInsight={dailyInsight.regenerate}
          todayPlannedWorkout={todayPlannedWorkout}
          currentWeekNum={currentWeekNum}
          zones={hrZones.zones}
          coachSnapshot={coachSnapshot}
          riskFlags={readiness.riskFlags}
          getPlannedDay={getPlannedDay}
          onApproveInsightProposal={handleApproveInsightProposal}
          onUndoInsightProposal={handleUndoInsightProposal}
        />
      </>)}
      {view === 'plan' && (
        <WeeklyPlan
          weeks={weeks}
          zones={hrZones.zones}
          manualLog={manualLog}
          daySwap={daySwap}
          weekReadiness={readiness.weekScores}
          athleteId={athleteId}
          coachEnabled={coachEnabled}
          latestPerf={latestPerf}
          coachSnapshot={coachSnapshot}
          onAskCoach={handleAskCoach}
          race={activePlan.race}
          compliance={compliance.weeks}
          dailyTrimp={readiness.dailyTrimp}
        />
      )}
      {view === 'dashboard' && (
        <Dashboard
          weeks={weeks}
          compliance={compliance}
          raceDate={activePlan.race.date}
          planZones={hrZones.zones}
          athleteMaxHR={maxHROverride.maxHR}
          todayScore={readiness.todayScore}
          weekScores={readiness.weekScores}
          todayHealth={todayHealth}
          healthHistory={garmin.healthData}
          dailyTrimp={readiness.dailyTrimp}
          performance={readiness.performance}
          weeklyRecommendations={readiness.weeklyRecommendations}
          riskFlags={readiness.riskFlags}
          garminConnected={garmin.connected}
          sorenessLoadByDate={soreness.sorenessLoadByDate}
        />
      )}
      {view === 'coach' && coachEnabled && (
        <CoachTab
          athleteId={athleteId}
          memory={coachMemory}
          snapshot={coachSnapshot}
          dailyInsight={dailyInsight.insight}
          dailyInsightLoading={dailyInsight.loading}
          chatSeed={chatSeed}
          onChatSeedConsumed={() => setChatSeed(null)}
          onMarkRead={() => coachMemory.markRead()}
          onGoSettings={() => setView('settings')}
          onInteraction={(k, m) => coachTelemetry.logInteraction(k as Parameters<typeof coachTelemetry.logInteraction>[0], m)}
          getPlannedDay={getPlannedDay}
          onApproveAction={handleApproveAction}
          onRejectAction={handleRejectAction}
          onUndoAction={handleUndoAction}
        />
      )}
      {/* Methodology moved into Settings as a collapsible subsection */}
      {view === 'info' && <RaceInfo race={activePlan.race} />}
      {view === 'settings' && showStrava && (
        <Settings
          connected={strava.connected}
          configured={strava.configured}
          loading={strava.loading}
          error={strava.error}
          athleteName={strava.athleteName}
          lastSync={strava.lastSync}
          onConnect={strava.connect}
          onDisconnect={strava.disconnect}
          onSync={strava.sync}
          garminConnected={garmin.connected}
          garminConfigured={garmin.configured}
          garminLoading={garmin.loading}
          garminError={garmin.error}
          garminMfaRequired={garmin.mfaRequired}
          garminDisplayName={garmin.displayName}
          garminLastSync={garmin.lastSync}
          onGarminConnect={garmin.connect}
          onGarminSubmitMfa={garmin.submitMfa}
          onGarminDisconnect={garmin.disconnect}
          onGarminSync={garmin.sync}
          hrZones={hrZones.zones}
          hrZonesCustomized={hrZones.isCustomized}
          hrZonesMaxHR={maxHROverride.maxHR}
          hrZonesMaxHRCustomized={maxHROverride.isCustomized}
          onSaveHRZones={handleSaveHRZones}
          onResetHRZones={handleResetHRZones}
          onClearCache={clearAllCachedData}
          onClearAll={clearAllAppData}
          coachEnabled={coachEnabled}
          aboutMeText={coachMemory.aboutMe}
          onSaveAboutMe={coachMemory.saveAboutMe}
          onClearAboutMe={coachMemory.clearAboutMe}
          pendingInferences={coachMemory.pendingInferences}
          onAcceptInference={coachMemory.acceptInference}
          onDismissInference={coachMemory.dismissInference}
          coachPersona={coachMemory.coachPersona}
          onSaveCoachPersona={coachMemory.saveCoachPersona}
          athleteId={athleteId}
          authSession={session}
          onLogout={onLogout}
          themeMode={theme.mode}
          onSetThemeMode={theme.setMode}
          mimOverrides={mimCalibration.allOverrides}
          mimLastCalibrated={mimCalibration.lastCalibrated}
          onSetMIMManual={mimCalibration.setManualOverride}
          onResetMIM={mimCalibration.resetOverride}
          onRecalibrateMIM={mimCalibration.calibrate}
        />
      )}

      {/* Bottom Tab Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 14px)' }}
      >
        {TABS.map(t => {
          const active = view === t.id
          return (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 pt-2.5 pb-2 min-h-[60px] transition-colors relative ${
                active ? 'text-teal-700' : 'text-slate-400'
              }`}
            >
              <span className="relative">
                <TabIcon id={t.id} active={active} />
                {!!t.badge && (
                  <span className="absolute -top-1 -right-2 w-3 h-3 rounded-full bg-amber-500 border-2 border-white" />
                )}
              </span>
              <span className={`text-[11px] leading-tight ${active ? 'font-semibold' : 'font-medium'}`}>{t.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

function TabIcon({ id, active }: { id: string; active: boolean }) {
  const color = active ? '#0f766e' : '#94a3b8'
  const size = 24
  const sw = active ? 2.2 : 1.8
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (id) {
    case 'summary':
      return <svg {...common}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
    case 'plan':
      return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
    case 'dashboard':
      return <svg {...common}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
    case 'coach':
      return <svg {...common}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
    case 'settings':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
    default:
      return <svg {...common}><circle cx="12" cy="12" r="10" /></svg>
  }
}
