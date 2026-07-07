import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { ToolShell, Field, inputCls } from './ToolShell'
import { fuelingPlan } from './toolMath'

function FuelingPlanner() {
  const [miles, setMiles] = useState('31')
  const [hours, setHours] = useState('7')
  const plan = fuelingPlan(parseFloat(miles), parseFloat(hours))

  return (
    <ToolShell
      title="Trail Fueling Planner"
      tagline="How many carbs per hour your race actually needs — the same tiers our coach prescribes."
      toolId="tool-fueling"
    >
      <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
        <Field label="Race distance (miles)">
          <input className={inputCls} type="number" inputMode="decimal" min="1"
            value={miles} onChange={e => setMiles(e.target.value)} />
        </Field>
        <Field label="Expected finish time (hours)">
          <input className={inputCls} type="number" inputMode="decimal" min="0.5" step="0.5"
            value={hours} onChange={e => setHours(e.target.value)} />
        </Field>

        {plan && plan.gPerHour === 0 && (
          <div className="rounded-lg bg-slate-100 px-4 py-3 mt-2">
            <p className="font-semibold">Under ~90 minutes: no in-race fueling needed.</p>
            <p className="text-slate-600 mt-1">
              Start well-fueled, drink to thirst, and eat afterward. Save the gels for your long runs.
            </p>
          </div>
        )}

        {plan && plan.gPerHour > 0 && (
          <div className="mt-2 space-y-3">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
              <p className="text-3xl font-bold text-emerald-800">{plan.gPerHour} g/hr</p>
              <p className="text-emerald-900">carbohydrate target for {miles} miles</p>
            </div>
            <ul className="text-slate-700 space-y-1.5">
              <li>≈ <b>{plan.totalCarbsG} g total</b> over your {hours}-hour effort — about <b>{plan.gels} gels</b> (25 g each), or the mix of chews/drink/real food you can stomach.</li>
              <li>Use <b>multiple transportable carbs</b> (glucose + fructose) at 75 g/hr and above — a single sugar source caps absorption.</li>
              <li><b>Train your gut {plan.gutTrainingWeeks}:</b> practice this exact intake on your long runs. Race day is a terrible time to discover what your stomach thinks of it.</li>
              <li>{plan.caffeineNote}</li>
            </ul>
          </div>
        )}
      </div>
    </ToolShell>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FuelingPlanner />
  </StrictMode>,
)
