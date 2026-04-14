import { useState, useMemo, useEffect, useCallback } from 'react'
import type { ViewId } from './types'
import { plans } from './data'
import { useStrava } from './hooks/useStrava'
import { useGarmin } from './hooks/useGarmin'
import { useCompliance } from './hooks/useCompliance'
import { useManualLog } from './hooks/useManualLog'
import { useDaySwap } from './hooks/useDaySwap'
import { useReadiness } from './hooks/useReadiness'
import { useSoreness } from './hooks/useSoreness'
import { matchActivitiesToPlan, mergeGarminDetailIntoWeeks } from './utils/matching'
import { calculateExerciseLoad } from './utils/trimp'
import { localDateStr } from './utils/format'
import { generateMorningCoach, generateEveningCoach, getCoachTimeOfDay } from './utils/coach'
import { checkStorageVersion, clearAllCachedData, clearAllAppData } from './utils/storageVersion'
import WeeklyPlan from './components/WeeklyPlan'
import Summary from './components/Summary'
import Dashboard from './components/Dashboard'
import RaceInfo from './components/RaceInfo'
import Methodology from './components/Methodology'
import Settings from './components/Settings'

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

  const plan = plans[athleteId]
  const manualLog = useManualLog(athleteId)
  const daySwap = useDaySwap(athleteId)
  const soreness = useSoreness(athleteId)
  const showStrava = true  // All athletes can connect Strava and Garmin

  const TABS: { id: ViewId; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'plan', label: 'Plan' },
    { id: 'dashboard', label: 'Stats' },
    { id: 'method', label: 'Method' },
    { id: 'settings', label: 'Settings' },
  ]

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

  // AI Coach recommendation
  const coachRecommendation = useMemo(() => {
    const timeOfDay = getCoachTimeOfDay()
    const latestPerf = readiness.performance.length > 0 ? readiness.performance[readiness.performance.length - 1] : null

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
  }, [readiness.todayScore, todayPlannedWorkout, tomorrowPlannedWorkout, currentWeekDays, todayDayIndex, readiness.performance, todayHealth, readiness.trainingStateInfo])

  // Handler for coach swap
  const handleCoachSwap = useCallback((fromIndex: number, toIndex: number) => {
    daySwap.swapDays(currentWeekNum, fromIndex, toIndex)
  }, [daySwap, currentWeekNum])

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      {/* Header */}
      <div className="bg-slate-800 text-white px-4 py-5">
        <h1 className="text-xl font-bold tracking-tight">{raceName}</h1>
        <p className="text-slate-300 text-sm mt-1">
          10-Week Training Plan · {plan.athlete.name} · Max HR: {plan.athlete.maxHR}
        </p>
        <p className="text-teal-400 text-xs mt-1">{plan.athlete.weeklyStructure}</p>
      </div>

      {/* Tab nav */}
      <div className="flex border-b border-slate-200 bg-white sticky top-0 z-10">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={`flex-1 py-3 text-xs sm:text-sm font-medium transition-colors ${
              view === t.id
                ? 'text-teal-700 border-b-2 border-teal-600'
                : 'text-slate-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {view === 'summary' && (
        <Summary
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
        />
      )}
      {view === 'plan' && (
        <WeeklyPlan
          weeks={weeks}
          zones={plan.zones}
          manualLog={manualLog}
          daySwap={daySwap}
          weekReadiness={readiness.weekScores}
        />
      )}
      {view === 'dashboard' && (
        <Dashboard
          weeks={weeks}
          compliance={compliance}
          raceDate={plan.race.date}
          todayScore={readiness.todayScore}
          weekScores={readiness.weekScores}
          todayHealth={todayHealth}
          healthHistory={garmin.healthData}
          dailyTrimp={readiness.dailyTrimp}
          performance={readiness.performance}
          weeklyRecommendations={readiness.weeklyRecommendations}
          garminConnected={garmin.connected}
        />
      )}
      {view === 'method' && <Methodology />}
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
          garminDisplayName={garmin.displayName}
          garminLastSync={garmin.lastSync}
          onGarminConnect={garmin.connect}
          onGarminDisconnect={garmin.disconnect}
          onGarminSync={garmin.sync}
          onClearCache={clearAllCachedData}
          onClearAll={clearAllAppData}
        />
      )}
    </div>
  )
}
