/**
 * Tab identities, and the aliases that keep older clients working.
 *
 * The Summary tab is now Today and the Stats tab is now Progress. The ids
 * moved with the names so the code reads like the product, but the OLD ids
 * are still out in the world and must keep resolving:
 *
 *  - `start_url: "./?view=summary"` is baked into every already-installed
 *    PWA on someone's home screen; it cannot be updated remotely.
 *  - Push notifications that have already been sent carry `?view=` targets.
 *  - A stale `ba_initial_view` hint can survive in sessionStorage.
 *
 * So an unknown or legacy id resolves here rather than falling through to a
 * blank tab.
 */
import type { ViewId } from '../types'

/** Ids that may arrive from outside: a deep link, a notification, storage. */
const ALIASES: Record<string, ViewId> = {
  // Renamed in the Today rebuild.
  summary: 'today',
  dashboard: 'progress',
  // 'stats' was never a valid ViewId, but the zones primer's initial-view
  // hint has always been able to write it — it silently landed on a tab
  // that did not exist. It means Progress.
  stats: 'progress',
}

const KNOWN: ViewId[] = [
  'today', 'plan', 'progress', 'coach', 'journal', 'settings', 'zones', 'method', 'info',
]

/** Resolve an id from a URL, a notification or storage. `null` when it means
 *  nothing at all, so the caller can fall back to the default tab. */
export function resolveViewId(raw: string | null | undefined): ViewId | null {
  if (!raw) return null
  const alias = ALIASES[raw]
  if (alias) return alias
  return (KNOWN as string[]).includes(raw) ? (raw as ViewId) : null
}

/** The tabs a deep link is allowed to open directly. */
const DEEP_LINKABLE = new Set<ViewId>(['today', 'plan', 'progress', 'coach', 'settings'])

export function resolveDeepLink(raw: string | null | undefined): ViewId | null {
  const id = resolveViewId(raw)
  return id && DEEP_LINKABLE.has(id) ? id : null
}
