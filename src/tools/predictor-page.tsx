import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { ToolShell, Field, inputCls } from './ToolShell'
import { finishScenarios, formatHms } from './toolMath'

function parseTimeToSeconds(raw: string): number {
  const parts = raw.trim().split(':').map(Number)
  if (parts.some(isNaN)) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

function Predictor() {
  const [recentDist, setRecentDist] = useState('13.1')
  const [recentTime, setRecentTime] = useState('1:45:00')
  const [targetDist, setTargetDist] = useState('18')
  const [targetVert, setTargetVert] = useState('5000')

  const scenarios = finishScenarios(
    parseFloat(recentDist),
    parseTimeToSeconds(recentTime),
    parseFloat(targetDist),
    parseFloat(targetVert),
  )

  return (
    <ToolShell
      title="Vert-Adjusted Finish Predictor"
      tagline="Your flat fitness, translated to a mountain course — Daniels VDOT plus real grade-cost physics (Minetti)."
      toolId="tool-predictor"
    >
      <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
        <p className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">A recent race you're proud of</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Distance (miles)">
            <input className={inputCls} type="number" inputMode="decimal" min="1"
              value={recentDist} onChange={e => setRecentDist(e.target.value)} />
          </Field>
          <Field label="Finish time (h:mm:ss)">
            <input className={inputCls} type="text" placeholder="1:45:00"
              value={recentTime} onChange={e => setRecentTime(e.target.value)} />
          </Field>
        </div>

        <p className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3 mt-2">The race you're predicting</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Distance (miles)">
            <input className={inputCls} type="number" inputMode="decimal" min="1"
              value={targetDist} onChange={e => setTargetDist(e.target.value)} />
          </Field>
          <Field label="Total climb (feet)">
            <input className={inputCls} type="number" inputMode="numeric" min="0" step="100"
              value={targetVert} onChange={e => setTargetVert(e.target.value)} />
          </Field>
        </div>

        {scenarios && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-3">
                <p className="text-xs font-semibold text-emerald-700 uppercase">Optimistic</p>
                <p className="text-lg font-bold text-emerald-900">{formatHms(scenarios.optimisticSeconds)}</p>
                <p className="text-[11px] text-emerald-700">strong descender</p>
              </div>
              <div className="rounded-lg bg-teal-50 border-2 border-teal-300 px-2 py-3">
                <p className="text-xs font-semibold text-teal-700 uppercase">Realistic</p>
                <p className="text-xl font-bold text-teal-900">{formatHms(scenarios.realisticSeconds)}</p>
                <p className="text-[11px] text-teal-700">energy-cost model</p>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-2 py-3">
                <p className="text-xs font-semibold text-amber-700 uppercase">Conservative</p>
                <p className="text-lg font-bold text-amber-900">{formatHms(scenarios.conservativeSeconds)}</p>
                <p className="text-[11px] text-amber-700">+ late-race fade</p>
              </div>
            </div>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>Current fitness: <b>VDOT {scenarios.vdot}</b> → flat {targetDist} mi ≈ <b>{formatHms(scenarios.flatSeconds)}</b></li>
              <li>Terrain cost: climbing + descending this course costs <b>{Math.round((scenarios.vertMultiplier - 1) * 100)}% more energy</b> than flat running (Minetti grade-cost model, out-and-back approximation).</li>
              <li className="text-slate-500">Assumes runnable trail and race-day conditions. Heat, altitude, and technicality add time this simple model can't see — our full engine can.</li>
            </ul>
          </div>
        )}
      </div>
    </ToolShell>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Predictor />
  </StrictMode>,
)
