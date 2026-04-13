import { useState, useMemo, useEffect, useCallback } from 'react'
import type { ViewId } from './types'
import { plans } from './data'
import { useStrava } from './hooks/useStrava'
import { useCompliance } from './hooks/useCompliance'
import { useManualLog } from './hooks/useManualLog'
import { useDaySwap } from './hooks/useDaySwap'
import { matchActivitiesToPlan } from './utils/matching'
import WeeklyPlan from './components/WeeklyPlan'
import Dashboard from './components/Dashboard'
import RaceInfo from './components/RaceInfo'
import Methodology from './components/Methodology'
import Settings from './components/Settings'
import ProfileSwitcher from './components/ProfileSwitcher'

const TABS: { id: ViewId; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'dashboard', label: 'Stats' },
  { id: 'method', label: 'Method' },
  { id: 'info', label: 'Race' },
  { id: 'settings', label: 'Settings' },
]

function getAthleteFromHash(): string {
  const hash = window.location.hash.replace('#', '').toLowerCase()
  if (hash in plans) return hash
  return 'mike'
}

export default function App() {
  const [view, setView] = useState<ViewId>('plan')
  const [athleteId, setAthleteId] = useState(getAthleteFromHash)

  const switchAthlete = useCallback((id: string) => {
    setAthleteId(id)
    window.location.hash = id
    setView('plan')
  }, [])

  // Listen for hash changes (back/forward buttons)
  useEffect(() => {
    function onHashChange() {
      setAthleteId(getAthleteFromHash())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  const plan = plans[athleteId]
  const strava = useStrava()
  const manualLog = useManualLog(athleteId)
  const daySwap = useDaySwap(athleteId)

  // Merge Strava or manual log data into training plan
  const weeks = useMemo(() => {
    let w = plan.weeks
    // Apply day swaps first
    w = daySwap.applySwapsToWeeks(w)
    // Apply Strava data (Mike)
    if (athleteId === 'mike' && strava.activities.length > 0) {
      w = matchActivitiesToPlan(w, strava.activities)
    }
    // Apply manual logs (all athletes)
    w = manualLog.applyLogsToWeeks(w)
    return w
  }, [plan.weeks, strava.activities, athleteId, manualLog.applyLogsToWeeks, daySwap.applySwapsToWeeks])

  const compliance = useCompliance(weeks)
  const raceName = plan.race.distance.includes('18K') ? 'BROKEN ARROW 18K' : 'BROKEN ARROW 11K'

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      {/* Header */}
      <div className="bg-slate-800 text-white px-4 py-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{raceName}</h1>
            <p className="text-slate-300 text-sm mt-1">
              10-Week Training Plan · {plan.athlete.name} · Max HR: {plan.athlete.maxHR}
            </p>
            <p className="text-teal-400 text-xs mt-1">{plan.athlete.weeklyStructure}</p>
          </div>
          <ProfileSwitcher athleteId={athleteId} onSwitch={switchAthlete} />
        </div>
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
          manualLog={manualLog}
          daySwap={daySwap}
        />
      )}
      {view === 'dashboard' && (
        <Dashboard weeks={weeks} compliance={compliance} raceDate={plan.race.date} />
      )}
      {view === 'method' && <Methodology />}
      {view === 'info' && <RaceInfo race={plan.race} />}
      {view === 'settings' && (
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
        />
      )}
    </div>
  )
}
