import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PlannedDay, HRZone, ReadinessScore, PerformanceMetrics, CoachSnapshot, TRIMPRecord } from '../types'
import { DEFAULT_COACH_NAME } from '../types'
import { buildWeatherChipFromHour, forecastForHour, describeWeatherCode, formatHourLabel } from '../utils/weatherChip'
import { dayLabelToISO, buildCompletedWorkoutPayload } from '../utils/coachSnapshot'
import type { PlannedSegment } from '../engines/planGenerator/types'
import { isDisplayablePace } from '../engines/planGenerator/paceTargets'
import { getWorkoutStyle, adaptBg } from '../utils/styles'
import { getCoaching } from '../utils/coaching'
import { generateWorkoutTake } from '../utils/coachNotes'
import CoachWorkoutTakeView from './CoachWorkoutTake'
import WorkoutDebriefPrompt from './WorkoutDebriefPrompt'
import { useCoachInsight } from '../hooks/useCoachInsight'
import { formatMiles, formatSeconds, formatPace, estimateRunTime } from '../utils/format'
import { parseRoutine, guideMatchedExercises, calibrateGuideWeight, type ParsedExercise } from '../utils/exercises'
import type { StrengthCapacity } from '../engines/strength/benchmark'
import { menopauseStrengthCue } from '../utils/menopause'
import type { StrengthExperience } from '../hooks/useOnboarding'
import { buildProgression, normalizeExerciseName, suggestNextTarget, type ExerciseProgression } from '../utils/strengthProgression'
import { parseIntervalWorkout, RUNNING_DRILLS, MYRTL_ROUTINE, PRE_RUN_ACTIVATION, type RunSegment, type DrillGuide } from '../utils/drills'
import { analyzeSimSplits } from '../utils/simAnalysis'
import { fetchActivityStreams, getTokens, isTokenExpired, refreshAccessToken, type StreamData } from '../utils/strava'
import { fetchGarminActivityStream } from '../utils/garmin'
import { classifyRun, getSportMultiplier, describeMIMEngine, mapToSportType } from '../utils/trimp'
import { cacheRunGAP, computeStreamGAPMIM } from '../utils/runGAP'
import { computeEccentricLoad } from '../engines/descent/eccentric'
import { cacheEccentric, getCachedEccentric, type CachedEccentric } from '../utils/runEccentric'
import DescentForecastCard from './DescentForecastCard'
import { SPORT_LABELS } from '../hooks/useMIMCalibration'
import { useDisplayPreferences } from '../hooks/useDisplayPreferences'
import { useOnboarding } from '../hooks/useOnboarding'
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
  /** Opens the workout completion editor (ManualLog) for this day. When
   *  provided, a "Log / Edit workout" pill is shown in the header so the
   *  athlete can jump straight from reviewing the workout to logging what
   *  they actually did — no need to close the modal and hunt for the log
   *  button on the day card. */
  onLog?: () => void
  /** Open the live-session player for this day (today's strength /
   *  gym-circuit days without a log). */
  onStartLive?: () => void
  /** Persist + share the workout journal note (actual.notes). When provided
   *  (and the workout is completed), the inline Workout Journal card renders.
   *  Saving writes the note and shares it with the coach in the background. */
  onSaveNote?: (note: string) => void | Promise<void>
  zones?: HRZone[]
  athleteId?: string
  coachEnabled?: boolean
  readiness?: ReadinessScore
  latestPerf?: PerformanceMetrics | null
  coachSnapshot?: CoachSnapshot | null
  onAskCoach?: (seed: string) => void
  /** Canonical training-load record for the logged activity, if any. */
  trimpRecord?: TRIMPRecord
  /** Full plan weeks — used to surface per-exercise progression history
   *  inside strength exercise cards (last session + suggested next target). */
  weeks?: import('../types').TrainingWeek[]
  /** Athlete's lifting background — calibrates the default strength loads
   *  shown per exercise (newer lifters see lighter prescriptions). */
  strengthLevel?: StrengthExperience
  /** Race-readiness adjustment for this session, surfaced when the modal
   *  is opened from a Race Readiness assignment row. Lets the athlete see
   *  the race-day target attached to the same planned workout — not a
   *  replacement, a bias. */
  raceReadinessTarget?: {
    gap: 'fitness' | 'vert' | 'taper' | 'on-track'
    action: string
    target: string
  }
  /** Measured strength capacity from the benchmark session — overrides
   *  the self-report calibration for the lifts it actually tested. */
  strengthCapacity?: StrengthCapacity | null
  /** Phase 3b — write config.weakStation (non-destructively) so the plan
   *  generator biases station work toward a proven weak station. Comes
   *  from App's onboarding instance, the one the plan derives from. */
  onReweightPlan?: (station: string) => void
  /** The currently configured weak station, to suppress a redundant
   *  re-weight offer. */
  currentWeakStation?: string
}

