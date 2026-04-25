import { useState, useMemo } from 'react'
import type { DailyTRIMP, ReadinessScore } from '../types'

interface CalendarHeatmapProps {
  dailyTrimp: DailyTRIMP[]
  readinessScores?: ReadinessScore[]
  onDayClick?: (dateIso: string) => void
}

const SPORT_COLORS: Record<string, string> = {
  running: '#059669',
  trail_running: '#10B981',
  running_steep: '#047857',
  cycling: '#3B82F6',
  ebike: '#93C5FD',
  mountain_biking: '#2563EB',
  hiking: '#D97706',
  hiking_steep: '#B45309',
  walking: '#64748B',
  swimming: '#06B6D4',
  lap_swimming: '#0891B2',
  aqua_jogging: '#22D3EE',
  strength_upper: '#A78BFA',
  strength_lower: '#7C3AED',
  strength_full: '#8B5CF6',
  hiit: '#EF4444',
  cardio: '#F97316',
  elliptical: '#F59E0B',
  rowing: '#84CC16',
  indoor_rowing: '#A3E635',
  yoga: '#EC4899',
  pilates: '#F472B6',
  breathwork: '#CBD5E1',
  myrtl: '#CBD5E1',
  running_drills: '#CBD5E1',
  other: '#94A3B8',
}

const READINESS_RING: Record<string, string> = {
  PEAK: '#6366f1',
  GREEN: '#22c55e',
  YELLOW: '#f59e0b',
  RED: '#ef4444',
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CalendarHeatmap({ dailyTrimp, readinessScores = [], onDayClick }: CalendarHeatmapProps) {
  const today = new Date()
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() })

  // Index by date
  const trimpByDate = useMemo(() => {
    const m = new Map<string, DailyTRIMP>()
    for (const d of dailyTrimp) m.set(d.date, d)
    return m
  }, [dailyTrimp])

  const readinessByDate = useMemo(() => {
    const m = new Map<string, ReadinessScore>()
    for (const r of readinessScores) m.set(r.date, r)
    return m
  }, [readinessScores])

  // Max TRIMP in view for size scaling
  const maxTrimpInView = useMemo(() => {
    let max = 0
    for (const [date, d] of trimpByDate.entries()) {
      const [y, m] = date.split('-').map(Number)
      if (y === view.year && m - 1 === view.month) {
        max = Math.max(max, d.total)
      }
    }
    return Math.max(max, 100)
  }, [trimpByDate, view])

  // Build month grid
  const grid = useMemo(() => {
    const firstDay = new Date(view.year, view.month, 1)
    const leadingBlanks = firstDay.getDay()
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
    const cells: ({ date: string; day: number } | null)[] = []
    for (let i = 0; i < leadingBlanks; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      const date = toIsoDate(new Date(view.year, view.month, d))
      cells.push({ date, day: d })
    }
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [view])

  const todayIso = toIsoDate(today)

  const prev = () => setView(v => {
    const d = new Date(v.year, v.month - 1, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const next = () => setView(v => {
    const d = new Date(v.year, v.month + 1, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-100 dark:border-slate-700">
      <div className="flex items-center justify-between mb-2">
        <button onClick={prev} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">‹</button>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {MONTH_NAMES[view.month]} {view.year}
        </p>
        <button onClick={next} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">›</button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-slate-400 dark:text-slate-500">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((cell, i) => {
          if (!cell) return <div key={i} />
          const trimp = trimpByDate.get(cell.date)
          const readiness = readinessByDate.get(cell.date)
          const primaryRecord = trimp?.records[0]
          const sport = primaryRecord?.sportType || 'other'
          const color = SPORT_COLORS[sport] || SPORT_COLORS.other
          const isToday = cell.date === todayIso
          const isFuture = cell.date > todayIso
          const dotSize = trimp
            ? 6 + Math.min(16, Math.sqrt(trimp.total / maxTrimpInView) * 16)
            : 0
          const ringColor = readiness ? READINESS_RING[readiness.status] : null

          return (
            <button
              key={i}
              onClick={() => onDayClick?.(cell.date)}
              disabled={isFuture}
              className={`aspect-square flex flex-col items-center justify-center rounded-md relative transition-colors ${
                isToday ? 'bg-teal-50 dark:bg-teal-950 ring-1 ring-teal-500' :
                isFuture ? 'opacity-30' :
                'hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <span className={`text-[10px] font-medium leading-none ${isToday ? 'text-teal-700 dark:text-teal-300' : 'text-slate-600 dark:text-slate-300'}`}>
                {cell.day}
              </span>
              {dotSize > 0 && (
                <div
                  className="rounded-full mt-0.5"
                  style={{
                    width: `${dotSize}px`,
                    height: `${dotSize}px`,
                    backgroundColor: color,
                    boxShadow: ringColor ? `0 0 0 1.5px ${ringColor}` : undefined,
                  }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-2 border-t border-slate-100 dark:border-slate-700">
        <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-600" /> Run
        </span>
        <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="w-2 h-2 rounded-full bg-violet-600" /> Strength
        </span>
        <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="w-2 h-2 rounded-full bg-blue-600" /> Cycling
        </span>
        <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="w-2 h-2 rounded-full bg-amber-600" /> Hike
        </span>
        <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
          Size = load · Ring = readiness
        </span>
      </div>
    </div>
  )
}
