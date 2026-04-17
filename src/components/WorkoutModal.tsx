import { useEffect, useState } from 'react'
import type { PlannedDay, HRZone, ReadinessScore, PerformanceMetrics, CoachSnapshot } from '../types'
import { getWorkoutStyle } from '../utils/styles'
import { getCoaching } from '../utils/coaching'
import { generateWorkoutTake } from '../utils/coachNotes'
import CoachWorkoutTakeView from './CoachWorkoutTake'
import { useCoachInsight } from '../hooks/useCoachInsight'
import { formatMiles, formatSeconds, estimateRunTime } from '../utils/format'
import { parseRoutine, type ParsedExercise } from '../utils/exercises'
import { parseIntervalWorkout, getDrillDay, RUNNING_DRILLS, MYRTL_ROUTINE, PRE_RUN_ACTIVATION, type RunSegment, type DrillGuide } from '../utils/drills'
import { fetchActivityStreams, getTokens, isTokenExpired, refreshAccessToken, type StreamData } from '../utils/strava'
import { fetchGarminActivityStream } from '../utils/garmin'
import HRChart from './HRChart'
import PaceChart from './PaceChart'

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
}

export default function WorkoutModal({ day, weekNum, onClose, zones, athleteId, coachEnabled, readiness, latestPerf, coachSnapshot, onAskCoach }: WorkoutModalProps) {
  const style = getWorkoutStyle(day.type)
  const coaching = getCoaching(day, weekNum)
  const actual = day.actual
  const isStrength = day.type === 'strength'
  const isQuality = day.type === 'quality'
  const isRunType = ['run', 'quality', 'long'].includes(day.type)
  const exercises = isStrength ? parseRoutine(day.detail) : []
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
        // Prefer Garmin if the actual came from Garmin
        if (actual!.source === 'garmin' && actual!.garminId) {
          const data = await fetchGarminActivityStream(actual!.garminId, athleteId)
          if (!cancelled && data) {
            setStream(data)
            return
          }
        }
        // Strava fallback (or primary source)
        if (actual!.stravaId) {
          const tokens = getTokens()
          if (!tokens) return
          let accessToken = tokens.accessToken
          if (isTokenExpired(tokens)) {
            const refreshed = await refreshAccessToken(tokens.refreshToken)
            accessToken = refreshed.accessToken
          }
          const data = await fetchActivityStreams(accessToken, actual!.stravaId)
          if (!cancelled) setStream(data)
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />

      <div
        className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="sticky top-0 px-3 pt-3 pb-2 rounded-t-2xl z-10"
          style={{ backgroundColor: style.bg, borderBottom: `2px solid ${style.border}` }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{style.label}</span>
              <div>
                <p className="font-bold text-base text-slate-800 leading-tight">{day.day} <span className="font-normal text-sm text-slate-500">Wk {weekNum}</span></p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-white/70 text-slate-600 hover:bg-white transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="font-semibold text-base text-slate-800 mt-1">{day.workout}</p>
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
              <div className="mt-1 space-y-0.5 text-sm text-slate-600">
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
            <div className="bg-teal-50 rounded-xl p-3 border border-teal-200 space-y-2">
              <p className="text-sm font-semibold text-teal-800 uppercase tracking-wide">
                {/* Source-agnostic label — just show activity name.
                    The source (Strava sync vs. Garmin) is metadata,
                    not something users need prefixed every time. */}
                {actual.source === 'manual' || actual.type === 'Manual' ? '📝 ' : '🏃 '}
                {actual.name}
              </p>
              <div className="grid grid-cols-2 gap-2 text-base text-teal-700">
                {actual.distance > 0 && <span>📏 {formatMiles(actual.distance)}</span>}
                {actual.movingTime > 0 && <span>⏱ {formatSeconds(actual.movingTime)}</span>}
                {actual.avgHR && <span>❤️ {actual.avgHR} avg HR</span>}
                {actual.maxHR && <span>💓 {actual.maxHR} max HR</span>}
                {actual.elevationGain > 0 && <span>⛰ {actual.elevationGain} ft gain</span>}
                {actual.sufferScore && <span>🔥 {actual.sufferScore} relative effort</span>}
                {actual.calories && <span>🔋 {actual.calories} cal</span>}
                {actual.avgCadence && <span>👟 {Math.round(actual.avgCadence * 2)} spm</span>}
                {actual.elevHigh && <span>📈 {actual.elevHigh} ft high</span>}
                {actual.elevLow && <span>📉 {actual.elevLow} ft low</span>}
              </div>
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
                      'bg-slate-100 text-slate-600'
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
                    {actual.source === 'garmin' ? '⌚ Exercise Sets (from watch)' : '💪 Strength Log'}
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
                            <span key={j} className="text-xs text-teal-700 bg-white/60 rounded px-1.5 py-0.5">
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

              {/* HR Stream Chart */}
              {stream && stream.heartrate.length > 0 && (
                <div className="mt-2">
                  <HRChart stream={stream} zones={zones} />
                </div>
              )}
              {stream && stream.velocity && stream.velocity.length > 0 && (
                <PaceChart stream={stream} />
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
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">🔥 Pre-Run Activation (~3 min)</p>
              <p className="text-sm text-slate-600 mb-2">Do these BEFORE your run to wake up your glutes and hips. Quick and targeted.</p>
              <div className="space-y-1.5">
                {PRE_RUN_ACTIVATION.map((drill, i) => (
                  <DrillCard key={i} drill={drill} />
                ))}
              </div>
            </div>
          )}

          {/* Purpose */}
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1">🎯 Purpose</p>
            <p className="text-base text-slate-700 leading-relaxed">{coaching.purpose}</p>
          </div>

          {/* How to Execute */}
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1">📋 How to Execute</p>
            <ul className="space-y-1.5">
              {coaching.execution.map((tip, i) => (
                <li key={i} className="text-base text-slate-700 flex gap-2">
                  <span className="text-slate-400 shrink-0">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Strength: Exercise-by-exercise guide */}
          {isStrength && exercises.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">🏋️ Exercise Guide (tap for form cues)</p>
              <div className="space-y-2">
                {exercises.map((ex, i) => (
                  <ExerciseCard key={i} exercise={ex} index={i + 1} />
                ))}
              </div>
            </div>
          )}

          {/* Quality: Interval breakdown */}
          {isQuality && intervals.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">⚡ Interval Breakdown</p>
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
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">🏃 Post-Run: Running Drills (~8 min)</p>
              <p className="text-sm text-slate-600 mb-2">Do these after your run while muscles are warm, before stretching. Builds speed and coordination.</p>
              <div className="space-y-1.5">
                {RUNNING_DRILLS.map((drill, i) => (
                  <DrillCard key={i} drill={drill} />
                ))}
              </div>
            </div>
          )}

          {isDrillDay && (
            <div>
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">🦵 Post-Run: Full Myrtl Hip Routine (~10 min)</p>
              <p className="text-sm text-slate-600 mb-2">Full hip strengthening after drills. You did the abbreviated version pre-run — now go deep while muscles are warm.</p>
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
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1">🧠 Mindset</p>
            <p className="text-base text-slate-700 italic leading-relaxed">{coaching.mindset}</p>
          </div>

          {/* Nutrition */}
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1">🍌 Nutrition</p>
            <p className="text-base text-slate-700">{coaching.nutrition}</p>
          </div>

          {/* Recovery */}
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1">🔄 Recovery</p>
            <p className="text-base text-slate-700">{coaching.recovery}</p>
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
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
        <span className="text-xl">🤸</span>
        <div className="flex-1">
          <p className="text-base font-semibold text-slate-700">Drills not yet logged</p>
          <p className="text-sm text-slate-500">Open the Log modal to check off drills as you do them.</p>
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
      className="bg-white rounded-xl border border-purple-200 overflow-hidden"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="px-3 py-2.5 cursor-pointer">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-purple-600 bg-purple-100 rounded-full w-5 h-5 flex items-center justify-center shrink-0">
              {index}
            </span>
            <span className="text-base font-medium text-slate-800">
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
          <p className="text-sm text-slate-500 mt-0.5 ml-7">{guide.weight} · {guide.rest}</p>
        )}
      </div>

      {expanded && guide && (
        <div className="px-3 pb-3 border-t border-purple-100 pt-2 space-y-2">
          <p className="text-sm text-slate-500 italic">{guide.aka}</p>
          <div className="flex gap-3 text-sm">
            <span className="text-purple-700 bg-purple-50 rounded px-2 py-1">💪 {guide.weight}</span>
            <span className="text-purple-700 bg-purple-50 rounded px-2 py-1">⏸ {guide.rest}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-600 mb-1">Form Cues:</p>
            <ol className="space-y-1">
              {guide.form.map((cue, i) => (
                <li key={i} className="text-sm text-slate-600 flex gap-1.5">
                  <span className="text-slate-400 shrink-0">{i + 1}.</span>
                  <span>{cue}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {expanded && !guide && (
        <div className="px-3 pb-3 border-t border-purple-100 pt-2">
          <p className="text-sm text-slate-500">No detailed guide available for this exercise yet.</p>
        </div>
      )}
    </div>
  )
}

function IntervalSegment({ segment, index }: { segment: RunSegment; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const isWarmCool = segment.label === 'Warm-Up' || segment.label === 'Cool-Down'
  const isRecovery = segment.label.startsWith('Recovery')
  const bgColor = isWarmCool ? 'bg-green-50 border-green-200' : isRecovery ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-200'
  const numColor = isWarmCool ? 'bg-green-100 text-green-700' : isRecovery ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'

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
            <span className="text-base font-medium text-slate-800">{segment.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">{segment.duration}</span>
            <span className="text-slate-400 text-sm">{expanded ? '▼' : '›'}</span>
          </div>
        </div>
        <p className="text-sm text-slate-500 mt-0.5 ml-8">{segment.effort}</p>
      </div>

      {expanded && (
        <div className="px-3 pb-2.5 border-t border-slate-200/50 pt-2">
          <ul className="space-y-1">
            {segment.cues.map((cue, i) => (
              <li key={i} className="text-sm text-slate-600 flex gap-1.5">
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
      className="bg-white rounded-xl border border-blue-200 overflow-hidden"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="px-3 py-2.5 cursor-pointer">
        <div className="flex items-center justify-between">
          <span className="text-base font-medium text-slate-800">{drill.name}</span>
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
              <li key={i} className="text-sm text-slate-600 flex gap-1.5">
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
