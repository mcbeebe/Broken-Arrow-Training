import { useMemo, useState } from 'react'
import type { ActualWorkout, PlannedDay, StrengthExerciseLog, TrainingWeek, DrillLog } from '../types'
import { getPlannedDrills } from '../utils/drills'
import { isGymBasedDay } from '../utils/matching'
import StrengthSetEditor from './StrengthSetEditor'
import ExercisePicker from './ExercisePicker'
import { ghostFillFromHistory, progressionFromWeeks, parsePlanExercises, type StrengthCalibration } from '../utils/strengthDraft'
import type { StrengthExperience } from '../hooks/useOnboarding'
import type { StrengthCapacity } from '../engines/strength/benchmark'

// Fallback drill menu shown on run days when plan detail doesn't spell out
// specific drills — matches the routine described in WorkoutModal's drill
// guides so the user sees a consistent checklist.
const DEFAULT_DRILL_ITEMS = [
  'Dynamic warm-up (leg swings, hip openers)',
  'A-skips 2×30m',
  'B-skips 2×30m',
  'High knees 2×30m',
  'Butt kicks 2×30m',
  'Strides 4×100m',
  'Myrtl / hip activation',
]

type LogMode = 'run' | 'strength'

interface ManualLogProps {
  dayLabel: string
  existing?: ActualWorkout
  planned?: PlannedDay
  weekNum?: number
  /** Full plan history — powers "Last time" ghost values and the "Try
   *  today" progression target in the strength editor. Optional: without
   *  it the editor still works, just without history. */
  allWeeks?: TrainingWeek[]
  /** Cold-start calibration: lifting background + measured benchmark.
   *  Ghost weights for never-logged exercises come from these. */
  strengthLevel?: StrengthExperience
  strengthCapacity?: StrengthCapacity | null
  onSave: (data: ActualWorkout) => void
  onClose: () => void
  /** True when a MANUAL entry exists for this day. Manual entries are
   *  applied after all syncing and override matched data — this powers
   *  the escape hatch below. */
  hasManualEntry?: boolean
  /** Delete the day's manual entry so synced data takes over again. */
  onRemove?: () => void
}

/**
 * Build an ISO date string from a day label like "Mon 4/13" or "W1D1 — Mon 4/13".
 * Falls back to today if parsing fails.
 */
function buildStartDate(dayLabel: string): string {
  const match = dayLabel.match(/(\d{1,2})\/(\d{1,2})/)
  if (match) {
    const month = parseInt(match[1])
    const day = parseInt(match[2])
    const year = new Date().getFullYear()
    const d = new Date(year, month - 1, day, 8, 0, 0) // assume 8 AM
    return d.toISOString()
  }
  return new Date().toISOString()
}

/**
 * Parse planned time string (e.g., "45-50 min", "1:15", "50 min") to minutes.
 */
function parsePlannedTime(timeStr: string): number {
  if (!timeStr) return 0
  // Handle "45-50 min" → take the midpoint
  const rangeMatch = timeStr.match(/(\d+)\s*[-–]\s*(\d+)/)
  if (rangeMatch) return Math.round((parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2)
  // Handle "1:15" → 75
  const colonMatch = timeStr.match(/(\d+):(\d+)/)
  if (colonMatch) return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2])
  // Handle "50 min" or just "50"
  const numMatch = timeStr.match(/(\d+)/)
  return numMatch ? parseInt(numMatch[1]) : 0
}

