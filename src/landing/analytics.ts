/**
 * Google Analytics 4 for the landing page only. mount.tsx starts it once the
 * guard has kept a visitor on `/`, so installed apps, deep links, Strava
 * callbacks and signed-in athletes forwarded to `/app/` never load Google's
 * script, and nothing inside the app is ever measured. Imports nothing, so
 * check-site-layout.mjs allows it.
 */

/** GA4 Measurement IDs look like "G-XXXXXXXXXX". */
const MEASUREMENT_ID = /^G-[A-Z0-9]{4,20}$/

/** Query parameters GA may see: campaign tags and the tools' `?from=` referral. */
const KEPT_PARAM = /^(utm_[a-z_]+|from)$/

type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }

/**
 * The address to report for a page: origin and path, plus only the campaign
 * and referral parameters, never a fragment. Anything else in the query (a
 * token, a code, an id) is dropped before Google sees it.
 *
 * @param loc `window.location` or the parts of it this reads.
 */
export function analyticsPageLocation(loc: Pick<Location, 'origin' | 'pathname' | 'search'>): string {
  const kept = new URLSearchParams()
  for (const [key, value] of new URLSearchParams(loc.search)) {
    if (KEPT_PARAM.test(key)) kept.append(key, value)
  }
  const query = kept.toString()
  return `${loc.origin}${loc.pathname}${query ? `?${query}` : ''}`
}

/**
 * Load gtag.js and record a page view with a sanitized address. Does nothing
 * unless `id` is a valid Measurement ID, so local builds and any build without
 * `VITE_GA_MEASUREMENT_ID` stay untracked.
 *
 * @param id GA4 Measurement ID, normally `import.meta.env.VITE_GA_MEASUREMENT_ID`.
 * @param win The window to install `gtag` on.
 * @returns Whether analytics was started.
 */
export function startAnalytics(id: string | undefined, win: Window = window): boolean {
  if (!id || !MEASUREMENT_ID.test(id)) return false
  const w = win as GtagWindow
  const doc = w.document
  w.dataLayer = w.dataLayer || []
  // gtag.js reads the `arguments` object itself, so this must not be an arrow or use rest args.
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments)
  }
  w.gtag('js', new Date())
  w.gtag('config', id, { page_location: analyticsPageLocation(w.location) })
  const script = doc.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`
  doc.head.append(script)
  return true
}
