import { useState, useMemo, useEffect, useCallback } from 'react'
import type { ViewId, CoachSnapshot } from './types'
import { plans } from './data'
import { useStrava } from './hooks/useStrava'
import { useGarmin } from './hooks/useGarmin'
import { useCompliance } from './hooks/useCompliance'
import { useManualLog } from './hooks/useManualLog'
import { useDaySwap } from './hooks/useDaySwap'
import { useReadiness } from './hooks/useReadiness'
import { useSoreness } from './hooks/useSoreness'
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
import { useHRZones } from './hooks/useHRZones'

// Auto-clear stale caches on app startup when data format changes
checkStorageVersion()

function getAthleteFromHash(): string {
  const hash = window.location.hash.replace('#', '').toLowerCase()
  if (hash in plans) return hash
  return 'mike'
}

export default function App() {
  const [view, setView] = useState<ViewId>('summary')
  const [athleteId, setAthleteId] = useState(getAthleteFromHash)
  const [chatSeed, setChatSeed] = useState<string | null>(null)
  const plan = plans[athleteId]
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
  const soreness = useSoreness(athleteId)
  const hrZones = useHRZones(athleteId, plan.zones)
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
    let w = plan.weeks
    w = daySwap.applySwapsToWeeks(w)
    if (showStrava && strava.activities.length > 0) {
      w = matchActivitiesToPlan(w, strava.activities)
    }
    // Garmin detail enriches/overrides Strava actuals
    if (garmin.connected && Object.keys(garmin.activityDetails).length > 0) {
      w = mergeGarminDetailIntoWeeks(w, garmin.activityDetails)
    }
    w = manualLog.applyLogsToWeeks(w)
    return w
  }, [plan.weeks, strava.activities, showStrava, manualLog.applyLogsToWeeks, daySwap.applySwapsToWeeks, garmin.connected, garmin.activityDetails])

  const compliance = useCompliance(weeks)
  const raceName = plan.race.distance.includes('18K') ? 'BROKEN ARROW 18K' : 'BROKEN ARROW 11K'

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
    maxHR: plan.athlete.maxHR,
    todayPlannedWorkout,
    currentWeekNum,
    raceDate: plan.race.date,
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
    // Gate on having at least some data — without readiness or performance
    // the LLM has nothing useful to say.
    if (!readiness.todayScore && readiness.performance.length === 0) return null
    const snap = buildCoachSnapshot({
      athleteProfile: plan.athlete,
      race: plan.race,
      zones: plan.zones,
      raceDistanceMiles: plan.race.distanceMiles,
      raceElevationFt: parseInt((plan.race.elevation || '0').replace(/[^0-9]/g, ''), 10) || 0,
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
    return snap
  }, [
    coachEnabled,
    plan.athlete,
    plan.race,
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

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      {/* Header */}
      <div className="bg-slate-800 text-white px-3 py-2.5">
        <h1 className="text-lg font-bold tracking-tight leading-tight">{raceName}</h1>
        <p className="text-slate-300 text-xs mt-0.5">
          10-Week Training Plan · {plan.athlete.name} · Max HR: {plan.athlete.maxHR}
        </p>
        <p className="text-teal-400 text-[10px] mt-0.5">{plan.athlete.weeklyStructure}</p>
      </div>

      {/* Proactive coach ping toast */}
      {coachEnabled && (
        <CoachPingToast
          unreadCount={coachMemory.unreadCount}
          onOpen={() => setView('coach')}
          onDismiss={() => coachTelemetry.logInteraction('toast_dismissed')}
        />
      )}

      {/* Tab nav */}
      <div className="flex border-b border-slate-200 bg-white sticky top-0 z-10">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors relative ${
              view === t.id
                ? 'text-teal-700 border-b-2 border-teal-600'
                : 'text-slate-500'
            }`}
          >
            {t.label}
            {t.badge ? (
              <span className="ml-1 inline-flex items-center justify-center text-[10px] min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white align-middle">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Content */}
      {view === 'summary' && (
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
          coachEnabled={coachEnabled}
          dailyInsight={dailyInsight.insight}
          dailyInsightLoading={dailyInsight.loading}
          onAskCoach={handleAskCoach}
          coachName={coachMemory.coachPersona?.name}
          onRegenerateDailyInsight={dailyInsight.regenerate}
        />
      )}
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
        />
      )}
      {view === 'dashboard' && (
        <Dashboard
          weeks={weeks}
          compliance={compliance}
          raceDate={plan.race.date}
          planZones={hrZones.zones}
          athleteMaxHR={plan.athlete.maxHR}
          todayScore={readiness.todayScore}
          weekScores={readiness.weekScores}
          todayHealth={todayHealth}
          healthHistory={garmin.healthData}
          dailyTrimp={readiness.dailyTrimp}
          performance={readiness.performance}
          weeklyRecommendations={readiness.weeklyRecommendations}
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
        />
      )}
      {/* Methodology moved into Settings as a collapsible subsection */}
      {view === 'info' && <RaceInfo race={plan.race} />}
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
          hrZonesMaxHR={plan.athlete.maxHR}
          onSaveHRZones={hrZones.save}
          onResetHRZones={hrZones.reset}
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
        />
      )}
    </div>
  )
}