export default function ManualLog({ dayLabel, existing, planned, allWeeks, strengthLevel, strengthCapacity, onSave, onClose, hasManualEntry, onRemove,
}: ManualLogProps) {
  // Field bug: the Station circuit — the day's MAIN workout — opened on
  // the Run/Cardio tab with its exercises buried under "Mobility /
  // Activation". Gym-based cross days (route Gym, station circuits) are
  // strength sessions to the athlete logging them: default to the
  // Strength tab with the circuit as the main exercise list.
  const isGymCircuitDay = !!planned && planned.type === 'cross' && isGymBasedDay(planned)
  const isStrength = existing?.strengthLog?.length
    || existing?.type?.toLowerCase().includes('strength')
    || existing?.name?.toLowerCase().includes('strength')
    || planned?.type === 'strength'
    || (isGymCircuitDay && !existing?.distance)
  const [mode, setMode] = useState<LogMode>(isStrength ? 'strength' : 'run')

  // Pre-populate from existing actual, or fall back to planned workout
  const plannedName = planned?.workout || ''
  const plannedTime = planned?.time ? parsePlannedTime(planned.time) : 0

  const [name, setName] = useState(existing?.name || plannedName)
  const [time, setTime] = useState(
    existing ? String(Math.round(existing.movingTime / 60))
    : plannedTime > 0 ? String(plannedTime)
    : ''
  )
  const [hr, setHr] = useState(existing?.avgHR?.toString() || '')
  const [notes, setNotes] = useState(existing?.notes || '')
  const [rpe, setRpe] = useState(existing?.rpe?.toString() || '')

  // Run fields
  const [distance, setDistance] = useState(existing?.distance?.toString() || '')
  const [elevation, setElevation] = useState(existing?.elevationGain?.toString() || '')

  // Strength fields. The prescription is the draft: strength days AND
  // gym-circuit days open with the plan's exercises pre-imported, reps
  // from the prescription, weights ghosted from the athlete's last
  // session of each exercise, every row unchecked until confirmed.
  // (The Import-from-plan button remains for re-syncing after edits.)
  const progression = useMemo(() => progressionFromWeeks(allWeeks), [allWeeks])
  const calibration = useMemo<StrengthCalibration>(
    () => ({ level: strengthLevel, capacity: strengthCapacity }),
    [strengthLevel, strengthCapacity],
  )
  const [exercises, setExercises] = useState<StrengthExerciseLog[]>(() => {
    if (existing?.strengthLog?.length) return existing.strengthLog
    if ((planned?.type === 'strength' || isGymCircuitDay) && planned?.detail) {
      return ghostFillFromHistory(parsePlanExercises(planned.detail), progression, calibration)
    }
    return []
  })

  // Drills — shown for any run-type day. If the plan detail explicitly
  // lists drills, use those; otherwise fall back to either (a) the
  // default drill menu when this is the scheduled "drill day" for the
  // week, or (b) just a Dynamic warm-up line for other easy-run days so
  // the user can still mark it done.
  const runTypes = new Set(['run', 'long', 'quality', 'race'])
  const isRunDay = planned ? runTypes.has(planned.type) : mode === 'run'
  const isCrossDay = planned?.type === 'cross'
  const plannedDrillsFromDetail = planned ? getPlannedDrills(planned) : []
  const isScheduledDrillDay = !!planned?.isDrillDay
  const fallbackDrills = isScheduledDrillDay
    ? DEFAULT_DRILL_ITEMS
    : isRunDay
      ? ['Dynamic warm-up (leg swings, hip openers)']
      : []
  const plannedDrills = plannedDrillsFromDetail.length > 0
    ? plannedDrillsFromDetail
    : fallbackDrills
  // On a gym-circuit day the "drills" parsed from detail ARE the main
  // workout — never resurface them as Mobility/Activation on the cardio
  // tab (they live on the Strength tab as exercises now).
  const hasPlannedDrills = mode === 'run' && (plannedDrills.length > 0 || isCrossDay) && !isGymCircuitDay
  const [drillsCompleted, setDrillsCompleted] = useState<boolean>(
    existing?.drills?.completed ?? false
  )
  const [drillItems, setDrillItems] = useState<{ name: string; done: boolean }[]>(
    existing?.drills?.items
      ?? plannedDrills.map(name => ({ name, done: false }))
  )
  const [drillDurationMin, setDrillDurationMin] = useState<string>(
    existing?.drills?.durationMin?.toString() ?? ''
  )
  const [drillNotes, setDrillNotes] = useState<string>(existing?.drills?.notes ?? '')

  function handleSave() {
    // Only persist drills block when relevant (run mode, drills planned OR user toggled it)
    const drills: DrillLog | undefined = (mode === 'run' && (hasPlannedDrills || drillsCompleted))
      ? {
          completed: drillsCompleted,
          items: drillItems.length > 0 ? drillItems : undefined,
          durationMin: drillDurationMin ? parseInt(drillDurationMin) : undefined,
          notes: drillNotes || undefined,
        }
      : existing?.drills

    const entry: ActualWorkout = {
      ...existing,                    // Preserve ALL existing fields (Garmin HR, TE, EPOC, zones, etc.)
      stravaId: existing?.stravaId || Date.now(),
      distance: mode === 'run' ? (parseFloat(distance) || 0) : (existing?.distance ?? 0),
      movingTime: (parseInt(time) || 0) * 60,
      elapsedTime: (parseInt(time) || 0) * 60,
      avgHR: parseInt(hr) || existing?.avgHR,
      maxHR: existing?.maxHR,         // Preserve (was hardcoded to undefined)
      elevationGain: mode === 'run' ? (parseInt(elevation) || 0) : (existing?.elevationGain ?? 0),
      type: existing?.type || (mode === 'strength' ? 'strength_training' : 'running'),
      name: name || (mode === 'strength' ? `Strength — ${dayLabel}` : `Run — ${dayLabel}`),
      startDate: existing?.startDate || buildStartDate(dayLabel),
      notes,
      rpe: parseInt(rpe) || existing?.rpe || undefined,
      strengthLog: mode === 'strength'
        ? exercises.filter(ex => ex.name.trim().length > 0)
        : existing?.strengthLog,
      drills,
    }
    onSave(entry)
  }

  function toggleDrillItem(idx: number) {
    setDrillItems(drillItems.map((it, i) => i === idx ? { ...it, done: !it.done } : it))
  }

  // "+ Add Exercise" opens the picker (plan → recents → library, with
  // free text as the escape hatch) so names stay canonical and history
  // stays stitched.
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-slate-800 px-4 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 dark:text-white">Log Workout — {dayLabel}</h3>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">✕</button>
          </div>

          {/* Mode toggle */}
          <div className="flex mt-3 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setMode('run')}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                mode === 'run' ? 'bg-teal-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              🏃 Run / Cardio
            </button>
            <button
              onClick={() => setMode('strength')}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                mode === 'strength' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              💪 Strength
            </button>
          </div>
        </div>

        <div className="px-4 py-4 space-y-3">
          {/* Show planned workout as reference — always visible so user can
              see what was prescribed and add exercises Garmin missed */}
          {planned && (
            <div className="bg-teal-50 rounded-lg px-3 py-2 border border-teal-200">
              <p className="text-[10px] font-semibold text-teal-600 uppercase tracking-wide mb-0.5">
                {existing ? 'Planned (for reference)' : 'Planned Workout'}
              </p>
              <p className="text-xs text-teal-800 font-medium">{planned.workout}</p>
              {planned.detail && (
                <p className="text-[10px] text-teal-600 mt-0.5">{planned.detail}</p>
              )}
              {planned.zone && planned.zone !== '—' && (
                <p className="text-[10px] text-teal-500 mt-0.5">Zone: {planned.zone} · Time: {planned.time}</p>
              )}
            </div>
          )}

          <Field label="Activity name" placeholder={mode === 'strength' ? 'BFT Class, Gym Session, etc.' : 'Morning Run, Trail Run, etc.'} value={name} onChange={setName} />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Time (min)" placeholder="50" value={time} onChange={setTime} type="number" />
            <Field label="Avg HR (bpm)" placeholder="130" value={hr} onChange={setHr} type="number" />
          </div>

          {/* Run-specific fields */}
          {mode === 'run' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Distance (mi)" placeholder="3.5" value={distance} onChange={setDistance} type="number" />
              <Field label="Elevation (ft)" placeholder="350" value={elevation} onChange={setElevation} type="number" />
            </div>
          )}

          {/* Strength-specific fields */}
          {mode === 'strength' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Exercises</p>
                <div className="flex gap-1.5">
                  {planned?.detail && (
                    <button
                      onClick={() => setExercises(ghostFillFromHistory(parsePlanExercises(planned.detail), progression, calibration))}
                      className="text-xs font-medium px-2 py-1 rounded-lg bg-teal-100 text-teal-700 hover:bg-teal-200 transition-colors"
                    >
                      📋 Import from plan
                    </button>
                  )}
                  <button
                    onClick={() => setPickerOpen(true)}
                    className="text-xs font-medium px-2 py-1 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                  >
                    + Add Exercise
                  </button>
                </div>
              </div>

              {exercises.length === 0 && (
                <p className="text-xs text-slate-400 italic py-2">Tap "Add Exercise" to log your lifts</p>
              )}

              <StrengthSetEditor
                exercises={exercises}
                onChange={setExercises}
                progression={progression}
                calibration={calibration}
              />

              {pickerOpen && (
                <ExercisePicker
                  plannedExercises={planned?.detail ? parsePlanExercises(planned.detail) : []}
                  existingNames={exercises.map(ex => ex.name)}
                  progression={progression}
                  calibration={calibration}
                  onPick={ex => {
                    setExercises([...exercises, ex])
                    setPickerOpen(false)
                  }}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </div>
          )}

          {/* Drills / warmup block — shown for runs + cross-training when plan includes items */}
          {mode === 'run' && hasPlannedDrills && (
            <div className="bg-sky-50 rounded-xl p-3 border border-sky-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-sky-700">
                  {isCrossDay ? 'Mobility / Activation' : 'Drills / Warmup'}
                </p>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={drillsCompleted}
                    onChange={e => setDrillsCompleted(e.target.checked)}
                    className="w-4 h-4 accent-sky-600"
                  />
                  <span className="text-xs font-medium text-sky-700">Completed</span>
                </label>
              </div>
              <div className="space-y-1">
                {drillItems.map((it, i) => (
                  <label key={i} className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={it.done}
                      onChange={() => toggleDrillItem(i)}
                      className="w-3.5 h-3.5 mt-0.5 accent-sky-600"
                    />
                    <span className="text-xs text-sky-900">
                      {it.name}
                    </span>
                  </label>
                ))}
              </div>
              {drillsCompleted && (
                <div className="mt-2 grid grid-cols-2 gap-2 items-end">
                  <div>
                    <label className="text-[10px] font-medium text-sky-700 block mb-0.5">Drill time (min)</label>
                    <input
                      type="number"
                      placeholder="10"
                      value={drillDurationMin}
                      onChange={e => setDrillDurationMin(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-sky-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-sky-700 block mb-0.5">Notes</label>
                    <input
                      placeholder="Felt tight, skipped strides..."
                      value={drillNotes}
                      onChange={e => setDrillNotes(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-sky-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>
              )}
              {drillsCompleted && drillDurationMin && (
                <p className="mt-1.5 text-[10px] text-sky-600 italic">
                  ✓ Drill time will be credited toward your total workout duration
                </p>
              )}
            </div>
          )}

          {/* RPE — Rate of Perceived Exertion */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              How hard did it feel? (RPE)
            </label>
            <div className="flex gap-1">
              {[1,2,3,4,5,6,7,8,9,10].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRpe(val.toString())}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
                    parseInt(rpe) === val
                      ? val <= 3 ? 'bg-green-500 text-white'
                        : val <= 6 ? 'bg-amber-500 text-white'
                        : val <= 8 ? 'bg-orange-500 text-white'
                        : 'bg-red-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">1 = barely felt it · 5 = moderate · 8 = very hard · 10 = max effort</p>
          </div>

          <Field label="Notes — tell your coach how it went" placeholder={mode === 'strength' ? 'How did it feel? Energy level? Anything to remember...' : 'Felt good, walked the steep hills...'} value={notes} onChange={setNotes} multiline rows={4} />

          <button
            onClick={handleSave}
            className={`w-full font-semibold py-3 rounded-xl transition-colors mt-2 text-white ${
              mode === 'strength' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-teal-600 hover:bg-teal-700'
            }`}
          >
            {existing ? 'Update' : 'Save Workout'}
          </button>

          {hasManualEntry && onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="w-full py-2.5 rounded-xl mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900"
              data-testid="remove-manual-log"
            >
              Remove manual entry — use synced data instead
            </button>
          )}
          {hasManualEntry && (
            <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">
              This day has a manual entry. Manual entries override whatever your watch synced — remove it if the synced workout should win.
            </p>
          )}
        </div>

        <div className="h-6" />
      </div>
    </div>
  )
}

function Field({ label, placeholder, value, onChange, type = 'text', multiline = false, rows = 4 }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; type?: string
  multiline?: boolean; rows?: number
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">{label}</label>
      {multiline ? (
        <textarea
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={rows}
          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-y leading-relaxed"
        />
      ) : (
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        />
      )}
    </div>
  )
}
