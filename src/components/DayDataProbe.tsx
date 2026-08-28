import { useState } from 'react'
import type { GarminActivityDetail } from '../types'

/**
 * Owner-only diagnostic (Settings → Deploy Diagnostics): fetch ONE
 * date's Garmin activity details straight from the server, show
 * exactly what came back, and overwrite the local cache with it —
 * probe and cure in one tap. Built for the field case where a day's
 * cached details were missing an activity (the swallowed erg TT) and
 * nothing on-device could show whether the gap was server data or
 * local cache.
 */

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function DayDataProbe({ cachedDetails, onProbe }: {
  cachedDetails: Record<string, GarminActivityDetail[]>
  onProbe: (date: string) => Promise<GarminActivityDetail[]>
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [result, setResult] = useState<GarminActivityDetail[] | null>(null)
  const [cachedBefore, setCachedBefore] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const probe = async () => {
    setLoading(true)
    setError(null)
    setCachedBefore((cachedDetails[date] ?? []).length)
    try {
      setResult(await onProbe(date))
    } catch (e) {
      setError((e as Error).message)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const row = (d: GarminActivityDetail) => {
    const dur = d.movingDurationSeconds || d.durationSeconds || 0
    const meters = d.distanceMeters ?? 0
    return (
      <div key={d.activityId} className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-mono text-slate-700 dark:text-slate-200 truncate">{d.type}</span>
        <span className="text-slate-500 dark:text-slate-400 shrink-0">
          {fmtDur(dur)}{meters > 0 ? ` · ${Math.round(meters)} m` : ' · 0 m'}{d.averageHR ? ` · ${Math.round(d.averageHR)} bpm` : ''}
        </span>
      </div>
    )
  }

  return (
    <div className="mt-3 border-t border-slate-100 dark:border-slate-700 pt-3" data-testid="day-data-probe">
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Day data probe</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
        Fetches this date's Garmin activities fresh from the server and replaces the local cache for that day — the day card re-derives immediately.
      </p>
      <div className="flex gap-2 mt-2">
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="flex-1 h-9 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-xs text-slate-700 dark:text-slate-200"
          data-testid="probe-date"
        />
        <button
          onClick={probe}
          disabled={loading}
          className="h-9 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold disabled:opacity-50"
          data-testid="probe-run"
        >
          {loading ? 'Probing…' : 'Probe'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-rose-600">Probe failed: {error}</p>}

      {result != null && !error && (
        <div className="mt-2 bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-2" data-testid="probe-result">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">
            Server returned {result.length} activit{result.length === 1 ? 'y' : 'ies'}
            {cachedBefore != null ? ` (cache had ${cachedBefore})` : ''} — cache updated.
          </p>
          {result.length > 0
            ? <div className="space-y-1">{result.map(row)}</div>
            : <p className="text-xs text-slate-400">Nothing recorded on this date.</p>}
        </div>
      )}
    </div>
  )
}
