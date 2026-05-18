import { useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts'
import type { RaceInfo } from '../types'
import type { CourseSegment } from '../types/course'
import { resolveCourseForRace } from '../utils/resolveCourse'
import { weeksUntilRace } from '../utils/raceCountdown'
import { MetricCard } from './primitives'

interface Props {
  race: RaceInfo | null | undefined
}

const SEGMENT_GLYPH: Record<CourseSegment['type'], string> = {
  climb: '↗',
  descent: '↘',
  flat: '→',
  rolling: '↗↘',
}

const SEGMENT_TONE: Record<CourseSegment['type'], string> = {
  climb: 'text-amber-700 dark:text-amber-300',
  descent: 'text-blue-700 dark:text-blue-300',
  flat: 'text-slate-600 dark:text-slate-300',
  rolling: 'text-emerald-700 dark:text-emerald-300',
}

function formatVertical(ft: number): string {
  return `${ft.toLocaleString()} ft`
}

function formatDistance(distanceMi: number, distanceKm: number): string {
  return distanceKm < 100
    ? `${distanceKm.toFixed(1)} km · ${distanceMi.toFixed(1)} mi`
    : `${distanceMi.toFixed(1)} mi`
}

/**
 * "Your Race" — surfaces the user's target course as the protagonist on
 * Summary. Curated courses (Broken Arrow 11K/18K seeded today) render the
 * full named-segment treatment with runner-language training analogs.
 * Unknown races resolve to a generic Course and render the same shape with
 * less detail, plus a "we don't have detailed data yet" note.
 *
 * The first thing every user sees about their race when they open the app.
 */
export default function YourRaceCard({ race }: Props) {
  const [expanded, setExpanded] = useState(false)
  const resolution = resolveCourseForRace(race ?? null)
  if (!resolution || !race) return null
  const { course } = resolution

  const weeksOut = weeksUntilRace(race.date)
  const countdown = weeksOut !== null && weeksOut >= 0
    ? `${weeksOut} ${weeksOut === 1 ? 'week' : 'weeks'} to go`
    : weeksOut !== null && weeksOut < 0
      ? 'Race day passed'
      : null

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <header className="px-4 py-3 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-intelligence-700 dark:text-intelligence-300">
            Your Race
          </p>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50 truncate">
            {course.name}
          </h3>
          {race.date && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {new Date(`${race.date}T00:00:00`).toLocaleDateString(undefined, {
                weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
              })}
              {course.location?.label ? ` · ${course.location.label}` : ''}
            </p>
          )}
        </div>
        {countdown && (
          <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-intelligence-500 text-white dark:bg-intelligence-600">
            {countdown}
          </span>
        )}
      </header>

      <div className="px-4 py-3 grid grid-cols-3 gap-2">
        <MetricCard label="Distance" value={formatDistance(course.distanceMi, course.distanceKm)} />
        <MetricCard label="Vertical Gain" value={formatVertical(course.verticalGainFt)} />
        <MetricCard label="Peak Altitude" value={formatVertical(course.peakAltitudeFt)} />
      </div>

      {course.elevationProfile.length >= 2 && (
        <div className="px-4 pb-2">
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={course.elevationProfile} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id={`elev-${course.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F97316" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#F97316" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="mile" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={32}
                  tickFormatter={v => `${(v / 1000).toFixed(1)}k`} />
                <Area type="monotone" dataKey="elevationFt" stroke="#EA580C" strokeWidth={2}
                  fill={`url(#elev-${course.id})`} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {course.segments.length > 0 && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 py-2"
          >
            <span>{course.segments.length} Named segments</span>
            <span aria-hidden>{expanded ? '▴' : '▾'}</span>
          </button>
          {expanded && (
            <ul className="space-y-2">
              {course.segments.map(seg => (
                <li key={seg.id} className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                      <span className={`mr-1.5 ${SEGMENT_TONE[seg.type]}`} aria-hidden>
                        {SEGMENT_GLYPH[seg.type]}
                      </span>
                      {seg.name}
                    </p>
                    <span className={`text-xs font-semibold ${SEGMENT_TONE[seg.type]}`}>
                      {seg.avgGradePct > 0 ? '+' : ''}{seg.avgGradePct.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Mile {seg.startMile.toFixed(1)}–{seg.endMile.toFixed(1)} · {Math.abs(seg.netVerticalFt).toLocaleString()} ft {seg.netVerticalFt < 0 ? 'loss' : 'gain'}
                    {' · '}{seg.surfaces.join(', ')}
                  </p>
                  {seg.trainingAnalog && (
                    <p className="text-xs text-slate-700 dark:text-slate-200 mt-1.5 leading-snug">
                      <span className="font-semibold text-intelligence-700 dark:text-intelligence-300">Train it: </span>
                      {seg.trainingAnalog}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {course.aidStations.length > 0 && expanded && (
        <div className="px-4 pb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
            Aid stations
          </p>
          <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
            {course.aidStations.map(aid => (
              <li key={aid.id}>
                <span className="font-semibold text-slate-800 dark:text-slate-100">{aid.name}</span>
                {' '}— mile {aid.mile.toFixed(1)}
                {aid.crewAccess ? ' · crew access' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  )
}
