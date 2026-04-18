import { useState, useMemo } from 'react'
import { parseZoneRange, HR_ZONE_TOLERANCE_BPM } from '../utils/zones'

interface ZoneBreakdownTableProps {
  heartrates: number[]
  times: number[]
  targetZone?: string
}

interface MinuteBucket {
  minute: number
  avgHR: number
  minHR: number
  maxHR: number
  inZoneSeconds: number
  outZoneSeconds: number
  totalSeconds: number
}

export default function ZoneBreakdownTable({ heartrates, times, targetZone }: ZoneBreakdownTableProps) {
  const [expanded, setExpanded] = useState(false)

  const target = targetZone ? parseZoneRange(targetZone) : null
  const tLow = target ? target.low - HR_ZONE_TOLERANCE_BPM : 0
  const tHigh = target ? target.high + HR_ZONE_TOLERANCE_BPM : 999

  const { buckets, totalInSec, totalOutSec, totalSec } = useMemo(() => {
    const bucketMap = new Map<number, { sum: number; count: number; min: number; max: number; inSec: number; outSec: number; totalSec: number }>()
    let totalInSec = 0
    let totalOutSec = 0
    let totalSec = 0

    const startTime = times[0] || 0

    for (let i = 1; i < heartrates.length; i++) {
      const hr = heartrates[i]
      const dt = times[i] - times[i - 1]
      if (dt <= 0 || dt > 60) continue

      const elapsedMin = Math.floor((times[i] - startTime) / 60)
      const existing = bucketMap.get(elapsedMin) || { sum: 0, count: 0, min: 999, max: 0, inSec: 0, outSec: 0, totalSec: 0 }

      existing.sum += hr
      existing.count += 1
      existing.min = Math.min(existing.min, hr)
      existing.max = Math.max(existing.max, hr)
      existing.totalSec += dt

      const inZone = target ? (hr >= tLow && hr <= tHigh) : false
      if (inZone) {
        existing.inSec += dt
        totalInSec += dt
      } else {
        existing.outSec += dt
        totalOutSec += dt
      }
      totalSec += dt

      bucketMap.set(elapsedMin, existing)
    }

    const buckets: MinuteBucket[] = Array.from(bucketMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([minute, data]) => ({
        minute,
        avgHR: Math.round(data.sum / data.count),
        minHR: data.min,
        maxHR: data.max,
        inZoneSeconds: Math.round(data.inSec),
        outZoneSeconds: Math.round(data.outSec),
        totalSeconds: Math.round(data.totalSec),
      }))

    return { buckets, totalInSec: Math.round(totalInSec), totalOutSec: Math.round(totalOutSec), totalSec: Math.round(totalSec) }
  }, [heartrates, times, target, tLow, tHigh])

  if (buckets.length === 0 || !target) return null

  const inPct = totalSec > 0 ? Math.round((totalInSec / totalSec) * 100) : 0

  return (
    <div className="mt-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-700">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3"
      >
        <div className="text-left">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Minute-by-Minute Zone Breakdown</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            {formatTime(totalInSec)} in / {formatTime(totalOutSec)} out of {target.low}–{target.high} bpm ({inPct}% in zone)
          </p>
        </div>
        <span className="text-slate-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-1 pb-3">
          {/* Table header */}
          <div className="grid grid-cols-[40px_1fr_1fr_1fr_60px] gap-1 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">
            <span>Min</span>
            <span className="text-right">Avg</span>
            <span className="text-right">Range</span>
            <span className="text-right">Zone</span>
            <span className="text-right">Status</span>
          </div>

          {/* Data rows */}
          <div className="max-h-[400px] overflow-y-auto">
            {buckets.map((b) => {
              const inPctMin = b.totalSeconds > 0 ? Math.round((b.inZoneSeconds / b.totalSeconds) * 100) : 0
              const isFullyIn = b.outZoneSeconds === 0
              const isFullyOut = b.inZoneSeconds === 0
              return (
                <div
                  key={b.minute}
                  className="grid grid-cols-[40px_1fr_1fr_1fr_60px] gap-1 px-2 py-1.5 text-[11px] border-b border-slate-100 dark:border-slate-700 last:border-0"
                >
                  <span className="text-slate-600 dark:text-slate-300 font-mono">{b.minute}</span>
                  <span className="text-right font-medium text-slate-700 dark:text-slate-200">{b.avgHR}</span>
                  <span className="text-right text-slate-500 dark:text-slate-400">{b.minHR}–{b.maxHR}</span>
                  <span className="text-right text-slate-500 dark:text-slate-400">
                    {isFullyIn ? (
                      <span className="text-green-600">✓ 60s</span>
                    ) : isFullyOut ? (
                      <span className="text-red-600">✗ 60s</span>
                    ) : (
                      <span>
                        <span className="text-green-600">{b.inZoneSeconds}s</span>
                        <span className="text-slate-400"> / </span>
                        <span className="text-red-600">{b.outZoneSeconds}s</span>
                      </span>
                    )}
                  </span>
                  <span className="text-right">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        inPctMin >= 75 ? 'bg-green-100 text-green-700' :
                        inPctMin >= 50 ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}
                    >
                      {inPctMin}%
                    </span>
                  </span>
                </div>
              )
            })}
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-[40px_1fr_1fr_1fr_60px] gap-1 px-2 py-2 text-[11px] font-bold border-t-2 border-slate-300 bg-slate-100 dark:bg-slate-700 rounded-b-lg mt-1">
            <span className="text-slate-700 dark:text-slate-200">Total</span>
            <span className="text-right text-slate-500 dark:text-slate-400">—</span>
            <span className="text-right text-slate-500 dark:text-slate-400">—</span>
            <span className="text-right">
              <span className="text-green-600">{formatTime(totalInSec)}</span>
              <span className="text-slate-400"> / </span>
              <span className="text-red-600">{formatTime(totalOutSec)}</span>
            </span>
            <span className="text-right">
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                  inPct >= 75 ? 'bg-green-100 text-green-700' :
                  inPct >= 50 ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}
              >
                {inPct}%
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  if (s === 0) return `${m}m`
  return `${m}m ${s}s`
}
