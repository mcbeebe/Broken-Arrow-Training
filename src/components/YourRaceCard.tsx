import { useMemo, useRef, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts'
import type { RaceInfo } from '../types'
import type { CourseSegment } from '../types/course'
import { resolveCourseForRace } from '../utils/resolveCourse'
import { parseGpx } from '../data/gpx'
import { synthesizeCourseFromGpx } from '../utils/gpxCourse'
import { saveUserCourse } from '../utils/userCourses'
import { weeksUntilRace } from '../utils/raceCountdown'
import Course3DPreview from './Course3DPreview'

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
  climb: 'text-amber-600 dark:text-amber-300',
  descent: 'text-blue-600 dark:text-blue-300',
  flat: 'text-slate-500 dark:text-slate-300',
  rolling: 'text-emerald-600 dark:text-emerald-300',
}

function formatDistance(distanceMi: number, distanceKm: number): string {
  return distanceKm < 100
    ? `${distanceMi.toFixed(1)} mi · ${distanceKm.toFixed(0)} km`
    : `${distanceMi.toFixed(1)} mi`
}

/** RaceInfo.date is a human-readable string ("Friday, June 19, 2026") in
 *  plan files but YYYY-MM-DD elsewhere. `new Date(...)` parses both; the
 *  fallback returns the original string when neither path resolves. */
function formatRaceDate(date: string | undefined): string | null {
  if (!date) return null
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

/**
 * "Your Race" — surfaces the user's target course as the protagonist on
 * Summary. Compact card that matches the existing app's dense, info-rich
 * visual language (RaceReadyHeroCard scale). Curated courses carry the
 * richest data; non-curated races get an estimated card (distance + vert)
 * with a GPX-upload affordance that upgrades it to a full profile,
 * segments, and course-aware pacing.
 */
export default function YourRaceCard({ race }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [show3D, setShow3D] = useState(false)
  // Bumped after a GPX upload so the card re-resolves against the registry.
  const [courseVersion, setCourseVersion] = useState(0)
  const [gpxError, setGpxError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const resolution = useMemo(
    () => resolveCourseForRace(race ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [race, courseVersion],
  )
  if (!resolution || !race) return null
  const { course, source } = resolution

  async function onGpxFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !race) return
    try {
      const xml = await file.text()
      const synthesized = synthesizeCourseFromGpx(race, parseGpx(xml))
      if (!synthesized) throw new Error('No usable route in that file')
      if (!saveUserCourse(race, synthesized)) throw new Error('Could not save the course')
      setGpxError(null)
      setShow3D(false)
      setCourseVersion(v => v + 1)
    } catch (err) {
      setGpxError(err instanceof Error ? err.message : 'Could not read that GPX file')
    }
  }
  const has3DCourseData = course.elevationProfile.some(
    p => p.latitude != null && p.longitude != null,
  )

  const weeksOut = weeksUntilRace(race.date)
  const countdown = weeksOut !== null && weeksOut >= 0
    ? `${weeksOut}w to go`
    : weeksOut !== null && weeksOut < 0
      ? 'done'
      : null
  const formattedDate = formatRaceDate(race.date)

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-intelligence-700 dark:text-intelligence-300">
            Your race
            {source === 'gpx' && (
              <span className="ml-1.5 normal-case tracking-normal text-[10px] font-medium text-emerald-600 dark:text-emerald-300">from your GPX</span>
            )}
            {source === 'estimated' && (
              <span className="ml-1.5 normal-case tracking-normal text-[10px] font-medium text-slate-400 dark:text-slate-500">estimated</span>
            )}
          </p>
          <p className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5 leading-snug truncate">
            {course.name}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {formattedDate}
            {course.location?.label ? ` · ${course.location.label}` : ''}
          </p>
        </div>
        {countdown && (
          <span className="shrink-0 inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-intelligence-50 dark:bg-intelligence-950 text-intelligence-700 dark:text-intelligence-300">
            {countdown}
          </span>
        )}
      </div>

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
            {course.verticalGainFt > 0 || source === 'curated'
              ? `${course.verticalGainFt.toLocaleString()} ft`
              : '—'}
          </dd>
        </div>
        {course.peakAltitudeFt > 0 && (
          <div>
            <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Peak</dt>
            <dd className="font-semibold text-slate-800 dark:text-white leading-snug">
              {course.peakAltitudeFt.toLocaleString()} ft
            </dd>
          </div>
        )}
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

      {source !== 'curated' && (
        <div className="mt-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".gpx,application/gpx+xml"
            className="hidden"
            onChange={onGpxFile}
            aria-label="Upload course GPX"
          />
          {source === 'estimated' ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full text-xs font-medium px-3 py-1.5 rounded-md bg-intelligence-50 dark:bg-intelligence-950 text-intelligence-700 dark:text-intelligence-200 hover:bg-intelligence-100 dark:hover:bg-intelligence-900 transition-colors flex items-center justify-center gap-1.5"
            >
              <span aria-hidden>⛰</span> Upload GPX — unlock profile, segments & pacing
            </button>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-[10px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              Replace GPX
            </button>
          )}
          {gpxError && (
            <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">{gpxError}</p>
          )}
        </div>
      )}

      {has3DCourseData && (
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
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300"
            aria-expanded={expanded}
          >
            <span>{course.segments.length} named segments</span>
            <span aria-hidden>{expanded ? '▴' : '▾'}</span>
          </button>
          {expanded && (
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

          {course.aidStations.length > 0 && expanded && (
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
  )
}
