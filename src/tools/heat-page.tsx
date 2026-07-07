import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { ToolShell, Field, inputCls } from './ToolShell'
import { heatPlan } from './toolMath'

function HeatPlanner() {
  const [raceDate, setRaceDate] = useState('')
  const [highF, setHighF] = useState('85')
  const plan = raceDate ? heatPlan(raceDate, parseFloat(highF)) : null

  return (
    <ToolShell
      title="Race-Day Heat Planner"
      tagline="When to start acclimating, what the protocol is, and how to race the temperature — the same doctrine our coach applies."
      toolId="tool-heat"
    >
      <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Race date">
            <input className={inputCls} type="date"
              value={raceDate} onChange={e => setRaceDate(e.target.value)} />
          </Field>
          <Field label="Expected high (°F)">
            <input className={inputCls} type="number" inputMode="numeric" min="30" max="130"
              value={highF} onChange={e => setHighF(e.target.value)} />
          </Field>
        </div>

        {!plan && (
          <p className="text-slate-500 mt-1">Pick your race date to build the timeline.</p>
        )}

        {plan && !plan.hot && (
          <div className="rounded-lg bg-slate-100 px-4 py-3 mt-2">
            <p className="font-semibold">Good news — that's not a heat race.</p>
            <p className="text-slate-600 mt-1">{plan.raceDayNote}</p>
          </div>
        )}

        {plan && plan.hot && (
          <div className="mt-2 space-y-3">
            {plan.steps.map((s, i) => (
              <div key={i} className="rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">{s.window}</p>
                <p className="text-slate-700 mt-1">{s.action}</p>
              </div>
            ))}
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="font-semibold text-amber-900">Race-day pacing</p>
              <p className="text-amber-900 mt-1">{plan.raceDayNote}</p>
            </div>
            <p className="text-sm text-slate-500">
              Why this works: 7–10 days of heat exposure grows plasma volume and sweat response —
              most of the adaptation lands in the first 4–6 days, and it holds with a top-up every
              third day. End every heat session fully rehydrated.
            </p>
          </div>
        )}
      </div>
    </ToolShell>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HeatPlanner />
  </StrictMode>,
)
