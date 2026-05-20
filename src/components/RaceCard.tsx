import { useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts'
import type { RaceInfo } from '../types'
import type { CourseSegment } from '../types/course'
import type { RaceReadinessDetail, RaceReadinessSummary } from '../utils/raceReadiness'
import { resolveCourseForRace } from '../utils/resolveCourse'
import { weeksUntilRace } from '../utils/raceCountdown'
import { hasTerrainAsset } from '../data/terrain'
import Course3DPreview from './Course3DPreview'

interface Props {
  race: RaceInfo | null | undefined
  readiness?: RaceReadinessSummary | null
  readinessDetail?: RaceReadinessDetail | null
  onOpenReadiness?: () => void
}

const SEGMENT_GLYPH: Record<CourseSegment['type'], string> = {
  climb: '↗',
  descent: '↘',
  flat: '→',
  rolling: '↗↘',
}

const SEGMENT_TONE: Record<CourseSegment['type'], string> = {
  climb: 'text-amber-600 dark:text-amber-300',
  descent: 'text-blue-600 dark:text-blue-300',
  flat: 'text-slate-500 dark:text-slate-300',
  rolling: 'text-emerald-600 dark:text-emerald-300',
}

const GAP_TONE: Record<RaceReadinessSummary['gap'], { ring: string; pill: string; pillText: string }> = {
  'on-track': { ring: 'stroke-emerald-500', pill: 'bg-emerald-100 dark:bg-emerald-950', pillText: 'text-emerald-700 dark:text-emerald-300' },
  fitness: { ring: 'stroke-blue-500', pill: 'bg-blue-100 dark:bg-blue-950', pillText: 'text-blue-700 dark:text-blue-300' },
  vert: { ring: 'stroke-violet-500', pill: 'bg-violet-100 dark:bg-violet-950', pillText: 'text-violet-700 dark:text-violet-300' },
  taper: { ring: 'stroke-amber-500', pill: 'bg-amber-100 dark:bg-amber-950', pillText: 'text-amber-700 dark:text-amber-300' },
}

const GAP_LABEL: Record<RaceReadinessSummary['gap'], string> = {
  'on-track': 'on track',
  fitness: 'fitness gap',
  vert: 'vert gap',
  taper: 'taper window',
}

function formatDistance(distanceMi: number, distanceKm: number): string {
  return distanceKm < 100
    ? `${distanceMi.toFixed(1)} mi · ${distanceKm.toFixed(0)} km`
    : `${distanceMi.toFixed(1)} mi`
}

function formatRaceDate(date: string | undefined): string | null {
  if (!date) return null
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

/**
 * Combined "Your race + Race readiness" section. Collapsed by default —
 * the header surfaces race name, countdown, readiness % and gap headline
 * at a glance; expanding reveals course details (date, location, profile,
 * segments) and the readiness "next N weeks" prescription.
 */
export default function RaceCard({ race, readiness, readinessDetail, onOpenReadiness }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [segmentsOpen, setSegmentsOpen] = useState(false)
  const [show3D, setShow3D] = useState(false)
  const resolution = resolveCourseForRace(race ?? null)
  if (!resolution || !race) return null
  const { course } = resolution
  const terrainAvailable = hasTerrainAsset(course.id)

  const weeksOut = weeksUntilRace(race.date)
  const countdown = weeksOut !== null && weeksOut >= 0
    ? `${weeksOut}w to go`
    : weeksOut !== null && weeksOut < 0
      ? 'done'
      : null
  const formattedDate = formatRaceDate(race.date)

  const tone = readiness ? GAP_TONE[readiness.gap] : null
  const circumference = 2 * Math.PI * 24
  const offset = readiness ? circumference * (1 - readiness.pct / 100) : 0

  const horizonWeeks = readinessDetail?.horizonWeeks ?? (readiness ? Math.min(readiness.weeksLeft, 3) : 0)
  const actionText = readinessDetail?.specificNextAction ?? readiness?.nextAction
  const horizonLabel = horizonWeeks <= 1 ? 'This week' : `Next ${horizonWeeks} weeks`

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          {readiness && tone ? (
            <div className="relative shrink-0">
              <svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true">
                <circle cx="30" cy="30" r="24" fill="none" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="5" />
                <circle
                  cx="30"
                  cy="30"
                  r="24"
                  fill="none"
                  className={tone.ring}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  transform="rotate(-90 30 30)"
                />
              </svg>
              <span
                className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-800 dark:text-white"
                aria-label={`${readiness.pct} percent ready`}
              >
                {readiness.pct}%
              </span>
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-medium uppercase tracking-wide text-intelligence-700 dark:text-intelligence-300">
                Your race
              </p>
              {countdown && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-intelligence-50 dark:bg-intelligence-950 text-intelligence-700 dark:text-intelligence-300">
                  {countdown}
                </span>
              )}
              {readiness && tone && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${tone.pill} ${tone.pillText}`}>
                  {GAP_LABEL[readiness.gap]}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5 leading-snug truncate">
              {course.name}
            </p>
            {readiness ? (
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-snug line-clamp-2">
                {readiness.headline}
              </p>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {formattedDate}
                {course.location?.label ? ` · ${course.location.label}` : ''}
              </p>
            )}
          </div>
          <span aria-hidden className="text-slate-400 dark:text-slate-500 text-sm shrink-0">
            {expanded ? '▴' : '▾'}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-700">
          <div className="pt-3">
            {readiness && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {formattedDate}
                {course.location?.label ? ` · ${course.location.label}` : ''}
              </p>
            )}

            <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-1 text-sm">
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Distance</dt>
                <dd className="font-semibold text-slate-800 dark:text-white leading-snug">
                  {formatDistance(course.distanceMi, course.distanceKm)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Vertical</dt>
                <dd className="font-semibold text-slate-800 dark:text-white leading-snug">
                  {course.verticalGainFt.toLocaleString()} ft
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Peak</dt>
                <dd className="font-semibold text-slate-800 dark:text-white leading-snug">
                  {course.peakAltitudeFt.toLocaleString()} ft
                </dd>
              </div>
            </dl>

            {course.elevationProfile.length >= 2 && !show3D && (
              <div className="mt-2 h-16">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={course.elevationProfile} margin={{ top: 4, right: 0, left: -28, bottom: -8 }}>
                    <defs>
                      <linearGradient id={`elev-${course.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F97316" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#F97316" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="mile" hide />
                    <YAxis hide domain={['dataMin', 'dataMax']} />
                    <Area
                      type="monotone"
                      dataKey="elevationFt"
                      stroke="#EA580C"
                      strokeWidth={1.5}
                      fill={`url(#elev-${course.id})`}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {terrainAvailable && (
              <div className="mt-2">
                {!show3D ? (
                  <button
                    type="button"
                    onClick={() => setShow3D(true)}
                    className="w-full text-xs font-medium px-3 py-1.5 rounded-md bg-intelligence-50 dark:bg-intelligence-950 text-intelligence-700 dark:text-intelligence-200 hover:bg-intelligence-100 dark:hover:bg-intelligence-900 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span aria-hidden>⛰</span> See your course
                  </button>
                ) : (
                  <Course3DPreview course={course} onClose={() => setShow3D(false)} />
                )}
              </div>
            )}

            {course.segments.length > 0 && (
              <div className="mt-2 border-t border-slate-100 dark:border-slate-700 pt-2">
                <button
                  type="button"
                  onClick={() => setSegmentsOpen(v => !v)}
                  className="w-full flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300"
                  aria-expanded={segmentsOpen}
                >
                  <span>{course.segments.length} named segments</span>
                  <span aria-hidden>{segmentsOpen ? '▴' : '▾'}</span>
                </button>
                {segmentsOpen && (
                  <ul className="mt-2 space-y-1.5">
                    {course.segments.map(seg => (
                      <li key={seg.id} className="rounded-md bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                            <span className={`mr-1 ${SEGMENT_TONE[seg.type]}`} aria-hidden>
                              {SEGMENT_GLYPH[seg.type]}
                            </span>
                            {seg.name}
                          </p>
                          <span className={`text-[10px] font-semibold ${SEGMENT_TONE[seg.type]}`}>
                            {seg.avgGradePct > 0 ? '+' : ''}{seg.avgGradePct.toFixed(1)}%
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                          Mi {seg.startMile.toFixed(1)}–{seg.endMile.toFixed(1)} · {Math.abs(seg.netVerticalFt).toLocaleString()} ft {seg.netVerticalFt < 0 ? 'loss' : 'gain'} · {seg.surfaces.join(', ')}
                        </p>
                        {seg.trainingAnalog && (
                          <p className="text-[11px] text-slate-700 dark:text-slate-200 mt-1 leading-snug">
                            <span className="font-medium text-intelligence-700 dark:text-intelligence-300">Train: </span>
                            {seg.trainingAnalog}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {course.aidStations.length > 0 && segmentsOpen && (
                  <div className="mt-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Aid stations
                    </p>
                    <ul className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 space-y-0.5">
                      {course.aidStations.map(aid => (
                        <li key={aid.id}>
                          <span className="font-medium text-slate-800 dark:text-slate-100">{aid.name}</span>
                          {' '}— mi {aid.mile.toFixed(1)}{aid.crewAccess ? ' · crew' : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {readiness && actionText && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                <span className="font-semibold">{horizonLabel}:</span> {actionText}
              </p>
              {onOpenReadiness && (
                <button
                  type="button"
                  onClick={onOpenReadiness}
                  className="mt-2 text-xs font-medium text-intelligence-700 dark:text-intelligence-300 hover:underline"
                  aria-label={`Open race readiness details — ${readiness.pct}% ready, ${GAP_LABEL[readiness.gap]}`}
                >
                  Tap for the full week-by-week breakdown →
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
