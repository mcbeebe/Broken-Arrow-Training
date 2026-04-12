import { useState, useRef, useEffect } from 'react'
import type { TrainingWeek, PlannedDay } from '../types'
import DayCard from './DayCard'
import VolumeChart from './VolumeChart'
import WorkoutModal from './WorkoutModal'

interface WeeklyPlanProps {
  weeks: TrainingWeek[]
}

export default function WeeklyPlan({ weeks }: WeeklyPlanProps) {
  const [activeWeek, setActiveWeek] = useState(0)
  const [modalDay, setModalDay] = useState<PlannedDay | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const week = weeks[activeWeek]

  useEffect(() => {
    if (scrollRef.current) {
      const activeBtn = scrollRef.current.children[activeWeek] as HTMLElement
      activeBtn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [activeWeek])

  return (
    <div className="pb-6">
      {/* Week selector */}
      <div ref={scrollRef} className="flex overflow-x-auto gap-1.5 px-3 py-3 bg-white border-b border-slate-100">
        {weeks.map((w, i) => (
          <button
            key={w.num}
            onClick={() => setActiveWeek(i)}
            className={`shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              activeWeek === i
                ? 'bg-slate-800 text-white shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <div>Wk {w.num}</div>
            <div className="text-[10px] opacity-75">
              {typeof w.miles === 'number' ? `${w.miles} mi` : w.miles}
            </div>
          </button>
        ))}
      </div>

      {/* Week header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-slate-800">Week {week.num}</span>
          <span className="text-sm text-slate-500">{week.dates}</span>
          <span className="text-sm font-semibold text-teal-600">~{week.miles} mi</span>
        </div>
        <p className="text-xs text-slate-500 mt-1">{week.focus}</p>
      </div>

      {/* Day cards */}
      <div className="px-3 space-y-2">
        {week.days.map((d, i) => (
          <DayCard key={i} day={d} onTap={() => setModalDay(d)} />
        ))}
      </div>

      {/* Volume chart */}
      <VolumeChart weeks={weeks} activeWeek={activeWeek} onWeekClick={setActiveWeek} />

      {/* Workout detail modal */}
      {modalDay && (
        <WorkoutModal
          day={modalDay}
          weekNum={week.num}
          onClose={() => setModalDay(null)}
        />
      )}
    </div>
  )
}
