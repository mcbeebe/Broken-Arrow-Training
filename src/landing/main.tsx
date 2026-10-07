/**
 * Entry for `/`. Statically imports only the guard and referral modules (ES
 * imports are hoisted, so anything imported here downloads before the guard
 * runs): home-screen launches and notification taps pay a few KB on their
 * way to `/app/`, never the landing bundle.
 *
 * Until VITE_LANDING_ENABLED is 'true' every visitor is forwarded. When the
 * guard keeps a visitor here, the page loads with import(): the font preload
 * starts first, so it downloads alongside the page's chunk.
 */
import { GUARD_RAN_FLAG, bootRootPage } from './boot'
import { APP_PATH, hasStoredSession, isStandalone } from './legacyEntry'
import { recordReferralSource } from './referral'

/** Same file as the @font-face in landing.css (the 800 weight is in it). */
const FONT_URL = '/fonts/schibsted-grotesk-latin-wght-normal.woff2'

// Stand down the inline fallback in index.html: the guard has loaded.
;(window as unknown as Record<string, unknown>)[GUARD_RAN_FLAG] = true

recordReferralSource(window.location.search)

function preloadFont(): void {
  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'font'
  link.type = 'font/woff2'
  link.href = FONT_URL
  link.crossOrigin = 'anonymous'
  document.head.append(link)
}

/** If the page's chunk can't load, leave a way into the app rather than a blank page. */
function renderFallback(root: HTMLElement): void {
  const heading = document.createElement('h1')
  heading.textContent = 'Attune'
  const link = document.createElement('a')
  link.href = APP_PATH
  link.textContent = 'Open the app'
  root.append(heading, link)
}

bootRootPage({
  env: { VITE_LANDING_ENABLED: import.meta.env.VITE_LANDING_ENABLED },
  location: window.location,
  standalone: isStandalone(),
  hasSession: hasStoredSession(),
  renderLanding() {
    const root = document.getElementById('root')
    if (!root) return
    preloadFont()
    import('./mount').then(m => m.mountLanding(root)).catch(() => renderFallback(root))
  },
})
