import { afterEach, describe, expect, it } from 'vitest'
import { analyticsPageLocation, startAnalytics } from '../../landing/analytics'

type GtagWindow = Window & { dataLayer?: unknown[][]; gtag?: unknown }

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

  it('does nothing without a valid Measurement ID', () => {
    expect(startAnalytics(undefined)).toBe(false)
    expect(startAnalytics("UA-1');alert(1)//")).toBe(false)
    expect((window as GtagWindow).dataLayer).toBeUndefined()
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull()
  })

  it('loads gtag.js and configures the ID with a sanitized page_location', () => {
    window.history.replaceState(null, '', '/?utm_source=news&state=abc#how')
    expect(startAnalytics('G-ABC123XYZ9')).toBe(true)
    const script = document.querySelector<HTMLScriptElement>('script[src*="googletagmanager"]')
    expect(script?.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ9')
    const config = (window as GtagWindow).dataLayer!.map(a => Array.from(a)).find(a => a[0] === 'config')
    expect(config).toEqual(['config', 'G-ABC123XYZ9', { page_location: `${window.location.origin}/?utm_source=news` }])
    window.history.replaceState(null, '', '/')
  })
})
