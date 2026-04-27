import { useEffect, useState, type ReactNode } from 'react'
import type { PlannedDay, HRZone, ReadinessScore, PerformanceMetrics, CoachSnapshot, TRIMPRecord } from '../types'
import { getWorkoutStyle, adaptBg } from '../utils/styles'
import { getCoaching } from '../utils/coaching'
import { generateWorkoutTake } from '../utils/coachNotes'
import CoachWorkoutTakeView from './CoachWorkoutTake'
import { useCoachInsight } from '../hooks/useCoachInsight'
import { formatMiles, formatSeconds, formatPace, estimateRunTime } from '../utils/format'
import { parseRoutine, type ParsedExercise } from '../utils/exercises'
import { parseIntervalWorkout, getDrillDay, RUNNING_DRILLS, MYRTL_ROUTINE, PRE_RUN_ACTIVATION, type RunSegment, type DrillGuide } from '../utils/drills'
import { fetchActivityStreams, getTokens, isTokenExpired, refreshAccessToken, type StreamData } from '../utils/strava'
import { fetchGarminActivityStream } from '../utils/garmin'
import { classifyRun, getSportMultiplier, calculateElevationBonus, describeMIMEngine } from '../utils/trimp'
import { SPORT_LABELS } from '../hooks/useMIMCalibration'
import HRChart from './HRChart'
import PaceChart from './PaceChart'
import ElevationChart from './ElevationChart'
import RouteMap from './RouteMap'

interface MileSplit {
  mile: number
  time: number
  pace: string
  avgHR: number
  elevGain: number
}

function computeMileSplits(stream: StreamData): MileSplit[] {
  const { distance, time, heartrate, altitude } = stream
  if (!distance || distance.length < 2) return []

  const METERS_PER_MILE = 1609.344
  const splits: MileSplit[] = []
  let mileStart = 0
  let mileNum = 1

  for (let i = 1; i < distance.length; i++) {
    const totalDist = distance[i]
    const nextMileBoundary = mileNum * METERS_PER_MILE

    if (totalDist >= nextMileBoundary) {
      const segTime = time[i] - time[mileStart]
      const paceSecPerMile = segTime > 0 ? segTime : 0
      const pm = Math.floor(paceSecPerMile / 60)
      const ps = Math.round(paceSecPerMile % 60)

      let hrSum = 0, hrCount = 0
      for (let j = mileStart; j <= i; j++) {
        if (heartrate[j] > 0) { hrSum += heartrate[j]; hrCount++ }
      }

      let elevGain = 0
      if (altitude && altitude.length > i) {
        for (let j = mileStart + 1; j <= i; j++) {
          const diff = altitude[j] - altitude[j - 1]
          if (diff > 0) elevGain += diff
        }
      }

      splits.push({
        mile: mileNum,
        time: segTime,
        pace: `${pm}:${ps.toString().padStart(2, '0')}`,
        avgHR: hrCount > 0 ? Math.round(hrSum / hrCount) : 0,
        elevGain: Math.round(elevGain * 3.28084),
      })

      mileStart = i
      mileNum++
    }
  }

  // Partial last mile
  const lastDist = distance[distance.length - 1]
  const partialMiles = (lastDist - (mileNum - 1) * METERS_PER_MILE) / METERS_PER_MILE
  if (partialMiles >= 0.1) {
    const segTime = time[distance.length - 1] - time[mileStart]
    const paceSecPerMile = partialMiles > 0 ? segTime / partialMiles : 0
    const pm = Math.floor(paceSecPerMile / 60)
    const ps = Math.round(paceSecPerMile % 60)

    let hrSum = 0, hrCount = 0
    for (let j = mileStart; j < distance.length; j++) {
      if (heartrate[j] > 0) { hrSum += heartrate[j]; hrCount++ }
    }

    let elevGain = 0
    if (altitude && altitude.length >= distance.length) {
      for (let j = mileStart + 1; j < distance.length; j++) {
        const diff = altitude[j] - altitude[j - 1]
        if (diff > 0) elevGain += diff
      }
    }

    splits.push({
      mile: mileNum,
      time: segTime,
      pace: `${pm}:${ps.toString().padStart(2, '0')}`,
      avgHR: hrCount > 0 ? Math.round(hrSum / hrCount) : 0,
      elevGain: Math.round(elevGain * 3.28084),
    })
  }

  return splits
}

interface WorkoutModalProps {
  day: PlannedDay
  weekNum: number
  onClose: () => void
  zones?: HRZone[]
  athleteId?: string
  coachEnabled?: boolean
  readiness?: ReadinessScore
  latestPerf?: PerformanceMetrics | null
  coachSnapshot?: CoachSnapshot | null
  onAskCoach?: (seed: string) => void
  /** Canonical training-load record for the logged activity, if any. */
  trimpRecord?: TRIMPRecord
}

