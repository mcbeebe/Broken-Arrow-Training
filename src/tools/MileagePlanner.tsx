import { useState } from 'react'
import { ToolShell, Field, inputCls } from './ToolShell'
import { mileagePlan, MILEAGE_DISTANCES, type MileageDistance } from './toolMath'

const PLOT_PX = 160

/** “Weekly mileage planner”: the app's own ramp for one road race (initiative 003 PR 4c). */
export function MileagePlanner() {
  const [distance, setDistance] = useState<MileageDistance>('half_marathon')
  const [current, setCurrent] = useState('20')
  const [weeks, setWeeks] = useState('16')

  const plan = mileagePlan(distance, parseFloat(current), Number(weeks))
  const max = plan ? Math.max(...plan.weeks.map(w => w.miles)) : 1

  return (
    <ToolShell
      title="Weekly mileage planner"
      tagline="How many miles a week to build to, and how fast, for your next race."
      toolId="tool-mileage"
    >
      <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
        <Field label="Race">
          <select className={inputCls} value={distance} onChange={e => setDistance(e.target.value as MileageDistance)}>
            {MILEAGE_DISTANCES.map(d => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Miles you run a week now">
            <input className={inputCls} type="number" inputMode="decimal" min="1" max="200"
              value={current} onChange={e => setCurrent(e.target.value)} />
          </Field>
          <Field label="Weeks until your race">
            <input className={inputCls} type="number" inputMode="numeric" min="4" max="24" step="1"
              value={weeks} onChange={e => setWeeks(e.target.value)} />
          </Field>
        </div>

        {plan ? (
          <div className="mt-1 space-y-4" data-mileage-result>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-3">
                <p className="text-sm text-slate-600">Start at</p>
                <p className="text-xl font-bold text-slate-900">{plan.startMi} mi</p>
                <p className="text-sm text-slate-600">a week</p>
              </div>
              <div className="rounded-lg bg-teal-50 border-2 border-teal-300 px-2 py-3">
                <p className="text-sm text-teal-800">Peak at</p>
                <p className="text-xl font-bold text-teal-900">{plan.peakMi} mi</p>
                <p className="text-sm text-teal-800">in week {plan.peakWeek}</p>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-3">
                <p className="text-sm text-slate-600">Longest run</p>
                <p className="text-xl font-bold text-slate-900">{plan.longestRunMi} mi</p>
              </div>
            </div>
            <figure className="m-0">
              <div
                role="img"
                aria-label={`Weekly miles for ${plan.weeks.length} weeks, from ${plan.startMi} to a peak of ${plan.peakMi} in week ${plan.peakWeek}, then a taper to race day.`}
                className="flex items-end gap-1 border-b-2 border-slate-300"
                style={{ height: PLOT_PX + 4 }}
              >
                {plan.weeks.map(w => (
                  <div
                    key={w.week}
                    data-week={w.week}
                    data-easier={w.easier || undefined}
                    title={`Week ${w.week}: ${w.miles} mi`}
                    className={`flex-1 rounded-t ${w.easier ? 'bg-teal-200' : 'bg-teal-600'}`}
                    style={{ height: Math.max(2, Math.round((w.miles / max) * PLOT_PX)) }}
                  />
                ))}
              </div>
              <figcaption className="mt-2 text-sm text-slate-600">Each bar is one week. Lighter bars are easier weeks.</figcaption>
            </figure>
            <p className="text-sm text-slate-500">
              Built on the Daniels method’s ramp: each building week is at most about 10% above the last full week, and every fourth week of the build is easier.
            </p>
          </div>
        ) : (
          <p className="text-slate-600" role="status">Enter 1 to 200 miles a week and 4 to 24 weeks.</p>
        )}
      </div>
    </ToolShell>
  )
}
