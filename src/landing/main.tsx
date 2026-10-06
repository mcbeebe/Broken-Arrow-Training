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
import { GUARD_RAN_FLAG, bootRootPage } from './boot'
import { APP_PATH, hasStoredSession, isStandalone } from './legacyEntry'
import { recordReferralSource } from './referral'

// Stand down the inline fallback in index.html: the guard has loaded.
;(window as unknown as Record<string, unknown>)[GUARD_RAN_FLAG] = true

recordReferralSource(window.location.search)

bootRootPage({
  env: { VITE_LANDING_ENABLED: import.meta.env.VITE_LANDING_ENABLED },
  location: window.location,
  standalone: isStandalone(),
  hasSession: hasStoredSession(),
  renderLanding() {
    const root = document.getElementById('root')
    if (!root) return
    const heading = document.createElement('h1')
    heading.textContent = 'Attune'
    const link = document.createElement('a')
    link.href = APP_PATH
    link.textContent = 'Open the app'
    root.append(heading, link)
  },
})
