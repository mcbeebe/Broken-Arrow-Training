import { useState, useRef, useEffect, useMemo } from 'react'
import type { TrainingWeek, PlannedDay, ActualWorkout, HRZone, ReadinessScore, PerformanceMetrics, CoachSnapshot } from '../types'
import { getWorkoutStyle } from '../utils/styles'
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
  athleteId?: string
  coachEnabled?: boolean
  latestPerf?: PerformanceMetrics | null
  coachSnapshot?: CoachSnapshot | null
  onAskCoach?: (seed: string) => void
}

function todayDateString(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export default function WeeklyPlan({
  weeks,
  zones,
  manualLog,
  daySwap,
  weekReadiness = [],
  athleteId,
  coachEnabled,
  latestPerf,
  coachSnapshot,
  onAskCoach,
}: WeeklyPlanProps) {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [activeWeek, setActiveWeek] = useState(0)
  const [modalDay, setModalDay] = useState<PlannedDay | null>(null)
  const [logDay, setLogDay] = useState<PlannedDay | null>(null)
  const [swapSource, setSwapSource] = useState<number | null>(null)
  const [calMonth, setCalMonth] = useState(() => {
    // Start on current month
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const week = weeks[activeWeek]

  // Build a date→PlannedDay lookup for the calendar
  const daysByDate = useMemo(() => {
    const map = new Map<string, PlannedDay>()
    for (const w of weeks) {
      for (const d of w.days) {
        const iso = parseDayToDate(d.day, w.dates)
        if (iso) map.set(iso, d)
      }
    }
    return map
  }, [weeks])

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
      {/* View toggle: List / Calendar */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1 bg-white border-b border-slate-100">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
            }`}
          >
            List
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'calendar' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
            }`}
          >
            Calendar
          </button>
        </div>
        {viewMode === 'calendar' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCalMonth(prev => {
                const d = new Date(prev.year, prev.month - 1, 1)
                return { year: d.getFullYear(), month: d.getMonth() }
              })}
              className="text-sm text-slate-500 hover:text-slate-700 px-1"
            >‹</button>
            <span className="text-sm font-medium text-slate-700 min-w-[100px] text-center">
              {new Date(calMonth.year, calMonth.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={() => setCalMonth(prev => {
                const d = new Date(prev.year, prev.month + 1, 1)
                return { year: d.getFullYear(), month: d.getMonth() }
              })}
              className="text-sm text-slate-500 hover:text-slate-700 px-1"
            >›</button>
          </div>
        )}
      </div>

      {/* ── Calendar view ── */}
      {viewMode === 'calendar' && (
        <CalendarGrid
          year={calMonth.year}
          month={calMonth.month}
          daysByDate={daysByDate}
          readinessByDate={readinessByDate}
          onDayTap={d => setModalDay(d)}
        />
      )}

      {/* ── List view (existing) ── */}
      {viewMode === 'list' && (
      <>
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
                weekNum={week.num}
                onTap={isSwapMode ? () => handleSwapTap(i) : () => setModalDay(d)}
                onLog={manualLog ? () => setLogDay(d) : undefined}
                onSwap={daySwap ? () => handleSwapTap(i) : undefined}
                isSwapSelected={swapSource === i}
                isSwapTarget={isSwapMode && swapSource !== i}
                readiness={readiness}
                coachEnabled={coachEnabled}
                isToday={dayDateMatch === todayDateString()}
                athleteId={athleteId}
                coachSnapshot={coachSnapshot}
                onAskCoach={onAskCoach}
              />
            </div>
          )
        })}
      </div>

      {/* Volume chart */}
      <VolumeChart weeks={weeks} activeWeek={activeWeek} onWeekClick={setActiveWeek} />
      </>
      )}

      {/* Workout detail modal (shared by both views) */}
      {modalDay && (
        <WorkoutModal
          day={modalDay}
          weekNum={week.num}
          onClose={() => setModalDay(null)}
          zones={zones}
          athleteId={athleteId}
          coachEnabled={coachEnabled}
          readiness={(() => {
            const d = parseDayToDate(modalDay.day, week.dates)
            return d ? readinessByDate.get(d) : undefined
          })()}
          latestPerf={latestPerf}
          coachSnapshot={coachSnapshot}
          onAskCoach={onAskCoach}
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
 * Parse a day label like "Mon 4/13" into a YYYY-MM-DD string.
 */
function parseDayToDate(dayLabel: string, _weekDates: string): string | null {
  const match = dayLabel.match(/(\d{1,2})\/(\d{1,2})/)
  if (!match) return null
  const month = match[1].padStart(2, '0')
  const day = match[2].padStart(2, '0')
  return `2026-${month}-${day}`
}

// ─── Calendar Grid ──────────────────────────────────────────────

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function CalendarGrid({
  year, month, daysByDate, readinessByDate, onDayTap,
}: {
  year: number
  month: number
  daysByDate: Map<string, PlannedDay>
  readinessByDate: Map<string, ReadinessScore>
  onDayTap: (d: PlannedDay) => void
}) {
  const today = todayDateString()

  // Build the grid: first, find what day-of-week the month starts on (Mon=0)
  const firstOfMonth = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // getDay(): 0=Sun → shift to Mon=0
  const startDow = (firstOfMonth.getDay() + 6) % 7

  // Build cells: leading blanks + days of month
  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  // Trailing blanks to fill the last row
  while (cells.length % 7 !== 0) cells.push(null)
  const numRows = cells.length / 7

  return (
    // Flex column that fills remaining viewport height below the header/toggle.
    // Approx 11rem budget is taken by the app header, tab bar, and view toggle.
    <div className="flex flex-col px-3 pt-2 pb-3 gap-1" style={{ height: 'calc(100vh - 11rem)' }}>
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 shrink-0">
        {DAY_HEADERS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-slate-400 py-0.5">{d}</div>
        ))}
      </div>
      {/* Day cells — equal-height rows that stretch to fill remaining height */}
      <div
        className="grid grid-cols-7 gap-1 flex-1 min-h-0"
        style={{ gridTemplateRows: `repeat(${numRows}, minmax(0, 1fr))` }}
      >
        {cells.map((dayNum, i) => {
          if (dayNum === null) return <div key={`blank-${i}`} />
          const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
          const planned = daysByDate.get(iso)
          const isToday = iso === today
          const readiness = readinessByDate.get(iso)

          if (!planned) {
            // Day exists in month but no plan entry — grey cell
            return (
              <div key={iso} className={`rounded-lg p-1.5 ${isToday ? 'ring-2 ring-teal-500' : 'bg-slate-50'}`}>
                <span className="text-sm text-slate-300">{dayNum}</span>
              </div>
            )
          }

          const style = getWorkoutStyle(planned.type)
          const isDone = !!planned.actual
          const bg = isDone ? '#D1FAE5' : style.bg

          // Readiness dot
          const dotColor = readiness?.status === 'PEAK' ? 'bg-indigo-500'
            : readiness?.status === 'YELLOW' ? 'bg-amber-400'
            : readiness?.status === 'RED' ? 'bg-red-500'
            : null

          return (
            <button
              key={iso}
              onClick={() => onDayTap(planned)}
              className={`rounded-lg p-1.5 text-left transition-all active:scale-95 overflow-hidden flex flex-col ${
                isToday ? 'ring-2 ring-teal-500 ring-offset-1' : ''
              }`}
              style={{ backgroundColor: bg, borderLeft: `3px solid ${style.border}` }}
            >
              <div className="flex items-center justify-between shrink-0">
                <span className={`text-sm font-bold ${isToday ? 'text-teal-700' : 'text-slate-700'}`}>{dayNum}</span>
                {dotColor && <span className={`w-2 h-2 rounded-full ${dotColor}`} />}
              </div>
              <div className="flex items-center gap-0.5 mt-0.5 shrink-0">
                <span className="text-base leading-none">{style.label}</span>
                {isDone && <span className="text-xs text-emerald-700 font-bold">✓</span>}
              </div>
              <p className="text-[10px] font-medium text-slate-700 mt-0.5 line-clamp-2 leading-tight flex-1 min-h-0">
                {planned.workout}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
