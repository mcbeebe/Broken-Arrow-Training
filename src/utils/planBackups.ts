/**
 * Local, versioned plan backups — the safety net so a bad redo or a sync
 * mishap is a one-tap undo instead of a lost month of training.
 *
 * The plan regenerates from the onboarding config, so the config (plus the
 * day-level edit logs) is all we need to restore a plan exactly. We keep a
 * small ring of the most recent distinct config versions this device has
 * seen, newest first, deduped by completedAt.
 *
 * Deliberately LOCAL only: the key is not on the sync allowlist
 * (isPreservedKey), so a backup can never itself be clobbered by a stale
 * device — which is the whole point. And a restore stamps the chosen config
 * with a FRESH completedAt, so it counts as the newest everywhere and the
 * content-recency guard propagates it instead of treating it as old.
 *
 * Honest limit: backups only protect going forward. A version never captured
 * cannot be resurrected.
 */
import type { OnboardingConfig } from '../hooks/useOnboarding'

export interface PlanBackup {
  /** Epoch ms this snapshot was taken. */
  savedAt: number
  /** Why it was captured — 'auto' (a new version appeared) or 'before redo'. */
  reason: 'auto' | 'before redo'
  /** For the restore list's label. */
  raceName: string
  /** The config's own authored-at, for dedupe and display. */
  completedAt: string | null
  /** Raw JSON of the onboarding config. */
  config: string
  /** Raw values of the day-level edit keys captured alongside. */
  edits: Record<string, string>
}

export const MAX_BACKUPS = 8
export const EDIT_KEYS = ['ba_plan_edits', 'ba_day_swaps', 'ba_plan_overrides'] as const

function scoped(base: string, athleteId?: string): string {
  return athleteId ? `${base}_${athleteId}` : base
}
function backupsKey(athleteId?: string): string {
  return scoped('ba_plan_backups', athleteId)
}

export function readBackups(athleteId?: string): PlanBackup[] {
  try {
    const raw = localStorage.getItem(backupsKey(athleteId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as PlanBackup[]) : []
  } catch {
    return []
  }
}

function completedAtOf(configRaw: string): string | null {
  try {
    const c = JSON.parse(configRaw) as { completedAt?: unknown }
    return typeof c?.completedAt === 'string' ? c.completedAt : null
  } catch {
    return null
  }
}
function raceNameOf(configRaw: string): string {
  try {
    const c = JSON.parse(configRaw) as { raceName?: unknown }
    return typeof c?.raceName === 'string' && c.raceName ? c.raceName : 'Your plan'
  } catch {
    return 'Your plan'
  }
}

/**
 * Snapshot the current config + edit keys as a new backup. Newest first,
 * deduped against the newest existing entry (same content → no-op), capped at
 * MAX_BACKUPS. No config → nothing to back up. Returns the updated ring.
 */
export function captureBackup(athleteId: string | undefined, reason: PlanBackup['reason']): PlanBackup[] {
  const configRaw = localStorage.getItem(scoped('ba_onboarding', athleteId))
  if (!configRaw) return readBackups(athleteId)

  const list = readBackups(athleteId)
  // Same content already at the top → don't stack duplicates. But a
  // 'before redo' capture over an 'auto' one carries a more useful label for
  // the restore list, so promote it in place rather than dropping it.
  if (list[0] && list[0].config === configRaw) {
    if (reason === 'before redo' && list[0].reason !== 'before redo') {
      const promoted = [{ ...list[0], reason }, ...list.slice(1)]
      try { localStorage.setItem(backupsKey(athleteId), JSON.stringify(promoted)) } catch { /* quota */ }
      return promoted
    }
    return list
  }

  const edits: Record<string, string> = {}
  for (const ek of EDIT_KEYS) {
    const v = localStorage.getItem(scoped(ek, athleteId))
    if (v != null) edits[ek] = v
  }

  const entry: PlanBackup = {
    savedAt: Date.now(),
    reason,
    raceName: raceNameOf(configRaw),
    completedAt: completedAtOf(configRaw),
    config: configRaw,
    edits,
  }
  const next = [entry, ...list].slice(0, MAX_BACKUPS)
  try {
    localStorage.setItem(backupsKey(athleteId), JSON.stringify(next))
  } catch {
    /* quota — a missed backup is not worth crashing a save over */
  }
  return next
}

/**
 * The config to write when restoring a backup: the saved config, but stamped
 * with a FRESH completedAt so it is the newest version everywhere and the
 * sync guard propagates it rather than rejecting it as old.
 */
export function configForRestore(backup: PlanBackup, now: number = Date.now()): OnboardingConfig | null {
  try {
    const c = JSON.parse(backup.config) as OnboardingConfig
    return { ...c, completedAt: new Date(now).toISOString() }
  } catch {
    return null
  }
}
