import type { QueueItemKind } from './reviewQueue'

/**
 * Applied-proposal receipts that outlive the screen.
 *
 * The receipt is the athlete's only evidence that anything happened — an
 * applied proposal leaves the queue on the next render, because its source
 * stops qualifying. It used to live in `ReviewQueuePanel`'s own `useState`,
 * so it vanished the moment the athlete navigated away, taking the Undo
 * button with it. Applying from Today then routes to the Coach review tab,
 * which remounts the panel: the athlete arrived at the surface that owns
 * Undo and found nothing to undo.
 *
 * The undo itself is a closure and cannot be stored, so a receipt carries a
 * TOKEN instead — the kind of proposal and the plan-edit batch it created —
 * and the app rebuilds the closure from that on mount.
 *
 * Device-local by design: a batch id is only meaningful alongside the
 * device's own undo snapshot, so this is not synced or migrated.
 */

export interface StoredReceipt {
  /** Queue item id — stable per proposal. */
  id: string
  title: string
  /** Epoch ms the proposal was applied. */
  appliedAt: number
  /** Present when the change can be taken back. */
  undoToken?: { kind: QueueItemKind; batchId: string }
}

/** Receipts older than this stop being offered: an Undo for a change made
 *  two weeks and forty sessions ago is not a real choice. */
export const RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** Newest first, capped — the panel is a receipt strip, not a history. */
export const MAX_RECEIPTS = 5

export function receiptsKey(athleteId: string): string {
  return `ba_apply_receipts_v1_${athleteId}`
}

export function readReceipts(athleteId: string, now: number = Date.now()): StoredReceipt[] {
  try {
    const raw = localStorage.getItem(receiptsKey(athleteId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as StoredReceipt[])
      .filter(r => r && typeof r.id === 'string' && typeof r.appliedAt === 'number')
      .filter(r => now - r.appliedAt < RECEIPT_TTL_MS)
      .sort((a, b) => b.appliedAt - a.appliedAt)
      .slice(0, MAX_RECEIPTS)
  } catch {
    return [] // corrupt payload → no receipts, never a throw on render
  }
}

export function writeReceipts(athleteId: string, receipts: StoredReceipt[]): void {
  try {
    localStorage.setItem(receiptsKey(athleteId), JSON.stringify(receipts.slice(0, MAX_RECEIPTS)))
  } catch { /* private mode / quota — the receipt degrades to session-only */ }
}

/** Newest first, capped, with any older receipt for the same proposal
 *  replaced (re-applying the same suggestion is one event, not two). */
export function addReceipt(existing: StoredReceipt[], receipt: StoredReceipt): StoredReceipt[] {
  return [receipt, ...existing.filter(r => r.id !== receipt.id)].slice(0, MAX_RECEIPTS)
}
