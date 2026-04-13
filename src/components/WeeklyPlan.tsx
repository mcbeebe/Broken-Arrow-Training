import { useState, useRef, useEffect } from 'react'
import type { TrainingWeek, PlannedDay, ActualWorkout } from '../types'
import DayCard from './DayCard'
import VolumeChart from './VolumeChart'
import WorkoutModal from './WorkoutModal'
import ManualLog from './ManualLog'

interface WeeklyPlanProps {
  weeks: TrainingWeek[]
  manualLog?: {
    logWorkout: (dayLabel: string, data: ActualWorkout) => void
  }
  daySwap?: {
    swapDays: (weekNum: number, fromIndex: number, toIndex: number) => void
    resetWeek: (weekNum: number) => void
    hasSwaps: (weekNum: number) => boolean
  }
}

export default function WeeklyPlan({ weeks, manualLog, daySwap }: WeeklyPlanProps) {
  const [activeWeek, setActiveWeek] = useState(0)
  const [modalDay, setModalDay] = useState<PlannedDay | null>(null)
  const [logDay, setLogDay] = useState<PlannedDay | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [, setTouchStartY] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const week = weeks[activeWeek]

  useEffect(() => {
    if (scrollRef.current) {
      const activeBtn = scrollRef.current.children[activeWeek] as HTMLElement
      activeBtn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [activeWeek])

  // Desktop drag handlers
  function handleDragStart(index: number) {
    setDragIndex(index)
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    setDragOverIndex(index)
  }

  function handleDrop(index: number) {
    if (dragIndex !== null && dragIndex !== index && daySwap) {
      daySwap.swapDays(week.num, dragIndex, index)
    }
    setDragIndex(null)
    setDragOverIndex(null)
  }

  function handleDragEnd() {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  // Touch drag handlers for mobile
  function handleTouchStart(index: number, e: React.TouchEvent) {
    setDragIndex(index)
    setTouchStartY(e.touches[0].clientY)
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (dragIndex === null) return
    const touch = e.touches[0]
    // Find which card the touch is over
    for (let i = 0; i < cardRefs.current.length; i++) {
      const el = cardRefs.current[i]
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        setDragOverIndex(i)
        break
      }
    }
  }

  function handleTouchEnd() {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex && daySwap) {
      daySwap.swapDays(week.num, dragIndex, dragOverIndex)
    }
    setDragIndex(null)
    setDragOverIndex(null)
    setTouchStartY(null)
  }

  const showResetButton = daySwap?.hasSwaps(week.num)

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
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-slate-800">Week {week.num}</span>
              <span className="text-sm text-slate-500">{week.dates}</span>
              <span className="text-sm font-semibold text-teal-600">~{week.miles} mi</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">{week.focus}</p>
          </div>
          {showResetButton && (
            <button
              onClick={() => daySwap?.resetWeek(week.num)}
              className="text-xs text-amber-600 hover:text-amber-800 font-medium px-2 py-1 rounded-lg border border-amber-200 hover:bg-amber-50 transition-colors"
            >
              ↩ Reset
            </button>
          )}
        </div>
        {daySwap && (
          <p className="text-[10px] text-slate-400 mt-1">Long-press and drag cards to swap workouts between days</p>
        )}
      </div>

      {/* Day cards */}
      <div className="px-3 space-y-2">
        {week.days.map((d, i) => (
          <div
            key={`${week.num}-${i}`}
            ref={el => { cardRefs.current[i] = el }}
            draggable={!!daySwap}
            onDragStart={() => handleDragStart(i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={() => handleDrop(i)}
            onDragEnd={handleDragEnd}
            onTouchStart={(e) => daySwap && handleTouchStart(i, e)}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={`transition-all ${
              dragIndex === i ? 'opacity-50 scale-95' : ''
            } ${
              dragOverIndex === i && dragIndex !== i ? 'ring-2 ring-teal-400 ring-offset-2 rounded-xl' : ''
            }`}
          >
            <DayCard
              day={d}
              onTap={() => setModalDay(d)}
              onLog={manualLog ? () => setLogDay(d) : undefined}
            />
          </div>
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

      {/* Manual log modal */}
      {logDay && manualLog && (
        <ManualLog
          dayLabel={logDay.day}
          existing={logDay.actual}
          onSave={(data) => {
            manualLog.logWorkout(logDay.day, data)
            setLogDay(null)
          }}
          onClose={() => setLogDay(null)}
        />
      )}
    </div>
  )
}
