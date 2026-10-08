import { useMemo, useState } from 'react'
import { ToolShell, Field, inputCls } from './ToolShell'
import { MILEAGE_DISTANCES, MILEAGE_LIMITS, mileagePlan, type MileageDistance } from './mileageMath'

const PLOT_PX = 160

/** “Weekly mileage planner”: the app's own plan for one road race, week by week (initiative 003 PR 4c). */
export function MileagePlanner() {
  const [distance, setDistance] = useState<MileageDistance>('half_marathon')
  const [current, setCurrent] = useState('20')
  const [weeks, setWeeks] = useState('16')

  const currentMi = parseFloat(current)
  const plan = useMemo(() => mileagePlan(distance, currentMi, Number(weeks)), [distance, currentMi, weeks])
  const { minMi, maxMi, minWeeks, maxWeeks } = MILEAGE_LIMITS

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
            <input className={inputCls} type="number" inputMode="decimal" min={minMi} max={maxMi} step="any"
              value={current} onChange={e => setCurrent(e.target.value)} />
          </Field>
          <Field label="Weeks until your race">
            <input className={inputCls} type="number" inputMode="numeric" min={minWeeks} max={maxWeeks} step="1"
              value={weeks} onChange={e => setWeeks(e.target.value)} />
          </Field>
        </div>

        {/* Always mounted, so the prompt is announced when it appears. */}
        <p role="status" className="m-0 text-slate-600">
          {plan ? '' : `Enter ${minMi} to ${maxMi} miles a week and ${minWeeks} to ${maxWeeks} weeks.`}
        </p>

        {plan && (
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
            {plan.peakMi < currentMi && (
              <p data-mileage-ceiling className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
                Without a recent race time to set your paces, this plan tops out at {plan.peakMi} mi a week, below what you run now.
              </p>
            )}
            <figure className="m-0">
              <div aria-hidden="true" className="flex items-end gap-1 border-b-2 border-slate-300" style={{ height: PLOT_PX + 4 }}>
                {plan.weeks.map(w => (
                  <div
                    key={w.week}
                    data-week={w.week}
                    data-easier={w.easier || undefined}
                    className={`flex-1 rounded-t ${w.easier ? 'bg-teal-200' : 'bg-teal-600'}`}
                    style={{ height: Math.max(2, Math.round((w.miles / plan.peakMi) * PLOT_PX)) }}
                  />
                ))}
              </div>
              <figcaption className="mt-2 text-sm text-slate-600">Each bar is one week. Lighter bars are easier weeks.</figcaption>
            </figure>
            <details className="text-sm text-slate-600">
              <summary className="cursor-pointer font-semibold">Every week</summary>
              <table className="mt-2 w-full text-left">
                <thead>
                  <tr><th scope="col">Week</th><th scope="col">Miles</th><th scope="col">Long run</th></tr>
                </thead>
                <tbody>
                  {plan.weeks.map(w => (
                    <tr key={w.week} data-week-row={w.week}>
                      <td>{w.week}</td>
                      <td>{w.miles}{w.easier ? ' (easier)' : ''}</td>
                      <td>{w.longRunMi ? `${w.longRunMi} mi` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
            <p className="text-sm text-slate-500">
              Built on the Daniels method’s ramp: each building week is at most about 10% above the last full week, and every fourth week before the peak is easier.
              {' '}This is Attune’s plan for an intermediate runner on 5 days a week with no recent race time; your plan in the app also uses your paces and schedule.
            </p>
          </div>
        )}
      </div>
    </ToolShell>
  )
}
