import type { TrainingWeek } from '../types'
import { getMilesNumber } from '../utils/format'

interface VolumeChartProps {
  weeks: TrainingWeek[]
  activeWeek: number
  onWeekClick: (index: number) => void
}

export default function VolumeChart({ weeks, activeWeek, onWeekClick }: VolumeChartProps) {
  const maxMiles = Math.max(...weeks.map(w => getMilesNumber(w.miles)))

  return (
    <div className="px-4 mt-6">
      <h3 className="text-sm font-semibold text-slate-700 mb-2">Volume Progression</h3>
      <div className="flex items-end gap-1 h-24">
        {weeks.map((w, i) => {
          const mi = getMilesNumber(w.miles)
          const pct = maxMiles > 0 ? (mi / maxMiles) * 100 : 0
          return (
            <div key={w.num} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[9px] text-slate-500">{mi}</span>
              <div
                className="w-full rounded-t transition-all cursor-pointer"
                style={{
                  height: `${pct}%`,
                  backgroundColor: activeWeek === i ? '#0D9488' : '#CBD5E1',
                  minHeight: 4,
                }}
                onClick={() => onWeekClick(i)}
              />
              <span className="text-[9px] text-slate-400">{w.num}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
