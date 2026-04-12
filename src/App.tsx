import { useState, useMemo } from 'react'
import type { ViewId } from './types'
import { mikePlan } from './data'
import { useStrava } from './hooks/useStrava'
import { useCompliance } from './hooks/useCompliance'
import { matchActivitiesToPlan } from './utils/matching'
import WeeklyPlan from './components/WeeklyPlan'
import Dashboard from './components/Dashboard'
import RaceInfo from './components/RaceInfo'
import Methodology from './components/Methodology'
import Settings from './components/Settings'

const TABS: { id: ViewId; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'dashboard', label: 'Stats' },
  { id: 'method', label: 'Method' },
  { id: 'info', label: 'Race' },
  { id: 'settings', label: 'Settings' },
]

export default function App() {
  const [view, setView] = useState<ViewId>('plan')
  const strava = useStrava()

  // Merge Strava activities into training plan
  const weeks = useMemo(() => {
    if (strava.activities.length === 0) return mikePlan.weeks
    return matchActivitiesToPlan(mikePlan.weeks, strava.activities)
  }, [strava.activities])

  const compliance = useCompliance(weeks)

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      {/* Header */}
      <div className="bg-slate-800 text-white px-4 py-5">
        <h1 className="text-xl font-bold tracking-tight">BROKEN ARROW 18K</h1>
        <p className="text-slate-300 text-sm mt-1">
          10-Week Training Plan · {mikePlan.athlete.name} · Max HR: {mikePlan.athlete.maxHR}
        </p>
        <p className="text-teal-400 text-xs mt-1">{mikePlan.athlete.weeklyStructure}</p>
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
      {view === 'plan' && <WeeklyPlan weeks={weeks} />}
      {view === 'dashboard' && (
        <Dashboard weeks={weeks} compliance={compliance} raceDate={mikePlan.race.date} />
      )}
      {view === 'method' && <Methodology />}
      {view === 'info' && <RaceInfo race={mikePlan.race} />}
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
