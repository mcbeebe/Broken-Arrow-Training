import { useMemo } from 'react'
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
  const { title, paragraphs } = useMemo(() =>
    generateRaceNarrative({ race, weekNum, totalWeeks, weeks, compliance, perf }),
    [race, weekNum, totalWeeks, weeks, compliance, perf],
  )

  if (paragraphs.length === 0) return null

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 text-white">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🏔</span>
        <div>
          <p className="text-base font-bold text-white">{title}</p>
          <p className="text-xs text-slate-400">{race.name} · {race.distance} · {race.elevation}</p>
        </div>
      </div>

      <div className="space-y-3">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-sm text-slate-300 leading-relaxed">{p}</p>
        ))}
      </div>
    </div>
  )
}
