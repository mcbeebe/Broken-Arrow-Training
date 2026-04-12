import { useState } from 'react'
import type { ViewId } from './types'
import { mikePlan } from './data'
import WeeklyPlan from './components/WeeklyPlan'
import HRZones from './components/HRZones'
import RaceInfo from './components/RaceInfo'

const TABS: { id: ViewId; label: string }[] = [
  { id: 'plan', label: 'Weekly Plan' },
  { id: 'zones', label: 'HR Zones' },
  { id: 'info', label: 'Race Info' },
]

export default function App() {
  const [view, setView] = useState<ViewId>('plan')
  const plan = mikePlan

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      {/* Header */}
      <div className="bg-slate-800 text-white px-4 py-5">
        <h1 className="text-xl font-bold tracking-tight">BROKEN ARROW 18K</h1>
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
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
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
      {view === 'plan' && <WeeklyPlan weeks={plan.weeks} />}
      {view === 'zones' && <HRZones zones={plan.zones} maxHR={plan.athlete.maxHR} />}
      {view === 'info' && <RaceInfo race={plan.race} />}
    </div>
  )
}