export default function WorkoutModal({ day, weekNum, onClose, zones, athleteId, coachEnabled, readiness, latestPerf, coachSnapshot, onAskCoach, trimpRecord }: WorkoutModalProps) {
  const style = getWorkoutStyle(day.type)
  const baseCoaching = getCoaching(day, weekNum)
  const actual = day.actual
  const isStrength = day.type === 'strength'
  const isQuality = day.type === 'quality'

  // When coach overrides (or plan data) provide specific exercises in the detail
  // field, show those as execution steps instead of generic type-based guidance.
  // Strength/quality workouts already parse detail into exercise/interval cards.
  const hasCustomDetail = !isStrength && !isQuality && day.detail && day.detail.includes(' · ')
  const coaching = hasCustomDetail
    ? {
        ...baseCoaching,
        execution: day.detail.split(' · ').map((s: string) => s.trim()).filter(Boolean),
      }
    : baseCoaching
  const isRunType = ['run', 'quality', 'long'].includes(day.type)
  const exercises = isStrength ? parseRoutine(day.detail) : []
  const customExercises = hasCustomDetail ? parseRoutine(day.detail) : []
  const intervals = isQuality ? parseIntervalWorkout(day.detail, day.zone) : []
  const isDrillDay = getDrillDay(weekNum) === day.day
  const [stream, setStream] = useState<StreamData | null>(null)
  const [streamLoading, setStreamLoading] = useState(false)

  // Fetch per-second stream on-demand. Prefers Garmin when available
  // (more accurate HR, pace, elevation from the watch itself), falls
  // back to Strava.
  useEffect(() => {
    if (!actual || actual.type === 'Manual') return
    let cancelled = false

    async function loadStream() {
      setStreamLoading(true)
      try {
        let data: StreamData | null = null
        // Try Garmin stream whenever we have a garminId (even if source
        // was overwritten by manual log — the watch still recorded HR)
        if (actual!.garminId) {
          data = await fetchGarminActivityStream(actual!.garminId, athleteId)
        }
        // Strava fallback (or primary source)
        if (!data && actual!.stravaId) {
          const tokens = getTokens()
          if (tokens) {
            let accessToken = tokens.accessToken
            if (isTokenExpired(tokens)) {
              const refreshed = await refreshAccessToken(tokens.refreshToken)
              accessToken = refreshed.accessToken
            }
            data = await fetchActivityStreams(accessToken, actual!.stravaId)
          }
        }
        if (!cancelled && data) {
          setStream(data)
          // Backfill avgHR from stream when the activity summary is missing it
          // (common for elliptical, rowing, and other non-standard Garmin activities)
          if (!actual!.avgHR && data.heartrate?.length) {
            const hrs = data.heartrate.filter(h => h > 0)
            if (hrs.length > 0) {
              actual!.avgHR = Math.round(hrs.reduce((s, h) => s + h, 0) / hrs.length)
              actual!.maxHR = Math.max(...hrs)
            }
          }
        }
      } catch {
        // Silently fail — stream is optional
      } finally {
        if (!cancelled) setStreamLoading(false)
      }
    }

    loadStream()
    return () => { cancelled = true }
  }, [actual, athleteId])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />

      <div
        className="relative bg-white dark:bg-slate-800 rounded-t-2xl w-full max-h-[96vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="sticky top-0 px-3 pt-3 pb-2 rounded-t-2xl z-10"
          style={{ backgroundColor: adaptBg(style.bg), borderBottom: `2px solid ${style.border}` }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{style.label}</span>
              <div>
                <p className="font-bold text-base text-slate-800 dark:text-white leading-tight">{day.day} <span className="font-normal text-sm text-slate-500 dark:text-slate-400">Wk {weekNum}</span></p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-white dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-white dark:bg-slate-800 transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="font-semibold text-base text-slate-800 dark:text-white mt-1">{day.workout}</p>
          {/* Distance + estimated running time pulled from the zone
              field (e.g. "3.0 mi · Z1–2 (108–148)"). Shown prominently
              so athletes see the actual run portion, not just total session. */}
          {(() => {
            const milesMatch = day.zone?.match(/([\d.]+)\s*mi/i)
            const miles = milesMatch ? parseFloat(milesMatch[1]) : null
            const runTime = estimateRunTime(day.zone || '')
            const hasRunDetails = miles !== null || !!runTime
            if (!hasRunDetails && day.time === '—') return null
            return (
              <div className="mt-1 space-y-0.5 text-sm text-slate-600 dark:text-slate-300">
                {hasRunDetails && (
                  <p>
                    {miles !== null && <span>📏 {miles} mi</span>}
                    {miles !== null && runTime && <span> · </span>}
                    {runTime && <span>🏃 {runTime} running</span>}
                  </p>
                )}
                {day.time !== '—' && (
                  <p>
                    ⏱ Total session: {day.time}
                    {day.route !== '—' && <> · 📍 {day.route}</>}
                  </p>
                )}
                {actual && actual.movingTime > 0 && (
                  <p className="font-medium text-teal-700">
                    ✅ Actual: {formatSeconds(actual.movingTime)}
                    {actual.distance > 0 && <> · {formatMiles(actual.distance)} mi</>}
                    {actual.avgHR ? <> · {actual.avgHR} avg HR</> : null}
                  </p>
                )}
              </div>
            )
          })()}
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Ambient Coach take — Mike-only, top of detail view */}
          {coachEnabled && (
            <CoachWorkoutTakeForDay
              day={day}
              weekNum={weekNum}
              readiness={readiness}
              latestPerf={latestPerf}
              athleteId={athleteId}
              coachSnapshot={coachSnapshot}
              onAsk={onAskCoach}
            />
          )}

          {/* Strava actual */}
          {actual && (
            <div className="bg-teal-50 dark:bg-teal-950 rounded-xl p-3 border border-teal-200 dark:border-teal-800 space-y-2">
              <p className="text-sm font-semibold text-teal-800 uppercase tracking-wide">
                {/* Source-agnostic label — just show activity name.
                    The source (Strava sync vs. Garmin) is metadata,
                    not something users need prefixed every time. */}
                {actual.source === 'manual' || actual.type === 'Manual' ? '📝 ' : '🏃 '}
                {actual.name}
              </p>
              {/* Primary Stats — Strava-style grid */}
              {(() => {
                const stats: { value: string; label: string }[] = []
                if (actual.distance > 0) stats.push({ value: formatMiles(actual.distance), label: 'Distance' })
                if (actual.movingTime > 0) stats.push({ value: formatSeconds(actual.movingTime), label: 'Moving Time' })
                if (actual.distance > 0 && actual.movingTime > 0) stats.push({ value: formatPace(actual.distance, actual.movingTime), label: 'Avg Pace' })
                if (actual.avgHR) stats.push({ value: `${actual.avgHR} bpm`, label: 'Avg Heart Rate' })
                if (actual.elevationGain > 0) stats.push({ value: `${actual.elevationGain} ft`, label: 'Elev Gain' })
                if (actual.elevationGain > 0 && actual.distance > 0) {
                  const avgGrade = (actual.elevationGain / (actual.distance * 5280)) * 100
                  stats.push({ value: `${avgGrade.toFixed(1)}%`, label: 'Avg Grade' })
                }
                if (trimpRecord && trimpRecord.adjustedTRIMP > 0) {
                  stats.push({ value: `${Math.round(trimpRecord.adjustedTRIMP)}`, label: 'Total Load' })
                }
                if (actual.calories) stats.push({ value: `${actual.calories}`, label: 'Calories' })
                if (stats.length === 0) return null
                const cols = stats.length <= 2 || stats.length === 4 ? 'grid-cols-2' : 'grid-cols-3'
                return (
                  <div className={`grid ${cols} gap-3`}>
                    {stats.map((s, i) => (
                      <div key={i} className="text-center">
                        <p className="text-2xl font-bold text-teal-800 leading-tight">{s.value}</p>
                        <p className="text-[10px] text-teal-600 uppercase tracking-wide mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                )
              })()}
              {/* Load-impact callouts — MIM tier (every logged activity)
                  + elevation bonus (when ≥+10). Mirrors DayCard so the
                  athlete sees the same credit math here and on the card. */}
              {trimpRecord && trimpRecord.adjustedTRIMP > 0 && (() => {
                // Reconstruct: adjusted = base × MIM + elev_bonus (unless
                // MIN_LOAD_FLOOR clamped it). Show the math so the athlete
                // can see exactly where Total Load came from.
                const base = trimpRecord.baseTRIMP
                const mim = trimpRecord.sportMultiplier
                const elev = trimpRecord.elevationBonus
                const adjusted = trimpRecord.adjustedTRIMP
                const expected = base * mim + elev
                const floored = Math.abs(expected - adjusted) > 0.5 && adjusted > expected
                const ifSource = trimpRecord.ifSource
                const if_ = trimpRecord.intensityFactor
                const desc = describeMIMEngine(trimpRecord.sportType)
                // Always annotate the source so the athlete can tell whether
                // the dynamic per-workout formula ran or the engine fell back
                // to the static lookup. For dynamic-capable sports that
                // landed on `static`, explain why.
                let mimNote = ''
                if (ifSource === 'power' && if_ != null) {
                  mimNote = ` · power IF ${if_.toFixed(2)}, ${desc.formulaLabel}`
                } else if (ifSource === 'hr_reserve' && if_ != null) {
                  mimNote = ` · HR IF ${if_.toFixed(2)}, ${desc.formulaLabel}`
                } else if (ifSource === 'grade') {
                  mimNote = ` · ${desc.formulaLabel} (grade)`
                } else if (ifSource === 'static') {
                  if (desc.engine === 'cycling-if' || desc.engine === 'mountain-biking-if') {
                    mimNote = ' · static fallback — no power or HR data for IF'
                  } else if (desc.engine === 'hiking-grade') {
                    mimNote = ' · static fallback — no distance for grade'
                  } else {
                    mimNote = ' · static lookup'
                  }
                }
                return (
                  <p className="text-[11px] text-teal-700 dark:text-teal-300 text-center italic -mt-1 px-2">
                    {floored ? (
                      <>Total Load = <span className="font-semibold">{Math.round(adjusted)}</span> (minimum applied; raw {Math.round(base)} × {mim.toFixed(2)} + {Math.round(elev)} = {Math.round(expected)})</>
                    ) : (
                      <>Total Load = {Math.round(base)} base × {mim.toFixed(2)} MIM{elev > 0 ? ` + ${Math.round(elev)} elev` : ''} = <span className="font-semibold">{Math.round(adjusted)}</span>{mimNote && (
                        <><br /><span className="text-[10px] text-teal-600/80 dark:text-teal-400/80 not-italic">{mimNote.replace(/^ · /, '')}</span></>
                      )}</>
                    )}
                  </p>
                )
              })()}
              {/* Load-impact pills — sport MIM tier + elevation bonus. */}
              {(() => {
                const pills: ReactNode[] = []
                const runTypes = new Set(['run', 'long', 'quality', 'race'])

                let sportType = trimpRecord?.sportType
                if (!sportType && runTypes.has(day.type) && actual.elevationGain > 0) {
                  sportType = classifyRun(
                    'running',
                    actual.elevationGain,
                    actual.distance > 0 ? actual.distance : undefined,
                  )
                }
                if (sportType) {
                  const mim = trimpRecord?.sportMultiplier ?? getSportMultiplier(sportType)
                  const label = SPORT_LABELS[sportType] ?? sportType
                  const isHigh = mim >= 1.2
                  const isLow = mim < 1.0
                  const cls = isHigh
                    ? 'bg-emerald-200 text-emerald-900 border-emerald-300'
                    : isLow
                    ? 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  const ifSource = trimpRecord?.ifSource
                  const if_ = trimpRecord?.intensityFactor
                  const desc = describeMIMEngine(sportType)
                  let sourceNote = ''
                  let sourceTag = ''
                  if (ifSource === 'power' && if_ != null) {
                    sourceNote = ` Derived from ${desc.formulaLabel} with IF = ${if_.toFixed(2)} (NormalizedPower / FTP).`
                    sourceTag = ` · IF ${if_.toFixed(2)}`
                  } else if (ifSource === 'hr_reserve' && if_ != null) {
                    sourceNote = ` Derived from ${desc.formulaLabel} with IF = ${if_.toFixed(2)} (HR-reserve fallback — no power data).`
                    sourceTag = ` · IF ${if_.toFixed(2)}`
                  } else if (ifSource === 'grade') {
                    sourceNote = ` Derived from ${desc.formulaLabel} at the activity's average grade.`
                    sourceTag = ' · grade'
                  } else if (ifSource === 'static') {
                    if (desc.engine === 'cycling-if' || desc.engine === 'mountain-biking-if') {
                      sourceNote = ` Static fallback (${desc.staticValue.toFixed(2)}× from MIM_MATRIX) — the per-workout formula ${desc.formulaLabel} needs power data or HR + restingHR + maxHR, none of which were available.`
                    } else if (desc.engine === 'hiking-grade') {
                      sourceNote = ` Static fallback (${desc.staticValue.toFixed(2)}×) — the per-workout formula ${desc.formulaLabel} needs distance to compute grade, which wasn't available.`
                    } else {
                      sourceNote = ` Static lookup from MIM_MATRIX (no per-workout formula for ${label}).`
                    }
                    sourceTag = ' · static'
                  }
                  pills.push(
                    <span
                      key="mim"
                      className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full border px-2 py-0.5 ${cls}`}
                      title={`${label}: MIM ${mim.toFixed(2)}× applied to base training load.${sourceNote}`}
                    >
                      {label} · MIM {mim.toFixed(2)}×{sourceTag}
                    </span>
                  )
                }

                const elevBonus = trimpRecord?.elevationBonus
                  ?? (actual.elevationGain > 0 ? calculateElevationBonus(actual.elevationGain) : 0)
                if (elevBonus >= 10) {
                  pills.push(
                    <span
                      key="elev"
                      className="inline-flex items-center gap-1 text-xs font-semibold rounded-full border px-2 py-0.5 bg-amber-100 text-amber-800 border-amber-200"
                      title={`Elevation bonus: +10 training load per 500 ft of gain. ${actual.elevationGain} ft → +${Math.round(elevBonus)}.`}
                    >
                      🔥 Elev Bonus +{Math.round(elevBonus)}
                    </span>
                  )
                }

                if (pills.length === 0) return null
                return <div className="flex flex-wrap gap-1.5">{pills}</div>
              })()}
              {/* Secondary stats — small badges */}
              {(() => {
                const pills: { emoji: string; text: string }[] = []
                if (actual.maxHR) pills.push({ emoji: '💓', text: `${actual.maxHR} max HR` })
                if (actual.sufferScore) pills.push({ emoji: '🔥', text: `${actual.sufferScore} effort` })
                if (actual.avgCadence) pills.push({ emoji: '👟', text: `${Math.round(actual.avgCadence * 2)} spm` })
                if (actual.elevHigh) pills.push({ emoji: '📈', text: `${actual.elevHigh} ft high` })
                if (actual.elevLow) pills.push({ emoji: '📉', text: `${actual.elevLow} ft low` })
                if (pills.length === 0) return null
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {pills.map((p, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-lg bg-teal-100/60 text-teal-700">{p.emoji} {p.text}</span>
                    ))}
                  </div>
                )
              })()}
              {actual.deviceName && (
                <p className="text-xs text-teal-600">📱 {actual.deviceName}</p>
              )}

              {/* Garmin Training Metrics */}
              {(actual.aerobicTE || actual.anaerobicTE || actual.epoc) && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {actual.aerobicTE != null && (
                    <span className={`text-xs px-2 py-1 rounded-lg font-medium ${
                      actual.aerobicTE >= 4 ? 'bg-red-100 text-red-700' :
                      actual.aerobicTE >= 3 ? 'bg-amber-100 text-amber-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      🫀 Aerobic TE: {actual.aerobicTE.toFixed(1)}
                      {actual.aerobicTE >= 4 ? ' (Overreaching)' : actual.aerobicTE >= 3 ? ' (Improving)' : ' (Maintaining)'}
                    </span>
                  )}
                  {actual.anaerobicTE != null && (
                    <span className={`text-xs px-2 py-1 rounded-lg font-medium ${
                      actual.anaerobicTE >= 3 ? 'bg-purple-100 text-purple-700' :
                      actual.anaerobicTE >= 1 ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}>
                      ⚡ Anaerobic TE: {actual.anaerobicTE.toFixed(1)}
                    </span>
                  )}
                  {actual.epoc != null && actual.epoc > 0 && (
                    <span className="text-xs px-2 py-1 rounded-lg font-medium bg-orange-100 text-orange-700">
                      🔥 EPOC: {Math.round(actual.epoc)}
                    </span>
                  )}
                  {actual.recoveryTimeHours != null && actual.recoveryTimeHours > 0 && (
                    <span className="text-xs px-2 py-1 rounded-lg font-medium bg-teal-100 text-teal-700">
                      🔄 Recovery: {actual.recoveryTimeHours}h
                    </span>
                  )}
                </div>
              )}

              {/* Garmin's HR Zone Distribution removed — the "Time in Zone"
                   bar below uses the plan's Uphill Athlete zones, which is
                   what the grade and training targets are based on. */}

              {/* Exercise Sets from Garmin / Strength Log */}
              {actual.strengthLog && actual.strengthLog.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-semibold text-teal-800 mb-1">
                    {actual.source === 'garmin' && actual.garminId && actual.type === 'strength_training' ? '⌚ Exercise Sets (from watch)' : '📋 Logged Exercises'}
                  </p>
                  <div className="space-y-1.5">
                    {actual.strengthLog.map((ex, i) => (
                      <div key={i} className="bg-teal-100/50 rounded-lg px-2 py-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-teal-800">{ex.name}</span>
                          <span className="text-xs text-teal-600 capitalize">{ex.focus}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {ex.sets.map((s, j) => (
                            <span key={j} className="text-xs text-teal-700 bg-white dark:bg-slate-800/60 rounded px-1.5 py-0.5">
                              {s.reps > 0 ? `${s.reps} reps` : ''}{s.weight !== '—' ? ` @ ${s.weight}` : ''}{s.notes ? ` (${s.notes})` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Splits */}
              {actual.splits && actual.splits.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-teal-800 mt-2 mb-1">Splits (per km)</p>
                  <div className="space-y-0.5">
                    {actual.splits.map((s, i) => (
                      <div key={i} className="flex justify-between text-sm text-teal-700 bg-teal-100/50 rounded px-2 py-0.5">
                        <span>Km {s.split}</span>
                        <span>{s.pace}</span>
                        {s.hr && <span>❤️ {s.hr}</span>}
                        <span>{s.elev > 0 ? `+${s.elev}` : s.elev} ft</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Laps */}
              {actual.laps && actual.laps.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-teal-800 mt-2 mb-1">Laps</p>
                  <div className="space-y-0.5">
                    {actual.laps.map((l, i) => (
                      <div key={i} className="flex justify-between text-sm text-teal-700 bg-teal-100/50 rounded px-2 py-0.5">
                        <span className="truncate max-w-[100px]">{l.name}</span>
                        <span>{formatMiles(l.distance)}</span>
                        <span>{l.pace}</span>
                        {l.hr && <span>❤️ {l.hr}</span>}
                        {l.elev != null && l.elev > 0 && <span>⛰ {l.elev}ft</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-mile splits table (computed from stream data) */}
              {stream && stream.distance && stream.distance.length > 0 && (() => {
                const mileSplits = computeMileSplits(stream)
                if (mileSplits.length === 0) return null
                const avgTime = mileSplits.reduce((s, m) => s + m.time, 0) / mileSplits.length
                const maxTime = Math.max(...mileSplits.map(m => m.time))
                return (
                  <div className="mt-2">
                    <p className="text-sm font-semibold text-teal-800 mb-1.5">Mile Splits</p>
                    <div className="space-y-1">
                      {mileSplits.map(s => {
                        const barPct = maxTime > 0 ? (s.time / maxTime) * 100 : 0
                        const delta = s.time - avgTime
                        const deltaStr = delta === 0 ? '' : delta > 0 ? `+${Math.abs(Math.round(delta))}s` : `-${Math.abs(Math.round(delta))}s`
                        const barColor = delta <= -5 ? '#22C55E' : delta >= 5 ? '#EF4444' : '#3B82F6'
                        const deltaColor = delta <= -5 ? 'text-green-600' : delta >= 5 ? 'text-red-500' : 'text-slate-400'
                        return (
                          <div key={s.mile} className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 dark:text-slate-400 w-4 text-right font-medium">{s.mile}</span>
                            <div className="flex-1 relative h-5 bg-slate-100 dark:bg-slate-700 rounded overflow-hidden">
                              <div className="h-full rounded" style={{ width: `${barPct}%`, backgroundColor: barColor }} />
                              <span className="absolute inset-0 flex items-center px-1.5 text-[11px] font-semibold text-white drop-shadow-sm">
                                {s.pace}/mi
                              </span>
                            </div>
                            <span className="text-[10px] w-8 text-right font-medium" style={{ color: deltaColor === 'text-slate-400' ? '#94A3B8' : undefined }}>
                              <span className={deltaColor}>{deltaStr}</span>
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 w-10 text-right">{s.avgHR > 0 ? `${s.avgHR}` : '—'}</span>
                            <span className="text-[10px] text-slate-400 w-8 text-right">{s.elevGain > 0 ? `+${s.elevGain}'` : ''}</span>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex justify-between mt-1 text-[9px] text-slate-400 px-6">
                      <span>Avg {mileSplits.length > 0 ? mileSplits[0].pace : ''}/mi</span>
                      <span>HR</span>
                      <span>Elev</span>
                    </div>
                  </div>
                )
              })()}

              {/* HR Stream Chart */}
              {stream && stream.heartrate.length > 0 && (
                <div className="mt-2">
                  <HRChart stream={stream} zones={zones} targetZone={day.zone} />
                </div>
              )}
              {stream && stream.altitude && stream.altitude.some(a => a > 0) && (
                <ElevationChart stream={stream} />
              )}
              {stream && stream.velocity && stream.velocity.length > 0 && (
                <PaceChart stream={stream} />
              )}
              {stream && stream.latlng && stream.latlng.length > 1 && (
                <div className="mt-3">
                  <RouteMap latlng={stream.latlng} altitude={stream.altitude} />
                </div>
              )}
              {streamLoading && (
                <p className="text-sm text-teal-600 mt-2 animate-pulse">Loading activity data...</p>
              )}
            </div>
          )}

          {/* Drill completion status — shown whenever drills are scheduled,
              regardless of whether the workout has been logged yet. */}
          {isDrillDay && (
            <DrillStatusBanner drills={actual?.drills} />
          )}

          {/* Pre-run activation for drill days */}
          {isDrillDay && (
            <div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">🔥 Pre-Run Activation (~3 min)</p>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">Do these BEFORE your run to wake up your glutes and hips. Quick and targeted.</p>
              <div className="space-y-1.5">
                {PRE_RUN_ACTIVATION.map((drill, i) => (
                  <DrillCard key={i} drill={drill} />
                ))}
              </div>
            </div>
          )}

          {/* Purpose */}
          <div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">🎯 Purpose</p>
            <p className="text-base text-slate-700 dark:text-slate-200 leading-relaxed">{coaching.purpose}</p>
          </div>

          {/* How to Execute */}
          <div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">📋 How to Execute</p>
            <ul className="space-y-1.5">
              {coaching.execution.map((tip, i) => (
                <li key={i} className="text-base text-slate-700 dark:text-slate-200 flex gap-2">
                  <span className="text-slate-400 shrink-0">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Strength: Exercise-by-exercise guide */}
          {isStrength && exercises.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">🏋️ Exercise Guide (tap for form cues)</p>
              <div className="space-y-2">
                {exercises.map((ex, i) => (
                  <ExerciseCard key={i} exercise={ex} index={i + 1} />
                ))}
              </div>
            </div>
          )}

          {/* Override/custom exercises: show exercise cards when available */}
          {hasCustomDetail && customExercises.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">📋 Exercise Guide (tap for form cues)</p>
              <div className="space-y-2">
                {customExercises.map((ex, i) => (
                  <ExerciseCard key={i} exercise={ex} index={i + 1} />
                ))}
              </div>
            </div>
          )}

          {/* Quality: Interval breakdown */}
          {isQuality && intervals.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">⚡ Interval Breakdown</p>
              <div className="space-y-1.5">
                {intervals.map((seg, i) => (
                  <IntervalSegment key={i} segment={seg} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Drills + Myrtl for designated drill days */}
          {isDrillDay && (
            <div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">🏃 Post-Run: Running Drills (~8 min)</p>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">Do these after your run while muscles are warm, before stretching. Builds speed and coordination.</p>
              <div className="space-y-1.5">
                {RUNNING_DRILLS.map((drill, i) => (
                  <DrillCard key={i} drill={drill} />
                ))}
              </div>
            </div>
          )}

          {isDrillDay && (
            <div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">🦵 Post-Run: Full Myrtl Hip Routine (~10 min)</p>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">Full hip strengthening after drills. You did the abbreviated version pre-run — now go deep while muscles are warm.</p>
              <div className="space-y-1.5">
                {MYRTL_ROUTINE.map((drill, i) => (
                  <DrillCard key={i} drill={drill} />
                ))}
              </div>
            </div>
          )}

          {/* Myrtl recommendation for non-drill run days */}
          {isRunType && !isDrillDay && (
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
              <p className="text-sm font-semibold text-blue-800">💡 Drills & Myrtl Tip</p>
              <p className="text-sm text-blue-700 mt-1">
                Running drills and the Myrtl hip routine are scheduled for your {getDrillDay(weekNum)} run this week.
                If you want extra hip work today, do the Myrtl routine post-run (10 min).
              </p>
            </div>
          )}

          {/* Mindset */}
          <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">🧠 Mindset</p>
            <p className="text-base text-slate-700 dark:text-slate-200 italic leading-relaxed">{coaching.mindset}</p>
          </div>

          {/* Nutrition */}
          <div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">🍌 Nutrition</p>
            <p className="text-base text-slate-700 dark:text-slate-200">{coaching.nutrition}</p>
          </div>

          {/* Recovery */}
          <div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">🔄 Recovery</p>
            <p className="text-base text-slate-700 dark:text-slate-200">{coaching.recovery}</p>
          </div>
        </div>

        <div className="h-6" />
      </div>
    </div>
  )
}

function DrillStatusBanner({ drills }: { drills?: { completed: boolean; items?: { name: string; done: boolean }[]; durationMin?: number } }) {
  if (!drills) {
    return (
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 flex items-center gap-2">
        <span className="text-xl">🤸</span>
        <div className="flex-1">
          <p className="text-base font-semibold text-slate-700 dark:text-slate-200">Drills not yet logged</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Open the Log modal to check off drills as you do them.</p>
        </div>
      </div>
    )
  }
  const done = drills.items?.filter(i => i.done).length ?? 0
  const total = drills.items?.length ?? 0
  if (drills.completed) {
    return (
      <div className="bg-sky-50 border border-sky-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
        <span className="text-xl">✅</span>
        <div className="flex-1">
          <p className="text-base font-semibold text-sky-800">
            Drills completed{total > 0 ? ` · ${done}/${total} items` : ''}
            {drills.durationMin ? ` · ${drills.durationMin} min` : ''}
          </p>
          {total > 0 && done < total && (
            <p className="text-sm text-sky-600">
              Skipped: {drills.items!.filter(i => !i.done).map(i => i.name).join(', ')}
            </p>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
      <span className="text-xl">⚠️</span>
      <div className="flex-1">
        <p className="text-base font-semibold text-amber-800">Drills planned but not marked complete</p>
        <p className="text-sm text-amber-600">Open the Log modal and tick the drill checkboxes.</p>
      </div>
    </div>
  )
}

function ExerciseCard({ exercise, index }: { exercise: ParsedExercise; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const guide = exercise.guide

  return (
    <div
      className="bg-white dark:bg-slate-800 rounded-xl border border-purple-200 overflow-hidden"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="px-3 py-2.5 cursor-pointer">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-purple-600 bg-purple-100 rounded-full w-5 h-5 flex items-center justify-center shrink-0">
              {index}
            </span>
            <span className="text-base font-medium text-slate-800 dark:text-white">
              {guide?.name || exercise.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {exercise.sets && exercise.reps && (
              <span className="text-sm text-purple-700 bg-purple-50 rounded-full px-2 py-0.5 font-medium">
                {exercise.sets} × {exercise.reps}
              </span>
            )}
            <span className="text-slate-400 text-sm">{expanded ? '▼' : '›'}</span>
          </div>
        </div>
        {guide && !expanded && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 ml-7">{guide.weight} · {guide.rest}</p>
        )}
      </div>

      {expanded && guide && (
        <div className="px-3 pb-3 border-t border-purple-100 pt-2 space-y-2">
          <p className="text-sm text-slate-500 dark:text-slate-400 italic">{guide.aka}</p>
          <div className="flex gap-3 text-sm">
            <span className="text-purple-700 bg-purple-50 rounded px-2 py-1">💪 {guide.weight}</span>
            <span className="text-purple-700 bg-purple-50 rounded px-2 py-1">⏸ {guide.rest}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1">Form Cues:</p>
            <ol className="space-y-1">
              {guide.form.map((cue, i) => (
                <li key={i} className="text-sm text-slate-600 dark:text-slate-300 flex gap-1.5">
                  <span className="text-slate-400 shrink-0">{i + 1}.</span>
                  <span>{cue}</span>
                </li>
              ))}
            </ol>
          </div>
          {guide.alternates && guide.alternates.length > 0 && (
            <div className="pt-2 border-t border-purple-100 dark:border-purple-900">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1">🔄 Alternates</p>
              <ul className="space-y-1.5">
                {guide.alternates.map((alt, i) => (
                  <li key={i} className="text-sm text-slate-600 dark:text-slate-300">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{alt.name}</span>
                      <span className="text-[11px] text-purple-700 bg-purple-50 dark:bg-purple-950 dark:text-purple-300 rounded px-1.5 py-0.5">{alt.equipment}</span>
                    </div>
                    {alt.notes && (
                      <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-snug ml-0.5 mt-0.5">{alt.notes}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {expanded && !guide && (
        <div className="px-3 pb-3 border-t border-purple-100 pt-2">
          <p className="text-sm text-slate-500 dark:text-slate-400">No detailed guide available for this exercise yet.</p>
        </div>
      )}
    </div>
  )
}

function IntervalSegment({ segment, index }: { segment: RunSegment; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const isWarmCool = segment.label === 'Warm-Up' || segment.label === 'Cool-Down'
  const isRecovery = segment.label.startsWith('Recovery')
  const bgColor = isWarmCool ? 'bg-green-50 border-green-200' : isRecovery ? 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700' : 'bg-amber-50 border-amber-200'
  const numColor = isWarmCool ? 'bg-green-100 text-green-700' : isRecovery ? 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400' : 'bg-amber-100 text-amber-700'

  return (
    <div
      className={`rounded-xl border overflow-hidden ${bgColor}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="px-3 py-2 cursor-pointer">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 ${numColor}`}>
              {index + 1}
            </span>
            <span className="text-base font-medium text-slate-800 dark:text-white">{segment.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-300">{segment.duration}</span>
            <span className="text-slate-400 text-sm">{expanded ? '▼' : '›'}</span>
          </div>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 ml-8">{segment.effort}</p>
      </div>

      {expanded && (
        <div className="px-3 pb-2.5 border-t border-slate-200 dark:border-slate-700/50 pt-2">
          <ul className="space-y-1">
            {segment.cues.map((cue, i) => (
              <li key={i} className="text-sm text-slate-600 dark:text-slate-300 flex gap-1.5">
                <span className="text-slate-400 shrink-0">•</span>
                <span>{cue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function DrillCard({ drill }: { drill: DrillGuide }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="bg-white dark:bg-slate-800 rounded-xl border border-blue-200 overflow-hidden"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="px-3 py-2.5 cursor-pointer">
        <div className="flex items-center justify-between">
          <span className="text-base font-medium text-slate-800 dark:text-white">{drill.name}</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-blue-600">{drill.duration}</span>
            <span className="text-slate-400 text-sm">{expanded ? '▼' : '›'}</span>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-blue-100 pt-2">
          <ul className="space-y-1">
            {drill.form.map((cue, i) => (
              <li key={i} className="text-sm text-slate-600 dark:text-slate-300 flex gap-1.5">
                <span className="text-slate-400 shrink-0">•</span>
                <span>{cue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── CoachWorkoutTakeForDay ────────────────────────────────────
// Wraps CoachWorkoutTakeView + useCoachInsight so the hook runs only when
// the modal is open (which is when this component is mounted).
function CoachWorkoutTakeForDay({
  day,
  weekNum,
  readiness,
  latestPerf,
  athleteId,
  coachSnapshot,
  onAsk,
}: {
  day: PlannedDay
  weekNum: number
  readiness?: ReadinessScore
  latestPerf?: PerformanceMetrics | null
  athleteId?: string
  coachSnapshot?: CoachSnapshot | null
  onAsk?: (seed: string) => void
}) {
  const fallback = generateWorkoutTake(day, weekNum, readiness, latestPerf ?? null)

  // LLM insight only fires for TODAY's upcoming workout. Two reasons
  // to disable it otherwise:
  //   1. Completed days — the snapshot is today-centric so the LLM
  //      would comment on today's readiness instead of the past run.
  //      The heuristic (buildCompletedTake) already gives a great
  //      execution-focused reflection.
  //   2. Future days — same problem. "Tomorrow's walk is fine" is
  //      useless copy when the athlete opened Thu 5/14's easy run.
  //      The heuristic generateWorkoutTake is day-specific and reads
  //      naturally for any day.
  const isCompleted = !!day.actual
  const todayLabel = coachSnapshot?.plannedToday?.day
  const isToday = !!todayLabel && todayLabel === day.day
  const useLLM = isToday && !isCompleted
  const { insight, loading } = useCoachInsight({
    athleteId: athleteId || '',
    surface: `workout_take:${day.day}`,
    snapshot: coachSnapshot ?? null,
    enabled: useLLM && !!athleteId && !!coachSnapshot,
    fallbackText: fallback.text,
    fallbackTip: fallback.tip,
  })
  return (
    <CoachWorkoutTakeView
      take={fallback}
      insight={useLLM ? insight : null}
      loading={useLLM ? loading : false}
      onAsk={onAsk}
      coachName={coachSnapshot?.coachPersona?.name?.trim() || 'Coach'}
    />
  )
}
