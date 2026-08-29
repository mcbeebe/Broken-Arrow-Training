import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlanEditOpInput } from '../types'
import type { MorningOutlook } from '../engines/adaptive/morningOutlook'
import type { UseAdaptationLogReturn } from './useAdaptationLog'
import { localDateStr } from '../utils/format'
import { stampKey } from '../utils/syncStamps'

/**
 * The Daily Autopilot's consent tier (Adaptive Engine phase 3, PR 8):
 * same-day modulation auto-applies once per morning and greets the
 * athlete as a card with the reason and a one-tap revert. The engine
 * decides WHAT (buildMorningOutlook, pure); this hook decides WHEN and
 * remembers WHAT HAPPENED — one push per session, ever, enforced by a
 * per-day state record.
 *
 * The card renders from the SNAPSHOT taken at apply time, not the live
 * outlook — applying the ops changes the derived plan, which would
 * otherwise flip the engine back to 'confirm' and vanish the evidence.
 * State is athleteId-scoped localStorage + sync stamp, and expires
 * naturally at midnight (the dateIso stops matching).
 */

const STORAGE_KEY = 'ba_morning_outlook_v1'
/** Fallback for the earliest local hour the autopilot may touch the day,
 *  used only when the athlete has not declared a morning hour. The gate
 *  exists so the engine never rewrites a day at 2am off incomplete
 *  overnight data — which means it belongs to the athlete's clock, not to
 *  a number in this file. A night-shift nurse whose morning starts at 2pm
 *  was previously adjusted at 5am, before the night they had just slept
 *  through had even been recorded. */
export const ACT_HOUR = 5

export type OutlookCard = Omit<MorningOutlook, 'ops'>

export interface OutlookState {
  dateIso: string
  card: OutlookCard
  batchId: string
  logEntryId?: string
  reverted?: boolean
  dismissed?: boolean
}

function scopedKey(athleteId?: string) {
  return athleteId ? `${STORAGE_KEY}_${athleteId}` : STORAGE_KEY
}

function read(athleteId?: string): OutlookState | null {
  try {
    const raw = localStorage.getItem(scopedKey(athleteId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as OutlookState
    return parsed && typeof parsed.dateIso === 'string' && parsed.card ? parsed : null
  } catch {
    return null
  }
}

function write(state: OutlookState, athleteId?: string) {
  try {
    const key = scopedKey(athleteId)
    localStorage.setItem(key, JSON.stringify(state))
    stampKey(key)
  } catch { /* quota */ }
}

/** Pure decision: may the autopilot act right now? Exported for tests. */
export function shouldActNow(
  state: OutlookState | null,
  outlook: MorningOutlook | null,
  now: Date,
  /** The athlete's declared morning hour; falls back to ACT_HOUR. */
  actHour: number = ACT_HOUR,
): boolean {
  if (!outlook || outlook.verdict === 'confirm' || outlook.ops.length === 0) return false
  if (now.getHours() < actHour) return false
  if (outlook.dateIso !== localDateStr(now)) return false
  // One push per session: any record for today — applied, reverted, or
  // dismissed — means the autopilot is done until tomorrow.
  return state?.dateIso !== outlook.dateIso
}

const logTitle = (card: OutlookCard): string =>
  card.verdict === 'swap' ? `Swapped ${card.before} → ${card.after}`
  : card.verdict === 'trim' ? `Trimmed ${card.before} → ${card.after}`
  : `Eased pace targets for heat`

export interface UseMorningOutlookDeps {
  enabled?: boolean
  applyBatch: (ops: PlanEditOpInput[]) => string
  undoBatch: (batchId: string) => void
  appendLog: UseAdaptationLogReturn['append']
  markLogReverted: UseAdaptationLogReturn['markReverted']
  /** Best-effort coach-memory archive; never blocks the apply. */
  onArchive?: (text: string) => void
  /** The athlete's declared morning hour. The autopilot will not touch a
   *  day before it — their morning, not a fixed 5am. */
  morningHour?: number
  /** Clock injection for tests. */
  now?: () => Date
}

export interface UseMorningOutlookReturn {
  /** True while today's applied card should be on screen. */
  visible: boolean
  card: OutlookCard | null
  reverted: boolean
  /** "Sounds right" — the change stands, the card goes away. */
  dismiss: () => void
  /** One-tap revert: undo the batch, mark the log, close the card. */
  revert: () => void
}

export function useMorningOutlook(
  athleteId: string | undefined,
  outlook: MorningOutlook | null,
  deps: UseMorningOutlookDeps,
): UseMorningOutlookReturn {
  const [state, setState] = useState<OutlookState | null>(() => read(athleteId))
  const depsRef = useRef(deps)
  useEffect(() => { depsRef.current = deps })

  useEffect(() => {
    setState(read(athleteId))
  }, [athleteId])

  const enabled = deps.enabled ?? true
  useEffect(() => {
    if (!enabled || !outlook) return
    const d = depsRef.current
    const now = (d.now ?? (() => new Date()))()
    if (!shouldActNow(read(athleteId), outlook, now, d.morningHour)) return
    const { ops, ...card } = outlook
    const batchId = d.applyBatch(ops)
    const logEntryId = d.appendLog({
      dateIso: outlook.dateIso,
      source: 'autopilot',
      kind: 'auto',
      title: logTitle(card),
      detail: card.why,
      batchId,
    })
    const next: OutlookState = { dateIso: outlook.dateIso, card, batchId, logEntryId }
    write(next, athleteId)
    setState(next)
    d.onArchive?.(`[AUTOPILOT] ${logTitle(card)} — ${card.why} Batch id ${batchId}.`)
    // Re-fires are cheap and self-guarded by the per-day state record.
  }, [enabled, outlook, athleteId])

  const dismiss = useCallback(() => {
    const current = read(athleteId)
    if (!current) return
    const next = { ...current, dismissed: true }
    write(next, athleteId)
    setState(next)
  }, [athleteId])

  const revert = useCallback(() => {
    const current = read(athleteId)
    if (!current || current.reverted) return
    const d = depsRef.current
    d.undoBatch(current.batchId)
    if (current.logEntryId) d.markLogReverted(current.logEntryId)
    const next = { ...current, reverted: true, dismissed: true }
    write(next, athleteId)
    setState(next)
    d.onArchive?.(`[AUTOPILOT REVERTED] Athlete undid: ${logTitle(current.card)}. The session runs as originally planned — treat as a soft signal their threshold for this gate is higher than default.`)
  }, [athleteId])

  const today = localDateStr((deps.now ?? (() => new Date()))())
  const live = state != null && state.dateIso === today
  return {
    visible: enabled && live && !state!.dismissed,
    card: live ? state!.card : null,
    reverted: live ? !!state!.reverted : false,
    dismiss,
    revert,
  }
}
