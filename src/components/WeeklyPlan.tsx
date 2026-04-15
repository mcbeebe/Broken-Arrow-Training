import { useState, useRef, useEffect } from 'react'
import type { TrainingWeek, PlannedDay, ActualWorkout, HRZone, ReadinessScore } from '../types'
import DayCard from './DayCard'
import VolumeChart from './VolumeChart'
import WorkoutModal from './WorkoutModal'
import ManualLog from './ManualLog'

interface WeeklyPlanProps {
  weeks: TrainingWeek[]
  zones?: HRZone[]
  manualLog?: {
    logWorkout: (dayLabel: string, data: ActualWorkout) => void
  }
  daySwap?: {
    swapDays: (weekNum: number, fromIndex: number, toIndex: number) => void
    resetWeek: (weekNum: number) => void
    hasSwaps: (weekNum: number) => boolean
  }
  weekReadiness?: ReadinessScore[]
}

export default function WeeklyPlan({
  weeks,
  zones,
  manualLog,
  daySwap,
  weekReadiness = [],
}: WeeklyPlanProps) {
  const [activeWeek, setActiveWeek] = useState(0)
  const [modalDay, setModalDay] = useState<PlannedDay | null>(null)
  const [logDay, setLogDay] = useState<PlannedDay | null>(null)
  const [swapSource, setSwapSource] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const week = weeks[activeWeek]

  useEffect(() => {
    if (scrollRef.current) {
      const activeBtn = scrollRef.current.children[activeWeek] as HTMLElement
      activeBtn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [activeWeek])

  // Tap-to-swap: first tap selects source, second tap selects target
  function handleSwapTap(index: number) {
    if (swapSource === null) {
      setSwapSource(index)
    } else if (swapSource === index) {
      // Tapped same card — cancel
      setSwapSource(null)
    } else {
      // Swap and clear
      daySwap?.swapDays(week.num, swapSource, index)
      setSwapSource(null)
    }
  }

  const showResetButton = daySwap?.hasSwaps(week.num)
  const isSwapMode = swapSource !== null

  // Build a map of date -> ReadinessScore for DayCard matching
  const readinessByDate = new Map<string, ReadinessScore>()
  for (const score of weekReadiness) {
    readinessByDate.set(score.date, score)
  }

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

      {/* Swap mode banner */}
      {isSwapMode && (
        <div className="bg-teal-600 text-white px-4 py-2 flex items-center justify-between">
          <p className="text-sm font-medium">
            Swapping {week.days[swapSource!]?.day} — tap another day to swap
          </p>
          <button
            onClick={() => setSwapSource(null)}
            className="text-xs bg-teal-700 hover:bg-teal-800 px-2 py-1 rounded-lg"
          >
            Cancel
          </button>
        </div>
      )}

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
      </div>

      {/* Day cards */}
      <div className="px-3 space-y-2">
        {week.days.map((d, i) => {
          // Match readiness to day by parsing day label to date
          const dayDateMatch = parseDayToDate(d.day, week.dates)
          const readiness = dayDateMatch ? readinessByDate.get(dayDateMatch) : undefined

          return (
            <div
              key={`${week.num}-${i}`}
              className={`transition-all rounded-xl ${
                swapSource === i ? 'ring-2 ring-teal-500 ring-offset-2 scale-[0.98]' : ''
              } ${
                isSwapMode && swapSource !== i ? 'ring-1 ring-teal-300 ring-offset-1' : ''
              }`}
            >
              <DayCard
                day={d}
                onTap={isSwapMode ? () => handleSwapTap(i) : () => setModalDay(d)}
                onLog={manualLog ? () => setLogDay(d) : undefined}
                onSwap={daySwap ? () => handleSwapTap(i) : undefined}
                isSwapSelected={swapSource === i}
                isSwapTarget={isSwapMode && swapSource !== i}
                readiness={readiness}
              />
            </div>
          )
        })}
      </div>

      {/* Volume chart */}
      <VolumeChart weeks={weeks} activeWeek={activeWeek} onWeekClick={setActiveWeek} />

      {/* Workout detail modal */}
      {modalDay && (
        <WorkoutModal
          day={modalDay}
          weekNum={week.num}
          onClose={() => setModalDay(null)}
          zones={zones}
        />
      )}

      {/* Manual log modal */}
      {logDay && manualLog && (
        <ManualLog
          dayLabel={logDay.day}
          existing={logDay.actual}
          planned={logDay}
          weekNum={week.num}
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

/**
 * Parse a day label like "4/13" into a YYYY-MM-DD string using the week dates context.
 * Week dates format: "Apr 13 – 19" → year is 2026.
 */
function parseDayToDate(dayLabel: string, _weekDates: string): string | null {
  const match = dayLabel.match(/^(\d{1,2})\/(\d{1,2})/)
  if (!match) return null
  const month = match[1].padStart(2, '0')
  const day = match[2].padStart(2, '0')
  return `2026-${month}-${day}`
}