export default function WorkoutModal({ day, weekNum, onClose, onLog, onStartLive, onSaveNote, zones, athleteId, coachEnabled, readiness, latestPerf, coachSnapshot, onAskCoach, trimpRecord, weeks, raceReadinessTarget, strengthLevel, strengthCapacity, onReweightPlan, currentWeakStation }: WorkoutModalProps) {
  const style = getWorkoutStyle(day.type, day.workout)
  const { flags } = useDisplayPreferences(athleteId)
  // General Fitness plans (raceType 'general') get goal-aware, race-free
  // coaching; trail/hyrox/seed plans keep the existing race narratives.
  const { config: onboardingConfig } = useOnboarding(athleteId)
  const generalGoal = onboardingConfig?.raceType === 'general' ? onboardingConfig.generalGoal : undefined
  // The race this day builds toward: Hyrox anchor plans declare it in
  // config; spliced season weeks carry a seasonRace stamp. Routes coaching
  // to race-appropriate narratives (a Hyrox card must never get another
  // race's course copy, and vice versa).
  const modalWeek = weeks?.find(w => w.num === weekNum)
  const raceCtx: import('../utils/coaching').RaceCoachingContext | undefined =
    modalWeek?.seasonRace
      ? { name: modalWeek.seasonRace.name, format: modalWeek.seasonRace.format }
      : onboardingConfig?.raceType === 'hyrox'
        ? { name: onboardingConfig.raceName, format: 'hyrox' }
        : undefined
  const baseCoaching = getCoaching(
    day,
    weekNum,
    generalGoal
      ? { generalGoal, experienceLevel: onboardingConfig?.experienceLevel }
      : raceCtx ? { race: raceCtx } : undefined,
  )
  const actual = day.actual
  const isStrength = day.type === 'strength'
  const isQuality = day.type === 'quality'
  const plannedWorkout = day.plannedWorkout

  // When a structured PlannedWorkout is attached (generated plans), prefer
  // its segment list + purpose/cues over the legacy detail-string parsers.
  // The detail string for generated plans is a one-line summary, not a
  // routine — feeding it through parseRoutine produces nonsense exercise
  // cards like "Time on feet matters more than mileage".
  const hasPlannedWorkout = !!plannedWorkout && plannedWorkout.segments.length > 0

  // When coach overrides (or plan data) provide specific exercises in the detail
  // field, show those as execution steps instead of generic type-based guidance.
  // Strength/quality workouts already parse detail into exercise/interval cards.
  // Skip the fallback entirely when a structured PlannedWorkout is present.
  const hasCustomDetail = !isStrength && !isQuality && !hasPlannedWorkout && day.detail && day.detail.includes(' · ')
  const coaching = useMemo(() => {
    // Prefer the method's purpose/cues when a PlannedWorkout is attached —
    // they're tied to the specific workout template (e.g. "Hill repeats build
    // race-specific power") rather than the generic type-level narrative.
    if (hasPlannedWorkout) {
      return {
        ...baseCoaching,
        purpose: plannedWorkout!.purpose || baseCoaching.purpose,
        execution: plannedWorkout!.cues.length > 0 ? plannedWorkout!.cues : baseCoaching.execution,
      }
    }
    if (hasCustomDetail) {
      return {
        ...baseCoaching,
        execution: day.detail.split(' · ').map((s: string) => s.trim()).filter(Boolean),
      }
    }
    return baseCoaching
  }, [baseCoaching, hasPlannedWorkout, plannedWorkout, hasCustomDetail, day.detail])
  const isRunType = ['run', 'quality', 'long'].includes(day.type)
  // Midlife bone-loading framing for the strength day (peri/menopause/post).
  const boneCue = isStrength ? menopauseStrengthCue(onboardingConfig) : null
  const exercises = isStrength ? parseRoutine(day.detail) : []
  // Custom-detail (cross/station) days show guide cards only for fragments
  // that matched a real movement — instruction fragments like "90 sec rest
  // between stations" would otherwise render empty "No detailed guide" cards.
  const customExercises = hasCustomDetail ? guideMatchedExercises(day.detail) : []
  // Legacy interval parsing is keyed off hard-coded patterns ("4×90 sec uphill")
  // that don't match the generator's detail strings — suppress when the
  // structured segment list is available instead.
  const intervals = isQuality && !hasPlannedWorkout ? parseIntervalWorkout(day.detail, day.zone) : []

  // Per-exercise progression history. We build it once per modal render
  // and exclude THIS day from each entry so the "last session" line
  // doesn't reflect the workout the user is currently looking at.
  const progressionByExercise = useMemo(() => {
    if (!weeks || weeks.length === 0) return null
    const todayDate = day.actual?.startDate?.slice(0, 10)
    const filteredWeeks = todayDate
      ? weeks.map(w => ({
          ...w,
          days: w.days.map(d => (d.actual?.startDate?.slice(0, 10) === todayDate ? { ...d, actual: undefined } : d)),
        }))
      : weeks
    return buildProgression(filteredWeeks)
  }, [weeks, day.actual?.startDate])
  const isDrillDay = !!day.isDrillDay
  // Label of this week's drill day (first easy run), for the "drills are
  // scheduled for your <day> run" nudge shown on other run days. Resolved
  // by week NUMBER, not array position — spliced plans renumber weeks, so
  // positional indexing pointed a November modal at an August drill day.
  const drillDayLabel = modalWeek?.days.find(d => d.isDrillDay)?.day ?? ''
  const [stream, setStream] = useState<StreamData | null>(null)
  const [streamLoading, setStreamLoading] = useState(false)
  // Phase 3b — one-shot confirmation after "Re-weight my plan" is tapped.
  const [reweighted, setReweighted] = useState(false)

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
          // For running activities, compute the time-weighted GAP MIM and
          // cache it so the engine picks it up on the next render.
          // Activity-average grade smooths out short steep peaks (e.g.
          // hill repeats with > 20% sections); per-second sampling captures
          // them per the Hill-Running v1.1 research.
          const sport = mapToSportType(actual!.type || '', { name: actual!.name, elevationGainFt: actual!.elevationGain, distanceMi: actual!.distance })
          const isRun = sport === 'running' || sport === 'trail_running' || sport === 'running_steep'
          if (isRun && actual!.startDate) {
            const dateKey = actual!.startDate.slice(0, 10)
            const gapMIM = computeStreamGAPMIM(data)
            if (gapMIM !== null) {
              cacheRunGAP(dateKey, actual!.name, gapMIM, athleteId)
              window.dispatchEvent(new CustomEvent('ba:run-gap-cache-updated'))
            }
            // Compute eccentric (descent / braking) load via the v1.1
            // research table. Cached so subsequent renders can attribute
            // DOMS carry-forward to actual descent damage rather than a
            // static per-sport coefficient.
            const eccResult = computeEccentricLoad(data)
            if (eccResult) {
              cacheEccentric(dateKey, actual!.name, eccResult, athleteId)
              window.dispatchEvent(new CustomEvent('ba:run-eccentric-cache-updated'))
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
        className="relative bg-white dark:bg-slate-800 rounded-t-2xl w-full max-h-[85dvh] overflow-y-auto shadow-xl"
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
            <div className="flex items-center gap-1.5">
              {onStartLive && (
                <button
                  onClick={onStartLive}
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                  title="Log this session live, set by set, with a rest timer"
                >
                  ▶ Start
                </button>
              )}
              {onLog && (
                <button
                  onClick={onLog}
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-white dark:bg-slate-800/70 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-slate-700 transition-colors"
                >
                  ✏️ {actual ? 'Edit' : 'Log'} workout
                </button>
              )}
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-white dark:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>
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
                    {actual.distance > 0 && <> · {formatMiles(actual.distance)}</>}
                    {actual.avgHR ? <> · {actual.avgHR} avg HR</> : null}
                  </p>
                )}
              </div>
            )
          })()}
        </div>

        <div className="px-4 py-4 space-y-4">
          {raceReadinessTarget && (() => {
            const tone = {
              vert: { bg: 'bg-violet-50 dark:bg-violet-950/40', border: 'border-violet-200 dark:border-violet-900', text: 'text-violet-700 dark:text-violet-300' },
              fitness: { bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-200 dark:border-blue-900', text: 'text-blue-700 dark:text-blue-300' },
              taper: { bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-900', text: 'text-amber-700 dark:text-amber-300' },
              'on-track': { bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-900', text: 'text-emerald-700 dark:text-emerald-300' },
            }[raceReadinessTarget.gap]
            return (
              <div className={`rounded-lg border px-3 py-2.5 ${tone.bg} ${tone.border}`}>
                <p className={`text-xs font-semibold uppercase tracking-wide ${tone.text}`}>
                  🎯 Race-day target
                </p>
                <p className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5 leading-snug">
                  {raceReadinessTarget.action}
                </p>
                <p className="text-xs text-slate-700 dark:text-slate-200 mt-0.5 leading-snug">
                  {raceReadinessTarget.target}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-snug italic">
                  This is the same {day.day.split(/\s+/)[0]} session below — biased to deliver the race-day target. If the planned structure already hits it on your route, you're set. Otherwise use the structure above.
                </p>
              </div>
            )
          })()}

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

          {/* Workout journal — the single source of truth for this
              workout's notes (actual.notes). Renders for completed workouts
              when a save handler is wired (manual log available). Saving
              persists the note and shares it with the coach in the
              background; durable facts get remembered server-side. */}
          {coachEnabled && athleteId && onSaveNote && day.actual && (
            <WorkoutDebriefPrompt
              athleteId={athleteId}
              day={day}
              coachName={coachSnapshot?.coachPersona?.name?.trim() || DEFAULT_COACH_NAME}
              onSaveNote={onSaveNote}
            />
          )}

          {/* "Why this workout?" — lazy-fetched explainability surface.
              Mechanism + personal signal + citation, written by the LLM
              from APP_KNOWLEDGE. Default collapsed so we don't burn
              tokens on every modal open; expanding mounts the hook. */}
          {coachEnabled && (
            <CoachWhyForDay
              day={day}
              weekNum={weekNum}
              athleteId={athleteId}
              coachSnapshot={coachSnapshot}
              onAsk={onAskCoach}
            />
          )}

          {/* AM / PM weather decision strip — only shown for future
              days inside the hourly forecast window (~7 days). Lets
              the athlete pick when to fit in the workout based on
              real per-hour conditions, not the daily peak. */}
          {!actual && coachSnapshot?.weatherForecast?.hourly?.length ? (
            <AmPmWeatherStrip
              dayLabel={day.day}
              hourly={coachSnapshot.weatherForecast.hourly}
            />
          ) : null}

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
                  athlete sees the same credit math here and on the card.
                  Gated as an advanced metric — the Total Load math + IF/MIM
                  source is the most technical readout in the modal. */}
              {flags.showAdvancedMetrics && trimpRecord && trimpRecord.adjustedTRIMP > 0 && (() => {
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
                } else if (ifSource === 'grade_gps') {
                  // Per-second weighting via the GPS stream — captures peaks
                  // that the activity-average grade smooths out.
                  mimNote = ` · ${desc.formulaLabel} (per-second GPS, ${stream?.distance?.length ?? 0} samples)`
                } else if (ifSource === 'grade') {
                  const elevFt = actual?.elevationGain ?? 0
                  const distMi = actual?.distance ?? 0
                  const gradePct = distMi > 0 ? ((elevFt / (distMi * 5280)) * 100) : 0
                  mimNote = ` · ${desc.formulaLabel} (avg grade ${gradePct.toFixed(1)}%)`
                } else if (ifSource === 'static') {
                  if (desc.engine === 'cycling-if' || desc.engine === 'mountain-biking-if') {
                    // Prefer engine-side reason (exactly which inputs the
                    // engine had vs missed). Falls back to the matched
                    // actual's HR readout if that's not available.
                    const reason = trimpRecord.staticReason
                    if (reason) {
                      mimNote = ` · static fallback — ${reason}`
                    } else {
                      const have: string[] = []
                      if (actual.avgHR) have.push(`avgHR ${actual.avgHR}`)
                      if (actual.maxHR) have.push(`maxHR ${actual.maxHR}`)
                      mimNote = ` · static fallback — IF couldn't be computed${have.length ? ` (record has ${have.join(', ')})` : ''}`
                    }
                  } else if (desc.engine === 'hiking-grade') {
                    mimNote = trimpRecord.staticReason
                      ? ` · static fallback — ${trimpRecord.staticReason}`
                      : ' · static fallback — no distance for grade'
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
                  } else if (ifSource === 'grade_gps') {
                    sourceNote = ` Derived from ${desc.formulaLabel} integrated over per-second GPS altitude+distance samples (computeWholeActivityGAP). Captures peaks the activity-average grade smooths out.`
                    sourceTag = ' · GAP'
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

                // Legacy elev_bonus pill — only renders for old TRIMPRecords
                // whose `elevationBonus` field was computed before retirement.
                // New records always have elevationBonus=0; the descent damage
                // those records used to capture is now handled by the
                // eccentric engine + altitude engine.
                const elevBonus = trimpRecord?.elevationBonus ?? 0
                if (elevBonus >= 10) {
                  pills.push(
                    <span
                      key="elev"
                      className="inline-flex items-center gap-1 text-xs font-semibold rounded-full border px-2 py-0.5 bg-amber-100 text-amber-800 border-amber-200"
                      title={`Legacy elevation bonus from a TRIMPRecord computed before the heuristic was retired. Descent damage is now handled by the eccentric engine; altitude stress by the altitude engine.`}
                    >
                      🔥 Elev Bonus +{Math.round(elevBonus)}
                    </span>
                  )
                }

                // Eccentric (descent / braking) pill — shown when the
                // GPS stream has been processed and the activity has any
                // descent or steep-grade work registered.
                const cachedEcc: CachedEccentric | null = (sportType === 'running' || sportType === 'trail_running' || sportType === 'running_steep' || sportType === 'hiking' || sportType === 'hiking_steep') && actual.startDate
                  ? getCachedEccentric(actual.startDate.slice(0, 10), actual.name, athleteId)
                  : null
                if (cachedEcc && cachedEcc.averageScore >= 1.05) {
                  const sev = cachedEcc.buckets.severe
                  const mod = cachedEcc.buckets.moderate
                  const totalDescent = sev + mod
                  const isHigh = cachedEcc.averageScore >= 2.5 || sev >= 500
                  const cls = isHigh
                    ? 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900'
                    : 'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-900'
                  const totalKm = (cachedEcc.buckets.mild + mod + sev) / 1000
                  const sevPct = totalKm > 0 ? Math.round((sev / 1000 / totalKm) * 100) : 0
                  const modPct = totalKm > 0 ? Math.round((mod / 1000 / totalKm) * 100) : 0
                  pills.push(
                    <span
                      key="ecc"
                      className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full border px-2 py-0.5 ${cls}`}
                      title={`Eccentric (descent / braking) load — distance-weighted average ${cachedEcc.averageScore.toFixed(2)} on the 1-5 scale (Vernillo 2017 PMID 27392180; Peake 2017 PMID 28035017). Severe: ${(sev / 1000).toFixed(2)} km · moderate: ${(mod / 1000).toFixed(2)} km · mild: ${(cachedEcc.buckets.mild / 1000).toFixed(2)} km. The eccentric component is what drives DOMS even when energy cost (MIM) is low (e.g. fast descents).`}
                    >
                      🦵 Eccentric {cachedEcc.averageScore.toFixed(1)}
                      {totalDescent >= 500 && <span className="text-[9px] ml-0.5 opacity-80">· {sevPct}% severe / {modPct}% mod</span>}
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
              {/* "Quads tomorrow" — descent-damage forecast in plain English.
               *  Renders the cached eccentric result through the customer-language
               *  summariser; null when the activity had no meaningful descent.
               *  The eccentric cache is only populated by running/hiking streams
               *  (see the `isRun` gate around computeEccentricLoad), so a plain
               *  lookup is safe — non-running activities return null. */}
              {(() => {
                const cachedEcc = actual.startDate
                  ? getCachedEccentric(actual.startDate.slice(0, 10), actual.name, athleteId)
                  : null
                return <DescentForecastCard eccentric={cachedEcc} />
              })()}
              {actual.deviceName && (
                <p className="text-xs text-teal-600">📱 {actual.deviceName}</p>
              )}

              {/* Garmin Training Metrics */}
              {flags.showAdvancedMetrics && (actual.aerobicTE || actual.anaerobicTE || actual.epoc) && (
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

              {/* Hyrox segment splits (Phase 3b) — recorded by the live
                   circuit / simulation player. Simulations get share-based
                   targets and a weak-station callout in time lost. */}
              {actual.stationSplits && actual.stationSplits.length > 0 && (() => {
                const analysis = analyzeSimSplits(actual.stationSplits)
                const weak = analysis.weakStation
                const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
                return (
                  <div className="mt-2">
                    <p className="text-sm font-semibold text-teal-800 mb-1">⏱ Segment Splits</p>
                    <div className="space-y-0.5">
                      {analysis.rows.map((r, i) => (
                        <div
                          key={i}
                          className={`flex items-center justify-between gap-2 text-sm rounded px-2 py-0.5 ${
                            r.kind === 'run' ? 'bg-teal-100/50 text-teal-700' : 'bg-purple-100/40 text-purple-800 dark:text-purple-300'
                          }`}
                        >
                          <span className="truncate">{r.label}</span>
                          <span className="flex items-center gap-2 shrink-0">
                            {r.deltaSec != null && Math.abs(r.deltaSec) >= 10 && (
                              <span className={`font-mono text-[11px] ${r.deltaSec > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {r.deltaSec > 0 ? '+' : '−'}{fmt(Math.abs(r.deltaSec))}
                              </span>
                            )}
                            <span className="font-mono font-semibold">{fmt(r.sec)}</span>
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-sm font-semibold text-teal-900 dark:text-teal-200 px-2 pt-1">
                        <span>Total</span>
                        <span className="font-mono">{fmt(analysis.totalSec)}</span>
                      </div>
                    </div>
                    {analysis.isSimulation && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Targets are share-based — how this session's own total would spread across segments for a typical racer. +/− is time vs that shape.
                      </p>
                    )}
                    {weak && (
                      <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <p className="text-sm font-semibold text-amber-800">
                          {weak.label.split(' — ')[0]} cost you ~{fmt(weak.lostSec)}
                        </p>
                        <p className="text-xs text-amber-700 mt-0.5">
                          The biggest time lost against the expected shape of your own race — this is where training minutes buy the most.
                        </p>
                        {onReweightPlan && currentWeakStation !== weak.reweightName && (
                          reweighted ? (
                            <p className="text-xs font-semibold text-teal-700 mt-1.5">
                              ✓ Plan re-weighted — future station work biases toward {weak.reweightName}.
                            </p>
                          ) : (
                            <button
                              onClick={() => { onReweightPlan(weak.reweightName); setReweighted(true) }}
                              className="mt-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg px-3 py-1.5"
                            >
                              Re-weight my plan around {weak.reweightName}
                            </button>
                          )
                        )}
                        {currentWeakStation === weak.reweightName && (
                          <p className="text-xs text-amber-600 mt-1">
                            Already your focus station — the plan biases extra work here.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

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
                            <span
                              key={j}
                              className={`text-xs rounded px-1.5 py-0.5 ${
                                s.done === false
                                  ? 'text-slate-400 bg-white dark:bg-slate-800/60 line-through'
                                  : 'text-teal-700 bg-white dark:bg-slate-800/60'
                              }`}
                            >
                              {s.setType === 'warmup' ? 'W: ' : ''}{s.reps > 0 ? `${s.reps} reps` : ''}{s.weight !== '—' ? ` @ ${s.weight}` : ''}{s.notes ? ` (${s.notes})` : ''}{s.done === false ? ' — skipped' : ''}
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
                  <HRChart
                    stream={stream}
                    zones={zones}
                    targetZone={day.zone}
                    workoutType={day.type}
                    workoutDetail={day.detail}
                    sportType={trimpRecord?.sportType ?? (actual ? mapToSportType(actual.type || '', { name: actual.name, elevationGainFt: actual.elevationGain, distanceMi: actual.distance }) : undefined)}
                  />
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

          {/* Other Garmin activities recorded the same day. Shown when the
              user logged multiple sessions (e.g. a warm-up walk + a strength
              session) so nothing recorded silently disappears from the day
              view. Their load IS already counted in the training-load chart;
              this section just makes them visible. */}
          {day.secondaryActuals && day.secondaryActuals.length > 0 && (
            <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-700 space-y-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                📋 Other activities recorded today ({day.secondaryActuals.length})
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                Picked the {actual?.type ?? 'primary'} session above as your main workout.
                These are also counted in your 7-Day Training Load.
              </p>
              <div className="space-y-1.5">
                {day.secondaryActuals.map((sec, i) => (
                  <div
                    key={sec.garminId ?? i}
                    className="flex items-center justify-between gap-2 text-xs bg-white dark:bg-slate-800 rounded-lg px-2.5 py-1.5 border border-slate-100 dark:border-slate-700"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-700 dark:text-slate-200 truncate">{sec.name}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">{sec.type.replace(/_/g, ' ')}</p>
                    </div>
                    <div className="text-right shrink-0 font-mono text-slate-600 dark:text-slate-300">
                      <p>{formatSeconds(sec.movingTime)}</p>
                      <p className="text-[10px] text-slate-500">
                        {sec.distance > 0 && <>{formatMiles(sec.distance)}</>}
                        {sec.distance > 0 && sec.avgHR ? ' · ' : ''}
                        {sec.avgHR ? <>{sec.avgHR} bpm</> : null}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
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
              {boneCue && (
                <div className="mb-2 px-3 py-2 rounded-lg bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-900 text-sm text-violet-800 dark:text-violet-200 flex items-start gap-1.5">
                  <span aria-hidden>🦴</span>
                  <span className="leading-snug">{boneCue.framing}</span>
                </div>
              )}
              {(strengthLevel === 'new' || strengthLevel === 'recreational') && (
                <div className="mb-2 px-3 py-2 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 text-sm text-teal-800 dark:text-teal-200 flex items-start gap-1.5">
                  <span aria-hidden>🎚</span>
                  <span className="leading-snug">
                    {strengthLevel === 'new'
                      ? 'Weights below are calibrated for someone newer to lifting. Start at the low end — nail the form for every rep before you add load.'
                      : 'Weights below are dialed back to match your experience. Pick a load you can move cleanly, and add only when form holds.'}
                  </span>
                </div>
              )}
              <div className="space-y-2">
                {exercises.map((ex, i) => (
                  <ExerciseCard
                    key={i}
                    exercise={ex}
                    index={i + 1}
                    progression={progressionByExercise?.get(normalizeExerciseName(ex.name)) ?? null}
                    strengthLevel={strengthLevel}
                    strengthCapacity={strengthCapacity}
                  />
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
                  <ExerciseCard
                    key={i}
                    exercise={ex}
                    index={i + 1}
                    progression={progressionByExercise?.get(normalizeExerciseName(ex.name)) ?? null}
                  />
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

          {/* Structured PlannedWorkout breakdown — generated plans */}
          {hasPlannedWorkout && (
            <div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">⚡ Workout Breakdown</p>
              <div className="space-y-1.5">
                {plannedWorkout!.segments.map((seg, i) => (
                  <PlannedSegmentCard key={i} segment={seg} index={i} />
                ))}
              </div>
              {plannedWorkout!.notes && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 italic mt-2 leading-snug">{plannedWorkout!.notes}</p>
              )}
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
          {isRunType && !isDrillDay && drillDayLabel && (
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
              <p className="text-sm font-semibold text-blue-800">💡 Drills & Myrtl Tip</p>
              <p className="text-sm text-blue-700 mt-1">
                Running drills and the Myrtl hip routine are scheduled for your {drillDayLabel} run this week.
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

function ExerciseCard({
  exercise, index, progression, strengthLevel, strengthCapacity,
}: {
  exercise: ParsedExercise
  index: number
  progression?: ExerciseProgression | null
  strengthLevel?: StrengthExperience
  strengthCapacity?: StrengthCapacity | null
}) {
  const [expanded, setExpanded] = useState(false)
  const guide = exercise.guide
  // Default loads in the guide are calibrated to the athlete's lifting
  // background (newer lifters get lighter prescriptions). Display-only —
  // never mutates the plan.
  const displayWeight = guide ? calibrateGuideWeight(guide.weight, strengthLevel, { capacity: strengthCapacity, exerciseName: guide.name }) : ''

  const plannedSets = parseInt(exercise.sets || '0', 10) || 0
  const plannedReps = parseInt((exercise.reps || '0').toString(), 10) || 0
  const target = progression && progression.last
    ? suggestNextTarget(progression, plannedSets, plannedReps)
    : null

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
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 ml-7">{displayWeight} · {guide.rest}</p>
        )}
        {!expanded && progression?.last && target && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 ml-7">
            <span className="text-slate-400">Last:</span> {progression.last.topWeightLb > 0 ? `${progression.last.topWeightLb} lb · ` : ''}
            {Math.round(progression.last.totalReps / Math.max(1, progression.last.sets.length))}/set (Wk {progression.last.weekNum})
            {' · '}
            <span className={target.tier === 'progress' ? 'text-emerald-600 dark:text-emerald-400 font-medium' : target.tier === 'deload' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}>
              Try: {target.weightLb > 0 ? `${target.weightLb} lb · ` : ''}{target.reps}/set
            </span>
          </p>
        )}
      </div>

      {expanded && guide && (
        <div className="px-3 pb-3 border-t border-purple-100 pt-2 space-y-2">
          <p className="text-sm text-slate-500 dark:text-slate-400 italic">{guide.aka}</p>
          <div className="flex gap-3 text-sm">
            <span className="text-purple-700 bg-purple-50 rounded px-2 py-1">💪 {displayWeight}</span>
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
          {progression && progression.sessions.length > 0 && (
            <div className="pt-2 border-t border-purple-100 dark:border-purple-900">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1">📈 Your progression ({progression.sessions.length} session{progression.sessions.length === 1 ? '' : 's'})</p>
              <ProgressionDetail progression={progression} target={target} plannedSets={plannedSets} plannedReps={plannedReps} />
            </div>
          )}
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

function ProgressionDetail({
  progression, target, plannedSets, plannedReps,
}: {
  progression: ExerciseProgression
  target: ReturnType<typeof suggestNextTarget> | null
  plannedSets: number
  plannedReps: number
}) {
  // Show the most recent ~6 sessions chronologically with a visual delta
  const recent = progression.sessions.slice(-6)
  const firstWeight = recent[0]?.topWeightLb ?? 0
  const lastWeight = progression.last?.topWeightLb ?? 0
  const delta = lastWeight - firstWeight
  const deltaPct = firstWeight > 0 ? Math.round((delta / firstWeight) * 100) : 0

  return (
    <div className="space-y-2">
      <div className="text-xs space-y-1">
        {recent.map((s, i) => {
          const reps = s.sets.length > 0 ? Math.round(s.totalReps / s.sets.length) : 0
          const isLast = i === recent.length - 1
          return (
            <div key={i} className="flex items-center justify-between font-mono text-slate-600 dark:text-slate-300">
              <span className="text-slate-400">Wk {s.weekNum}</span>
              <span className={isLast ? 'font-semibold text-slate-700 dark:text-slate-200' : ''}>
                {s.topWeightLb > 0 ? `${s.topWeightLb} lb` : 'BW'} × {reps} × {s.sets.length}
              </span>
            </div>
          )
        })}
      </div>

      {progression.sessions.length >= 2 && lastWeight > 0 && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {delta > 0
            ? <>Up <span className="font-semibold text-emerald-600 dark:text-emerald-400">+{delta} lb</span> ({deltaPct >= 0 ? '+' : ''}{deltaPct}%) from your first logged session.</>
            : delta < 0
              ? <>Down <span className="font-semibold text-amber-600 dark:text-amber-400">{delta} lb</span> from your first logged session — likely a deload week.</>
              : <>Holding steady at {lastWeight} lb across {progression.sessions.length} sessions.</>}
        </p>
      )}

      {target && (
        <div className={`rounded-md px-2 py-1.5 text-xs ${
          target.tier === 'progress'
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-100 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900'
            : target.tier === 'deload'
              ? 'bg-amber-50 text-amber-800 border border-amber-100 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900'
              : target.tier === 'starting'
                ? 'bg-slate-50 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                : 'bg-purple-50 text-purple-800 border border-purple-100 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-900'
        }`}>
          <p className="font-semibold">
            🎯 Try today: {target.weightLb > 0 ? `${target.weightLb} lb` : 'bodyweight'} × {target.reps} reps × {target.sets} sets
            {plannedSets > 0 && plannedReps > 0 && plannedSets !== target.sets && plannedReps !== target.reps && (
              <span className="font-normal text-[10px] ml-1 opacity-70">(plan said {plannedSets}×{plannedReps})</span>
            )}
          </p>
          <p className="mt-0.5 leading-snug">{target.rationale}</p>
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

function formatDurationOrDistance(seg: PlannedSegment): string {
  const parts: string[] = []
  if (seg.duration) {
    parts.push(`${seg.duration.value} ${seg.duration.unit}`)
  }
  if (seg.distance) {
    parts.push(`${seg.distance.value} ${seg.distance.unit}`)
  }
  if (seg.reps && seg.reps > 1) {
    parts.unshift(`${seg.reps} ×`)
  }
  return parts.join(' ')
}

function formatPaceSecondsPerMile(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}/mi`
}

function formatPaceTarget(seg: PlannedSegment): string | null {
  const t = seg.paceTarget
  if (!t) return null
  // Show the strongest signal first per `preferredMode`, but stack additional
  // hints (HR + RPE) when available so the athlete has multiple cues.
  const parts: string[] = []
  // Suppress physically-impossible (corrupt) sub-minute paces — show HR/RPE
  // instead of rendering "0:17/mi".
  if (isDisplayablePace(t.paceSecPerMileLow, t.paceSecPerMileHigh)) {
    parts.push(`${formatPaceSecondsPerMile(t.paceSecPerMileHigh!)} – ${formatPaceSecondsPerMile(t.paceSecPerMileLow!)}`)
  }
  if (t.hrBpmLow != null && t.hrBpmHigh != null) {
    parts.push(`${t.hrBpmLow}-${t.hrBpmHigh} bpm`)
  }
  if (t.rpeLow != null && t.rpeHigh != null) {
    parts.push(`RPE ${t.rpeLow}-${t.rpeHigh}`)
  }
  return parts.length > 0 ? `${t.displayName} · ${parts.join(' · ')}` : t.displayName
}

function formatRecovery(seg: PlannedSegment): string | null {
  const r = seg.recovery
  if (!r) return null
  const verb = r.type === 'walk' ? 'walk' : r.type === 'stand' ? 'standing rest' : 'easy jog'
  if (r.duration) return `${r.duration.value} ${r.duration.unit} ${verb}`
  if (r.distance) return `${r.distance.value} ${r.distance.unit} ${verb}`
  return verb
}

function PlannedSegmentCard({ segment, index }: { segment: PlannedSegment; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const isMain = segment.role === 'main'
  const bgColor = isMain
    ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900'
    : 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900'
  const numColor = isMain
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200'
    : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200'

  const label = segment.role === 'warmup' ? 'Warm-Up' : segment.role === 'cooldown' ? 'Cool-Down' : 'Main Set'
  const dur = formatDurationOrDistance(segment)
  const target = formatPaceTarget(segment)
  const recovery = formatRecovery(segment)
  const hasDetails = !!segment.description || !!segment.cue || !!recovery

  return (
    <div
      className={`rounded-xl border overflow-hidden ${bgColor}`}
      onClick={() => hasDetails && setExpanded(!expanded)}
    >
      <div className={`px-3 py-2 ${hasDetails ? 'cursor-pointer' : ''}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-sm font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 ${numColor}`}>
              {index + 1}
            </span>
            <span className="text-base font-medium text-slate-800 dark:text-white truncate">{label}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {dur && <span className="text-sm text-slate-600 dark:text-slate-300">{dur}</span>}
            {hasDetails && <span className="text-slate-400 text-sm">{expanded ? '▼' : '›'}</span>}
          </div>
        </div>
        {target && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 ml-8">{target}</p>
        )}
        {recovery && !expanded && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 ml-8">Recovery: {recovery}</p>
        )}
      </div>

      {expanded && hasDetails && (
        <div className="px-3 pb-2.5 border-t border-slate-200 dark:border-slate-700/50 pt-2 space-y-1.5">
          {segment.description && (
            <p className="text-sm text-slate-600 dark:text-slate-300">{segment.description}</p>
          )}
          {recovery && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <span className="font-medium">Recovery:</span> {recovery}
            </p>
          )}
          {segment.cue && (
            <p className="text-sm text-slate-600 dark:text-slate-300 italic">💡 {segment.cue}</p>
          )}
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
  const fallback = generateWorkoutTake(day, readiness, latestPerf ?? null)

  // This card slot serves two LLM modes plus a heuristic fallback:
  //   1. Completed day → a post-workout DEBRIEF (workout_debrief surface).
  //      We hand the LLM *this* day's planned-vs-actual + RPE/notes payload
  //      as lastCompletedWorkout so it reflects on the run in front of the
  //      athlete — which fixes the old today-centric problem that forced the
  //      LLM off for completed days. Reconciles the grade against RPE/notes
  //      and learns durable patterns server-side.
  //   2. Today's upcoming day → the pre-run "Coach's take" (workout_take).
  //   3. Any other day → the day-specific heuristic (generateWorkoutTake).
  const isCompleted = !!day.actual
  const todayLabel = coachSnapshot?.plannedToday?.day
  const isToday = !!todayLabel && todayLabel === day.day

  // For a completed day, build a snapshot whose lastCompletedWorkout is THIS
  // workout (not the globally-most-recent one), so the debrief targets it.
  const debriefSnapshot = useMemo(() => {
    if (!isCompleted || !coachSnapshot) return null
    const payload = buildCompletedWorkoutPayload(day, weekNum, 0)
    return payload ? { ...coachSnapshot, lastCompletedWorkout: payload } : null
  }, [isCompleted, coachSnapshot, day, weekNum])

  const useDebrief = isCompleted && !!debriefSnapshot
  const useTake = isToday && !isCompleted

  // The completed-workout debrief is long-form and costs LLM tokens, so we
  // keep it collapsed by default and only fetch it when the athlete taps
  // "Tell me more". The pre-run take (today, not yet done) stays eager —
  // it's the thing the athlete opened the modal to read.
  const [debriefExpanded, setDebriefExpanded] = useState(false)
  const fetchDebrief = useDebrief && debriefExpanded
  const fetchLLM = useTake || fetchDebrief
  const { insight, loading } = useCoachInsight({
    athleteId: athleteId || '',
    surface: useDebrief ? `workout_debrief:${day.day}` : `workout_take:${day.day}`,
    snapshot: useDebrief ? debriefSnapshot : (coachSnapshot ?? null),
    enabled: fetchLLM && !!athleteId && !!coachSnapshot,
    fallbackText: fallback.text,
    fallbackTip: fallback.tip,
  })
  return (
    <CoachWorkoutTakeView
      take={fallback}
      // When collapsed, pass no insight so the minimal heuristic summary
      // shows; expanding swaps in the long-form LLM debrief.
      insight={fetchLLM ? insight : null}
      loading={fetchLLM ? loading : false}
      onAsk={onAsk}
      coachName={coachSnapshot?.coachPersona?.name?.trim() || DEFAULT_COACH_NAME}
      athleteId={athleteId}
      persona={coachSnapshot?.coachPersona}
      expandable={useDebrief}
      expanded={debriefExpanded}
      onToggleExpand={() => setDebriefExpanded(v => !v)}
    />
  )
}

// ─── AmPmWeatherStrip ─────────────────────────────────────────
// Side-by-side morning + evening forecast for the planned day. Lets
// the athlete eyeball "I could go at 7am at 55°F or 5pm at 77°F" and
// pick a slot before the workout. Only renders when the day falls in
// the hourly forecast window (~7 days); past that, no chip — the
// daily aggregate elsewhere is the right view.
function AmPmWeatherStrip({
  dayLabel,
  hourly,
}: {
  dayLabel: string
  hourly: NonNullable<NonNullable<CoachSnapshot['weatherForecast']>['hourly']>
}) {
  // Convert "Mon 4/15" → "2026-04-15" using the current year. Not
  // perfect for plans that span Dec/Jan but the BA 18K plan stays in
  // a single year and this surface is best-effort.
  const isoDate = useMemo(() => {
    const year = String(new Date().getFullYear())
    return dayLabelToISO(dayLabel, `${year}-01-01`)
  }, [dayLabel])
  if (!isoDate) return null

  const morning = forecastForHour({ hourly } as Parameters<typeof forecastForHour>[0], isoDate, 7)
  const evening = forecastForHour({ hourly } as Parameters<typeof forecastForHour>[0], isoDate, 17)
  if (!morning && !evening) return null

  const morningChip = morning ? buildWeatherChipFromHour(morning) : null
  const eveningChip = evening ? buildWeatherChipFromHour(evening) : null

  function pillClass(accent?: 'neutral' | 'warn' | 'swap'): string {
    if (accent === 'swap') return 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
    if (accent === 'warn') return 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'
    return 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-700">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-2">
        Pick your slot — forecast at the training location
      </p>
      <div className="grid grid-cols-2 gap-2">
        {morningChip ? (
          <div className={`rounded-lg border px-2 py-1.5 ${pillClass(morningChip.accent)}`}>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">🌅 Morning · {formatHourLabel(morning!.hour)}</p>
            <p className="text-base font-semibold text-slate-800 dark:text-slate-100 mt-0.5">
              {morningChip.icon} {morningChip.tempLabel}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {morningChip.warningLabel || describeWeatherCode(morning!.weatherCode).label}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 px-2 py-1.5 text-[11px] italic text-slate-400">No morning data</div>
        )}
        {eveningChip ? (
          <div className={`rounded-lg border px-2 py-1.5 ${pillClass(eveningChip.accent)}`}>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">🌇 Evening · {formatHourLabel(evening!.hour)}</p>
            <p className="text-base font-semibold text-slate-800 dark:text-slate-100 mt-0.5">
              {eveningChip.icon} {eveningChip.tempLabel}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {eveningChip.warningLabel || describeWeatherCode(evening!.weatherCode).label}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 px-2 py-1.5 text-[11px] italic text-slate-400">No evening data</div>
        )}
      </div>
    </div>
  )
}

// ─── CoachWhyForDay ───────────────────────────────────────────
// Lazy-fetched "Why this workout?" panel. Mechanism + personal signal
// + ONE citation, generated by the `why` insight surface. Stays
// collapsed by default so we don't pay for tokens unless the athlete
// explicitly asks for the rationale. Once expanded, the insight is
// cached per (athlete, day, snapshot hash) for 48h.
function CoachWhyForDay({
  day,
  weekNum,
  athleteId,
  coachSnapshot,
  onAsk,
}: {
  day: PlannedDay
  weekNum: number
  athleteId?: string
  coachSnapshot?: CoachSnapshot | null
  onAsk?: (seed: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  // Stable surface key: ties to (weekNum, day label) so the same workout
  // across plan re-renders shares a cache. Doesn't include readiness —
  // the insight hook factors that into the contextHash automatically.
  const surface = `why:w${weekNum}:${day.day}`
  const { insight, loading } = useCoachInsight({
    athleteId: athleteId || '',
    surface,
    snapshot: coachSnapshot ?? null,
    enabled: expanded && !!athleteId && !!coachSnapshot,
  })
  const text = insight?.text?.trim() || ''
  return (
    <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
        aria-expanded={expanded}
      >
        <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
          <span aria-hidden>🧠</span> Why this workout?
        </span>
        <span className="text-xs text-indigo-500 dark:text-indigo-400">
          {expanded ? '▴' : '▾'}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-indigo-100 dark:border-indigo-900/50">
          {loading && !text && (
            <div className="space-y-1.5 py-1 animate-pulse">
              <div className="h-3 w-full bg-indigo-200/60 rounded" />
              <div className="h-3 w-5/6 bg-indigo-200/40 rounded" />
              <div className="h-3 w-4/6 bg-indigo-200/40 rounded" />
            </div>
          )}
          {!loading && !text && (
            <p className="text-xs text-slate-500 dark:text-slate-400 italic py-1">
              Coach is offline — try again after Garmin syncs.
            </p>
          )}
          {text && (
            <div className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line">
              {text}
            </div>
          )}
          {text && onAsk && (
            <button
              onClick={() => onAsk(`Tell me more about why this workout: ${day.workout}`)}
              className="mt-2 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-indigo-100"
            >
              Ask about this →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
