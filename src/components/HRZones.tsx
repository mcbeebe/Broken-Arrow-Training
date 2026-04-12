import type { HRZone } from '../types'

interface HRZonesProps {
  zones: HRZone[]
  maxHR: number
}

export default function HRZones({ zones, maxHR }: HRZonesProps) {
  return (
    <div className="px-4 py-4 space-y-3">
      <h2 className="text-lg font-bold text-slate-800">Heart Rate Zones</h2>
      <p className="text-xs text-slate-500">Max HR: {maxHR} bpm</p>
      {zones.map((z, i) => (
        <div key={i} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
          <div className="flex justify-between items-baseline">
            <span className="font-semibold text-sm text-slate-800">{z.zone}</span>
            <span className="text-sm font-mono text-teal-700">{z.hr} bpm</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-slate-500">{z.desc}</span>
            <span className="text-xs text-slate-400">{z.pct}</span>
          </div>
        </div>
      ))}
      <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 mt-4">
        <p className="text-sm font-semibold text-amber-800">Altitude Note</p>
        <p className="text-xs text-amber-700 mt-1">
          At race altitude (6,200–9,000 ft), expect HR to run 5–10 bpm higher than Oakland
          training. Pace by perceived effort, not HR targets.
        </p>
      </div>
    </div>
  )
}
