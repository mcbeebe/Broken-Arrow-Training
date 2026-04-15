import type { RaceInfo as RaceInfoType } from '../types'

interface RaceInfoProps {
  race: RaceInfoType
}

export default function RaceInfo({ race }: RaceInfoProps) {
  return (
    <div className="px-4 py-4 space-y-4">
      <h2 className="text-xl font-bold text-slate-800">Race Day: {race.name}</h2>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-2 text-base">
        <p><strong>Date:</strong> {race.date} at {race.startTime}</p>
        <p><strong>Distance:</strong> {race.distance} · {race.elevation}</p>
        <p><strong>Elevation:</strong> {race.elevationRange}</p>
        <p><strong>Course:</strong> {race.course}</p>
        <p><strong>Cutoff:</strong> {race.cutoff}</p>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <h3 className="font-semibold text-base text-slate-800 mb-2">Course Landmarks</h3>
        <div className="space-y-2 text-sm text-slate-600">
          {race.landmarks.map((lm, i) => (
            <p key={i}><strong>{lm.segment}:</strong> {lm.description}</p>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <h3 className="font-semibold text-base text-slate-800 mb-2">Gear Checklist</h3>
        <div className="text-sm text-slate-600 space-y-1">
          {race.gear.map((g, i) => (
            <p key={i}>{g.required ? '✅' : '📋'} {g.item}</p>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <h3 className="font-semibold text-base text-slate-800 mb-2">Nutrition Strategy</h3>
        <p className="text-sm text-slate-600">{race.nutrition}</p>
      </div>

      <div className="bg-teal-50 rounded-xl p-3 border border-teal-200">
        <p className="text-sm text-teal-700">🎉 {race.loriNote}</p>
      </div>
    </div>
  )
}
