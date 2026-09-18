import type { SorenessLevel } from '../hooks/useSoreness'

/**
 * The two check-in windows on a day. "How does your body feel right now?"
 * is asked twice at most: once in the morning, before the day's session
 * (until 10 AM), and once in the evening (from the athlete's evening hour,
 * 6 PM by default — the same hour the Today page turns into the evening
 * close). Between them the question is not asked; the morning answer
 * stands. One answer per window: answering again in the same window
 * replaces it, never adds a third.
 */
export type CheckInWindow = 'morning' | 'evening'

export const MORNING_CLOSE_HOUR = 10

export function checkInWindowAt(now: Date, eveningHour = 18): CheckInWindow | null {
  const h = now.getHours()
  if (h < MORNING_CLOSE_HOUR) return 'morning'
  if (h >= eveningHour) return 'evening'
  return null
}

function fmtHour(h: number): string {
  const suffix = h >= 12 ? 'PM' : 'AM'
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve} ${suffix}`
}

/** "Morning check-in · until 10 AM" / "Evening check-in · from 6 PM". */
export function checkInWindowLabel(window: CheckInWindow, eveningHour = 18): string {
  return window === 'morning'
    ? `Morning check-in · until ${fmtHour(MORNING_CLOSE_HOUR)}`
    : `Evening check-in · from ${fmtHour(eveningHour)}`
}

/** What the tile says when no window is open: the next one. */
export function nextCheckInLabel(now: Date, eveningHour = 18): string {
  const h = now.getHours()
  return h < eveningHour ? `Evening check-in opens at ${fmtHour(eveningHour)}` : `Morning check-in opens tomorrow`
}

export interface DayCheckIns {
  morning: SorenessLevel | null
  evening: SorenessLevel | null
  morningAt?: string
  eveningAt?: string
}

/** The five answers, shared by every check-in surface. */
export const SORENESS_OPTIONS: { level: SorenessLevel; emoji: string; label: string; color: string; activeBg: string }[] = [
  { level: 1, emoji: '💚', label: 'Fresh',      color: 'text-green-700',  activeBg: 'bg-green-100 ring-2 ring-green-400' },
  { level: 2, emoji: '👍', label: 'Normal',     color: 'text-slate-600',  activeBg: 'bg-slate-100 ring-2 ring-slate-400' },
  { level: 3, emoji: '😣', label: 'Sore',       color: 'text-amber-700',  activeBg: 'bg-amber-100 ring-2 ring-amber-400' },
  { level: 4, emoji: '😫', label: 'Very Sore',  color: 'text-orange-700', activeBg: 'bg-orange-100 ring-2 ring-orange-400' },
  { level: 5, emoji: '🔥', label: 'Wrecked',    color: 'text-red-700',    activeBg: 'bg-red-100 ring-2 ring-red-400' },
]

export function sorenessOption(level: SorenessLevel) {
  return SORENESS_OPTIONS.find(o => o.level === level)!
}

/** "6:52am" from an ISO timestamp, local time. */
export function fmtClock(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const h = d.getHours(), m = d.getMinutes()
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`
}
