import { useState, useMemo, useEffect } from 'react'
import type { ViewId } from './types'
import { plans } from './data'
import { useStrava } from './hooks/useStrava'
import { useGarmin } from './hooks/useGarmin'
import { useCompliance } from './hooks/useCompliance'
import { useManualLog } from './hooks/useManualLog'
import { useDaySwap } from './hooks/useDaySwap'
import { useReadiness } from './hooks/useReadiness'
import { matchActivitiesToPlan } from './utils/matching'
import WeeklyPlan from './components/WeeklyPlan'
import Dashboard from './components/Dashboard'
import RaceInfo from './components/RaceInfo'
import Methodology from './components/Methodology'
import Settings from './components/Settings'

function getAthleteFromHash(): string {
  const hash = window.location.hash.replace('#', '').toLowerCase()
  if (hash in plans) return hash
  return 'mike'
}

export default function App() {
  const [view, setView] = useState<ViewId>('plan')
  const [athleteId, setAthleteId] = useState(getAthleteFromHash)
  const strava = useStrava()
  const garmin = useGarmin()

  useEffect(() => {
    function onHashChange() {
      setAthleteId(getAthleteFromHash())
      setView('plan')
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const plan = plans[athleteId]
  const manualLog = useManualLog(athleteId)
  const daySwap = useDaySwap(athleteId)
  const showStrava = athleteId === 'mike' || athleteId === 'lori'

  // Only show Settings tab for Mike (Strava), show manual log for others
  const TABS: { id: ViewId; label: string }[] = showStrava
    ? [
        { id: 'plan', label: 'Plan' },
        { id: 'dashboard', label: 'Stats' },
        { id: 'method', label: 'Method' },
        { id: 'info', label: 'Race' },
        { id: 'settings', label: 'Settings' },
      ]
    : [
        { id: 'plan', label: 'Plan' },
        { id: 'dashboard', label: 'Stats' },
        { id: 'method', label: 'Method' },
        { id: 'info', label: 'Race' },
      ]

  // Merge Strava or manual log data into training plan
  const weeks = useMemo(() => {
    let w = plan.weeks
    w = daySwap.applySwapsToWeeks(w)
    if (showStrava && strava.activities.length > 0) {
      w = matchActivitiesToPlan(w, strava.activities)
    }
    w = manualLog.applyLogsToWeeks(w)
    return w
  }, [plan.weeks, strava.activities, showStrava, manualLog.applyLogsToWeeks, daySwap.applySwapsToWeeks])

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
        if (d.day === dayLabel) return d
      }
    }
    return undefined
  }, [weeks])

  // Readiness engine (combines Garmin health data + Strava/Garmin activities)
  const readiness = useReadiness({
    healthData: garmin.healthData,
    stravaActivities: strava.activities,
    garminActivities: garmin.garminActivities,
    maxHR: plan.athlete.maxHR,
    todayPlannedWorkout,
    currentWeekNum,
    raceDate: plan.race.date,
  })

  // Today's health data for banner
  const todayHealth = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return garmin.healthData.find(d => d.date === today)
  }, [garmin.healthData])

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
      {view === 'plan' && (
        <WeeklyPlan
          weeks={weeks}
          zones={plan.zones}
          manualLog={manualLog}
          daySwap={daySwap}
          todayReadiness={readiness.todayScore}
          weekReadiness={readiness.weekScores}
          todayHealth={todayHealth}
          healthHistory={garmin.healthData}
          garminConnected={garmin.connected}
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
        />
      )}
    </div>
  )
}
