import { afterEach, describe, expect, it } from 'vitest'
import { LIVE_HOSTS, analyticsPageLocation, startAnalytics } from '../../landing/analytics'
import { SITE_ORIGIN } from '../../../scripts/deploy/check-site-layout.mjs'
import DEPLOY_YML from '../../../.github/workflows/deploy.yml?raw'

type GtagWindow = Window & { dataLayer?: unknown[][]; gtag?: unknown }

/** A window on `hostname`: jsdom's own runs on localhost, which never reports. */
function windowOn(hostname: string, search = ''): Window {
  const fake = { document, location: { hostname, origin: `https://${hostname}`, pathname: '/', search } }
  return fake as unknown as Window
}

function reset(): void {
  const w = window as GtagWindow
  delete w.dataLayer
  delete w.gtag
  document.head.querySelectorAll('script[src*="googletagmanager"]').forEach(s => s.remove())
}

describe('analyticsPageLocation', () => {
  const loc = (search: string) => ({ origin: 'https://attune.coach', pathname: '/', search })

  it('reports origin and path only when there is no query', () => {
    expect(analyticsPageLocation(loc(''))).toBe('https://attune.coach/')
  })

  it('keeps campaign tags and the tools referral, drops everything else', () => {
    expect(analyticsPageLocation(loc('?utm_source=x&code=secret&from=tool-pace&athlete=42&utm_campaign=y')))
      .toBe('https://attune.coach/?utm_source=x&from=tool-pace&utm_campaign=y')
  })
})

describe('startAnalytics', () => {
  afterEach(reset)

  it('does nothing without a valid Measurement ID, even on the live host', () => {
    // On the live host, so only the ID check can refuse: it is what keeps the ID out of the script URL.
    const win = windowOn(LIVE_HOSTS[0]) as GtagWindow
    expect(startAnalytics(undefined, win)).toBe(false)
    expect(startAnalytics("UA-1');alert(1)//", win)).toBe(false)
    expect(win.dataLayer).toBeUndefined()
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull()
  })

  it('reports from the host the deploy publishes to (CNAME) and the sitemap origin', () => {
    const cname = /echo "([^"]+)" > \.\/dist\/CNAME/.exec(DEPLOY_YML)?.[1]
    expect(cname).toBeTruthy()
    expect(LIVE_HOSTS).toContain(cname)
    expect(LIVE_HOSTS).toContain(new URL(SITE_ORIGIN).hostname)
  })

  it.each([...LIVE_HOSTS])('loads gtag.js on %s and configures the ID with a sanitized page_location', host => {
    const win = windowOn(host, '?utm_source=news&state=abc') as GtagWindow
    expect(startAnalytics('G-ABC123XYZ9', win)).toBe(true)
    const script = document.querySelector<HTMLScriptElement>('script[src*="googletagmanager"]')
    expect(script?.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ9')
    const config = win.dataLayer!.map(a => Array.from(a)).find(a => a[0] === 'config')
    expect(config).toEqual(['config', 'G-ABC123XYZ9', { page_location: `https://${host}/?utm_source=news` }])
  })

  it.each(['localhost', '127.0.0.1', 'mcbeebe.github.io', 'attune.coach.example.com', 'preview.attune.coach'])(
    'stays untracked on %s even with a valid ID',
    host => {
      const win = windowOn(host) as GtagWindow
      expect(startAnalytics('G-ABC123XYZ9', win)).toBe(false)
      expect(win.dataLayer).toBeUndefined()
      expect(win.gtag).toBeUndefined()
      expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull()
    },
  )

  it("stays untracked on jsdom's own window (localhost)", () => {
    expect(startAnalytics('G-ABC123XYZ9')).toBe(false)
    expect((window as GtagWindow).dataLayer).toBeUndefined()
  })
})
