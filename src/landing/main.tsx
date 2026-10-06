/**
 * Entry for `/`. Statically imports only the guard and referral modules (ES
 * imports are hoisted, so anything imported here downloads before the guard
 * runs): home-screen launches and notification taps pay a few KB on their
 * way to `/app/`, never the landing bundle.
 *
 * Until VITE_LANDING_ENABLED is 'true' every visitor is forwarded. The
 * placeholder below is unreachable in production while the switch is off;
 * initiative 003 PR 3 replaces it with `import('./LandingPage')`.
 */
import { APP_PATH, hasStoredSession, isStandalone, legacyEntryTarget } from './legacyEntry'
import { recordReferralSource } from './referral'

recordReferralSource(window.location.search)

const target = legacyEntryTarget({
  search: window.location.search,
  hash: window.location.hash,
  standalone: isStandalone(),
  hasSession: hasStoredSession(),
  forwardAll: import.meta.env.VITE_LANDING_ENABLED !== 'true',
})

if (target) {
  window.location.replace(target)
} else {
  const root = document.getElementById('root')
  if (root) {
    const heading = document.createElement('h1')
    heading.textContent = 'Attune'
    const link = document.createElement('a')
    link.href = APP_PATH
    link.textContent = 'Open the app'
    root.append(heading, link)
  }
}
