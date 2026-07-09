import type { TrainingWeek } from '../types'
import type { GarminWorkoutPayload } from '../engines/planGenerator/garminWorkout'
import { buildGarminPayloadForDay } from '../engines/planGenerator/garminWorkout'
import { pushWorkoutToGarmin, isGarminConnected } from './garmin'
import { parseDayToDate, todayDateString } from './planDates'
import { stampKey } from './syncStamps'

/**
 * Garmin push ledger + auto re-push (G2a — docs/gap-closure-build-plan.md).
 *
 * The ledger remembers what was last sent to the watch per calendar day
 * (a content hash of the pushed payload). On any plan change — coach
 * proposal, realignment, manual edit, swap, undo — `repushChangedWorkouts`
 * diffs the CURRENT payload for every previously-pushed future day against
 * the ledger and re-pushes exactly the days whose workout actually changed.
 * The plan on the wrist is never stale, and untouched days are never
 * re-sent (the L2 guard).
 *
 * The ledger is athlete-scoped and synced (ba_garmin_pushed_v1 is in both
 * preserve/sync allowlists) so a second device doesn't re-push what the
 * first already sent.
 */

const STORAGE_KEY = 'ba_garmin_pushed_v1'

export interface PushedEntry {
  /** Content hash of the payload last sent for this date. */
  hash: string
  pushedAt: number
  workoutName: string
}

export type PushedLedger = Record<string, PushedEntry> // isoDate → entry

function scopedKey(athleteId?: string): string {
  return athleteId ? `${STORAGE_KEY}_${athleteId}` : STORAGE_KEY
}

/** Stable content hash (djb2 over canonical JSON). Not cryptographic —
 *  it only needs to answer "did this day's workout change?". */
export function payloadHash(payload: GarminWorkoutPayload): string {
  const canonical = JSON.stringify(payload)
  let h = 5381
  for (let i = 0; i < canonical.length; i++) {
    h = ((h << 5) + h + canonical.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

export function readPushedLedger(athleteId?: string): PushedLedger {
  try {
    const raw = localStorage.getItem(scopedKey(athleteId))
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writePushedLedger(ledger: PushedLedger, athleteId?: string): void {
  const key = scopedKey(athleteId)
  try {
    localStorage.setItem(key, JSON.stringify(ledger))
    stampKey(key)
  } catch { /* quota */ }
}

/** Record a successful push so future edits to this day can be detected. */
export function recordPushed(
  isoDate: string,
  payload: GarminWorkoutPayload,
  athleteId?: string,
): void {
  const ledger = readPushedLedger(athleteId)
  ledger[isoDate] = {
    hash: payloadHash(payload),
    pushedAt: Date.now(),
    workoutName: payload.name,
  }
  writePushedLedger(ledger, athleteId)
}

export interface PushableDay {
  isoDate: string
  payload: GarminWorkoutPayload
}

/** All pushable (non-rest, structured or legacy-text) days in the given
 *  weeks with a resolvable date ≥ `fromIso` and no logged actual. */
export function collectPushableDays(
  weeks: TrainingWeek[],
  fromIso: string = todayDateString(),
): PushableDay[] {
  const out: PushableDay[] = []
  for (const week of weeks) {
    for (const day of week.days) {
      if (day.actual) continue // completed — never push over a logged workout
      const isoDate = parseDayToDate(day.day, week.dates, fromIso)
      if (!isoDate || isoDate < fromIso) continue
      const payload = buildGarminPayloadForDay(day, isoDate)
      if (payload) out.push({ isoDate, payload })
    }
  }
  return out
}

/** The subset of previously-pushed future days whose CURRENT payload no
 *  longer matches what the watch has. Days never pushed are not included —
 *  auto re-push only maintains what the athlete chose to send. */
export function diffChangedPushedDays(
  weeks: TrainingWeek[],
  athleteId?: string,
  fromIso: string = todayDateString(),
): PushableDay[] {
  const ledger = readPushedLedger(athleteId)
  if (Object.keys(ledger).length === 0) return []
  return collectPushableDays(weeks, fromIso).filter(({ isoDate, payload }) => {
    const entry = ledger[isoDate]
    return !!entry && entry.hash !== payloadHash(payload)
  })
}

export interface BatchPushResult {
  sent: number
  failed: number
  errors: string[]
}

type PushFn = typeof pushWorkoutToGarmin

/** Push every pushable future day of one week; records each success in the
 *  ledger so subsequent plan edits auto re-push. `pushFn` injectable for
 *  tests. */
export async function pushWeekToGarmin(
  week: TrainingWeek,
  athleteId?: string,
  fromIso: string = todayDateString(),
  pushFn: PushFn = pushWorkoutToGarmin,
): Promise<BatchPushResult> {
  const days = collectPushableDays([week], fromIso)
  return pushDays(days, athleteId, pushFn)
}

/** Re-push exactly the previously-pushed future days whose workout changed.
 *  No-op when Garmin isn't connected or nothing qualifies. */
export async function repushChangedWorkouts(
  weeks: TrainingWeek[],
  athleteId?: string,
  fromIso: string = todayDateString(),
  pushFn: PushFn = pushWorkoutToGarmin,
): Promise<BatchPushResult> {
  if (!isGarminConnected(athleteId)) return { sent: 0, failed: 0, errors: [] }
  const changed = diffChangedPushedDays(weeks, athleteId, fromIso)
  return pushDays(changed, athleteId, pushFn)
}

async function pushDays(
  days: PushableDay[],
  athleteId: string | undefined,
  pushFn: PushFn,
): Promise<BatchPushResult> {
  const result: BatchPushResult = { sent: 0, failed: 0, errors: [] }
  for (const { isoDate, payload } of days) {
    try {
      await pushFn(payload, athleteId)
      recordPushed(isoDate, payload, athleteId)
      result.sent++
    } catch (err) {
      result.failed++
      result.errors.push(
        `${isoDate}: ${err instanceof Error ? err.message : 'push failed'}`,
      )
    }
  }
  return result
}
