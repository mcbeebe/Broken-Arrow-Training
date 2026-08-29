/**
 * P1 — the rename, and the compatibility it owes older clients.
 *
 * Summary became Today and Stats became Progress. The ids moved with the
 * names, but the old ones are already out in the world: `?view=summary` is
 * baked into the start_url of every installed PWA and cannot be updated
 * remotely, and sent notifications carry their targets with them.
 */
import { describe, it, expect } from 'vitest'
import { resolveViewId, resolveDeepLink } from '../utils/viewId'

describe('legacy ids keep working', () => {
  it('sends an already-installed PWA to Today, not to a blank tab', () => {
    // start_url: "./?view=summary" on someone's home screen since last year.
    expect(resolveDeepLink('summary')).toBe('today')
  })

  it('maps the old Stats id to Progress', () => {
    expect(resolveDeepLink('dashboard')).toBe('progress')
  })

  it("resolves 'stats', which was never a real tab id at all", () => {
    // The zones primer could write this into ba_initial_view; it used to
    // select a view that did not exist.
    expect(resolveViewId('stats')).toBe('progress')
  })

  it('passes the new ids through unchanged', () => {
    expect(resolveDeepLink('today')).toBe('today')
    expect(resolveDeepLink('progress')).toBe('progress')
    expect(resolveDeepLink('plan')).toBe('plan')
    expect(resolveDeepLink('coach')).toBe('coach')
    expect(resolveDeepLink('settings')).toBe('settings')
  })

  it('returns null for nonsense so the caller falls back to the default tab', () => {
    expect(resolveDeepLink('nope')).toBeNull()
    expect(resolveDeepLink('')).toBeNull()
    expect(resolveDeepLink(null)).toBeNull()
    expect(resolveDeepLink(undefined)).toBeNull()
  })

  it('will not deep-link into tabs that are not entry points', () => {
    // Reachable in the app, but not somewhere a URL should drop you.
    expect(resolveDeepLink('zones')).toBeNull()
    expect(resolveViewId('zones')).toBe('zones')
  })
})

describe('the shipped manifest', () => {
  const MANIFEST = Object.values(import.meta.glob('../../public/manifest.webmanifest', {
    query: '?raw', import: 'default', eager: true,
  }))[0] as string

  it('installs new clients onto the current tab ids', () => {
    const m = JSON.parse(MANIFEST) as {
      start_url: string
      shortcuts?: { url: string }[]
    }
    const urls = [m.start_url, ...(m.shortcuts ?? []).map(s => s.url)]
    for (const url of urls) {
      const id = url.split('view=')[1]
      if (!id) continue
      // Every id the manifest ships must be one we still recognise, and
      // must not be a legacy alias — those exist for clients we cannot
      // update, not for the manifest we control.
      expect(resolveDeepLink(id), url).not.toBeNull()
      expect(['summary', 'dashboard', 'stats'], url).not.toContain(id)
    }
  })
})
