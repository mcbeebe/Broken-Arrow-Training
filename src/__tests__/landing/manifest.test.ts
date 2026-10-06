/**
 * Initiative 003: the web app manifest after the app moved to /app/.
 *
 * `id` pins the identity Chrome derived for existing installs from the old
 * start_url (`./?view=today` resolved against `/`), so they update in place
 * rather than becoming a second app. `scope` stays `/` so the old installs'
 * saved `/?view=today` is still in scope.
 */
import { describe, it, expect } from 'vitest'
import manifestRaw from '../../../public/manifest.webmanifest?raw'

interface WebManifest {
  id: string
  start_url: string
  scope: string
  icons: Array<{ src: string }>
  shortcuts: Array<{ url: string }>
}

const manifest = JSON.parse(manifestRaw) as WebManifest

describe('manifest.webmanifest', () => {
  it('keeps the identity existing installs derived', () => {
    expect(manifest.id).toBe('/?view=today')
  })

  it('starts the app at /app/ on Today', () => {
    expect(manifest.start_url).toBe('/app/?view=today')
  })

  it('scopes to the whole origin', () => {
    expect(manifest.scope).toBe('/')
  })

  it('points every shortcut into /app/', () => {
    expect(manifest.shortcuts.map(s => s.url)).toEqual([
      '/app/?view=today',
      '/app/?view=coach',
      '/app/?view=plan',
    ])
  })

  it('uses the root favicon as its icon', () => {
    expect(manifest.icons.map(i => i.src)).toEqual(['/favicon.svg'])
  })
})
