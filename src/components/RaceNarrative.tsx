import { useState, useMemo } from 'react'
import type { RaceInfo, TrainingWeek, PerformanceMetrics } from '../types'
import type { WeekCompliance } from '../hooks/useCompliance'
import { generateRaceNarrative } from '../utils/raceNarrative'

interface RaceNarrativeProps {
  race: RaceInfo
  weekNum: number
  totalWeeks: number
  weeks: TrainingWeek[]
  compliance?: WeekCompliance[]
  perf?: PerformanceMetrics | null
}

export default function RaceNarrative({ race, weekNum, totalWeeks, weeks, compliance, perf }: RaceNarrativeProps) {
  const [expanded, setExpanded] = useState(true)

  const { title, paragraphs } = useMemo(() =>
    generateRaceNarrative({ race, weekNum, totalWeeks, weeks, compliance, perf }),
    [race, weekNum, totalWeeks, weeks, compliance, perf],
  )

  if (paragraphs.length === 0) return null

  return (
    <div className="mx-3 mb-3 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 text-white">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🏔</span>
          <div className="text-left">
            <p className="text-sm font-bold text-white">{title}</p>
            <p className="text-[11px] text-slate-400">{race.name} · {race.distance} · {race.elevation}</p>
          </div>
        </div>
        <span className="text-slate-400 text-sm">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {paragraphs.map((p, i) => (
            <p key={i} className="text-sm text-slate-300 leading-relaxed">{p}</p>
          ))}
        </div>
      )}
    </div>
  )
}
