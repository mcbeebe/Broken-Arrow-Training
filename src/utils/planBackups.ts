/**
 * Local, versioned plan backups — the safety net so a bad redo or a sync
 * mishap is a one-tap undo instead of a lost month of training.
 *
 * The plan regenerates from the onboarding config, so the config (plus the
 * day-level edit logs, and the season calendar a restore would otherwise
 * re-seed) is all we need to restore a plan exactly. We keep a
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
import { setItemWithRoom } from './storageRoom'

export interface PlanBackup {
  /** Epoch ms this snapshot was taken. */
  savedAt: number
  /** Why it was captured: 'auto' (a new version appeared), 'before redo',
   *  or 'before upload' (an uploaded plan replaced it, initiative 004). */
  reason: 'auto' | 'before redo' | 'before upload'
  /** For the restore list's label. */
  raceName: string
  /** The config's own authored-at, for dedupe and display. */
  completedAt: string | null
  /** Raw JSON of the onboarding config. */
  config: string
  /** Raw values of the day-level edit keys captured alongside. */
  edits: Record<string, string>
  /** Raw JSON of the season calendar when it was taken. A restore is a new
   *  plan generation, which would otherwise re-seed the calendar and drop
   *  the races added in the Season panel (initiative 004). */
  season?: string
}

export const MAX_BACKUPS = 8
export const EDIT_KEYS = ['ba_plan_edits', 'ba_day_swaps', 'ba_plan_overrides'] as const
/** `SEASON_STORAGE_KEY` (engines/season), not imported to keep this file light. */
export const SEASON_KEY = 'ba_season_v1'

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
    const c = JSON.parse(configRaw) as { raceName?: unknown; importedPlan?: { title?: unknown } }
    if (typeof c?.raceName === 'string' && c.raceName) return c.raceName
    // An uploaded plan with no race is known by its own title.
    const title = c?.importedPlan?.title
    return typeof title === 'string' && title ? title : 'Your plan'
  } catch {
    return 'Your plan'
  }
}

function readEdits(athleteId?: string): Record<string, string> {
  const edits: Record<string, string> = {}
  for (const ek of EDIT_KEYS) {
    const v = localStorage.getItem(scoped(ek, athleteId))
    if (v != null) edits[ek] = v
  }
  return edits
}

/**
 * Snapshot the current config + edit keys as a new backup. Newest first,
 * capped at MAX_BACKUPS. The same config as the newest entry adds nothing:
 * that entry takes the current edits (and a 'before …' label) instead. No
 * config → nothing to back up. Returns the updated ring.
 */
export function captureBackup(athleteId: string | undefined, reason: PlanBackup['reason']): PlanBackup[] {
  const configRaw = localStorage.getItem(scoped('ba_onboarding', athleteId))
  if (!configRaw) return readBackups(athleteId)

  const list = readBackups(athleteId)
  const edits = readEdits(athleteId)
  const season = localStorage.getItem(scoped(SEASON_KEY, athleteId)) ?? undefined
  // Same content already at the top → don't stack duplicates. But bring its
  // edits up to date (day edits made since it was taken belong to this same
  // plan), and let a 'before …' capture relabel an 'auto' one: that label
  // tells the restore list what the backup was for. 'auto' never relabels.
  // A backup never trades edits it holds for none: edit keys that are gone
  // now were cleared, and the backup is what brings them back.
  if (list[0] && list[0].config === configRaw) {
    const relabel = reason !== 'auto' && list[0].reason !== reason
    const editsChanged = Object.keys(edits).length > 0
      && JSON.stringify(list[0].edits ?? {}) !== JSON.stringify(edits)
    const seasonChanged = season !== undefined && list[0].season !== season
    if (!relabel && !editsChanged && !seasonChanged) return list
    const updated = [{
      ...list[0],
      ...(editsChanged ? { edits } : {}),
      ...(seasonChanged ? { season } : {}),
      ...(relabel ? { reason } : {}),
    }, ...list.slice(1)]
    setItemWithRoom(backupsKey(athleteId), JSON.stringify(updated))
    return updated
  }

  const entry: PlanBackup = {
    // savedAt is the backup's id (Restore looks it up by it), so it must be
    // unique: a "before …" capture and the save()'s own capture land in the
    // same millisecond.
    savedAt: Math.max(Date.now(), (list[0]?.savedAt ?? 0) + 1),
    reason,
    raceName: raceNameOf(configRaw),
    completedAt: completedAtOf(configRaw),
    config: configRaw,
    edits,
    ...(season !== undefined ? { season } : {}),
  }
  const next = [entry, ...list].slice(0, MAX_BACKUPS)
  // Makes room by dropping regenerable caches; a backup that still can't be
  // written is not worth crashing a save over (callers that must have it,
  // like importPlan, read the ring back).
  setItemWithRoom(backupsKey(athleteId), JSON.stringify(next))
  return next
}

/** Restore points kept when a full phone needs room for an uploaded plan:
 *  the newest is the plan being replaced. */
export const BACKUPS_KEPT_WHEN_FULL = 2

/**
 * Keeps only the `keep` newest restore points, to make room on a full
 * phone. False when there was nothing to drop.
 */
export function trimBackups(athleteId: string | undefined, keep: number): boolean {
  const list = readBackups(athleteId)
  if (list.length <= keep) return false
  try {
    localStorage.setItem(backupsKey(athleteId), JSON.stringify(list.slice(0, keep)))
    return true
  } catch {
    return false
  }
}

/**
 * Runs `write`, which reports whether what it stored landed. When it
 * didn't (a full phone), the older restore points make room
 * (`trimBackups`) and it runs once more. If that fails too, the restore
 * points are put back exactly as they were before the first try. An
 * uploaded plan cost one of the day's uploads to read, so it is worth more
 * than a restore point from weeks ago.
 */
export function withRoomFromBackups(athleteId: string | undefined, write: () => boolean): boolean {
  const key = backupsKey(athleteId)
  const before = localStorage.getItem(key)
  if (write()) return true
  if (trimBackups(athleteId, BACKUPS_KEPT_WHEN_FULL) && write()) return true
  // What a failed try wrote (a capture, a label) goes too: the ring took no
  // room before the first try that it doesn't take now.
  try {
    if (before == null) localStorage.removeItem(key)
    else localStorage.setItem(key, before)
  } catch { /* the trimmed ring stays */ }
  return false
}

/**
 * Whether the newest restore point holds the plan as it is now: its config
 * and, when there are any, its day edits. A capture on a full phone can
 * fail to write, so a caller that must have the backup asks this.
 */
export function newestBackupIsCurrent(athleteId?: string): boolean {
  const configRaw = localStorage.getItem(scoped('ba_onboarding', athleteId))
  const newest = readBackups(athleteId)[0]
  if (!configRaw || newest?.config !== configRaw) return false
  const edits = readEdits(athleteId)
  return Object.keys(edits).length === 0 || JSON.stringify(newest.edits ?? {}) === JSON.stringify(edits)
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

/**
 * The season calendar to write back with a restored plan, or null when the
 * backup holds none (taken before backups kept it). It is marked as already
 * seeded for the restored plan's generation, so the season hook keeps it as
 * it was instead of re-seeding it from the restored config.
 */
export function seasonForRestore(backup: PlanBackup, generation: string): string | null {
  if (!backup.season) return null
  try {
    const s = JSON.parse(backup.season) as Record<string, unknown>
    if (!s || typeof s !== 'object' || !Array.isArray(s.races)) return null
    return JSON.stringify({ ...s, seededGeneration: generation })
  } catch {
    return null
  }
}
