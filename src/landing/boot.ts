/**
 * What the root page does on load, with its inputs injected so the launch
 * switch and the forward are testable (src/landing/main.tsx only wires the
 * real browser objects in).
 */
import { legacyEntryTarget } from './legacyEntry'

/** Set once the guard has run; the inline fallback in index.html reads it. */
export const GUARD_RAN_FLAG = '__attuneGuardRan'

export interface RootPageDeps {
  /** Build-time env; only `VITE_LANDING_ENABLED === 'true'` launches the page. */
  env: { VITE_LANDING_ENABLED?: string }
  location: { search: string; hash: string; replace(url: string): void }
  standalone: boolean
  hasSession: boolean
  /** Render the landing page (a placeholder until initiative 003 PR 3). */
  renderLanding(): void
}

/**
 * Forward the visitor to the app or render the landing page.
 *
 * @returns The URL forwarded to, or null when the landing page rendered.
 */
export function bootRootPage(deps: RootPageDeps): string | null {
  const target = legacyEntryTarget({
    search: deps.location.search,
    hash: deps.location.hash,
    standalone: deps.standalone,
    hasSession: deps.hasSession,
    forwardAll: deps.env.VITE_LANDING_ENABLED !== 'true',
  })
  if (target) deps.location.replace(target)
  else deps.renderLanding()
  return target
}
