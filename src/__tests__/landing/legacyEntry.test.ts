/**
 * Initiative 003 — the root page's legacy entry guard.
 *
 * Everything that ever opened the app at `/` (installed home-screen apps,
 * notification taps, Strava's OAuth callback, airlock hand-offs, links that
 * carry `?view=` or an athlete hash, signed-in members) must reach `/app/`
 * with its query and hash intact. Tool visitors and plain `/` stay on the
 * landing page once it is live.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  APP_PATH,
  APP_PARAMS,
  LANDING_ANCHORS,
  hasStoredSession,
  isStandalone,
  legacyEntryTarget,
  type LegacyEntryInput,
} from '../../landing/legacyEntry'
import { SECTION_IDS } from '../../landing/content'

const base: LegacyEntryInput = {
  search: '',
  hash: '',
  standalone: false,
  hasSession: false,
  forwardAll: false,
}

const cases: Array<[string, Partial<LegacyEntryInput>, string | null]> = [
  ['deep link to Today', { search: '?view=today' }, '/app/?view=today'],
  ['deep link with athlete hash', { search: '?view=coach', hash: '#mike' }, '/app/?view=coach#mike'],
  [
    'Strava OAuth callback, forwarded verbatim',
    { search: '?state=&code=abc&scope=read,activity:read_all' },
    '/app/?state=&code=abc&scope=read,activity:read_all',
  ],
  ['Strava OAuth cancel', { search: '?error=access_denied&state=' }, '/app/?error=access_denied&state='],
  [
    'airlock hand-off, forwarded verbatim',
    { search: '?__migrate=1', hash: '#__attune_migrate=xyz' },
    '/app/?__migrate=1#__attune_migrate=xyz',
  ],
  ['migration fragment alone', { hash: '#__attune_migrate=xyz' }, '/app/#__attune_migrate=xyz'],
  ['athlete hash alone', { hash: '#mike' }, '/app/#mike'],
  ['installed home-screen app, no params', { standalone: true }, '/app/'],
  ['installed app with ?home=1 still forwards', { standalone: true, search: '?home=1' }, '/app/?home=1'],
  ['signed-in visitor', { hasSession: true }, '/app/'],
  ['signed-in visitor asking for the landing page', { hasSession: true, search: '?home=1' }, null],
  ['?xhome=10 is not home=1', { hasSession: true, search: '?xhome=10' }, '/app/?xhome=10'],
  ['?home=10 is not home=1', { hasSession: true, search: '?home=10' }, '/app/?home=10'],
  ['tool visitor heading for the invite form', { search: '?from=tool-fueling', hash: '#join' }, null],
  ['?from= alone never forwards', { search: '?from=tool-heat' }, null],
  ['plain /', {}, null],
  ['bare ?', { search: '?' }, null],
  ['forwardAll: plain /', { forwardAll: true }, '/app/'],
  ['forwardAll: tool visitor', { forwardAll: true, search: '?from=tool-heat', hash: '#join' }, '/app/?from=tool-heat#join'],
  ['forwardAll: ?home=1', { forwardAll: true, search: '?home=1' }, '/app/?home=1'],
  ['encoded characters preserved byte-for-byte', { search: '?view=coach&x=%2F' }, '/app/?view=coach&x=%2F'],
  ['encoded hash preserved byte-for-byte', { search: '?view=plan', hash: '#a%20b' }, '/app/?view=plan#a%20b'],
  ['an unknown anchor is an athlete id', { hash: '#Join' }, '/app/#Join'],
  ['app param among others', { search: '?utm_source=x&view=plan' }, '/app/?utm_source=x&view=plan'],
  ['an empty app param still counts', { search: '?view=' }, '/app/?view='],
]

describe('legacyEntryTarget', () => {
  it.each(cases)('%s', (_name, input, expected) => {
    expect(legacyEntryTarget({ ...base, ...input })).toBe(expected)
  })

  it.each([...LANDING_ANCHORS].filter(a => a !== ''))('landing anchor %s stays on the landing page', anchor => {
    expect(legacyEntryTarget({ ...base, hash: anchor })).toBeNull()
  })

  it.each(APP_PARAMS)('?%s= forwards', key => {
    expect(legacyEntryTarget({ ...base, search: `?${key}=1` })).toBe(`/app/?${key}=1`)
  })
})

describe('constants', () => {
  it('APP_PATH is /app/', () => {
    expect(APP_PATH).toBe('/app/')
  })

  it('APP_PARAMS is exactly the spec list', () => {
    expect([...APP_PARAMS]).toEqual(['view', 'code', 'scope', 'state', 'error', '__migrate'])
  })

  it('LANDING_ANCHORS is derived from SECTION_IDS plus the empty hash and the skip-link target', () => {
    expect(new Set(LANDING_ANCHORS)).toEqual(new Set(['', '#main', ...SECTION_IDS.map(id => `#${id}`)]))
  })

  it('SECTION_IDS are the six sections the design spec names', () => {
    expect([...SECTION_IDS]).toEqual(['top', 'join', 'how', 'you', 'coach', 'tools'])
  })
})

describe('hasStoredSession', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('is false with no session key', () => {
    expect(hasStoredSession()).toBe(false)
  })

  it('is true when ba_auth_session exists, whatever its contents', () => {
    localStorage.setItem('ba_auth_session', 'expired-or-not')
    expect(hasStoredSession()).toBe(true)
  })

  it('is false when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(hasStoredSession()).toBe(false)
  })
})

describe('isStandalone', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'standalone')
  })

  it('is true when display-mode is standalone', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(display-mode: standalone)' }))
    expect(isStandalone()).toBe(true)
  })

  it('is true for iOS navigator.standalone', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    expect(isStandalone()).toBe(true)
  })

  it('is false in a browser tab', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(isStandalone()).toBe(false)
  })

  it('is false when matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(isStandalone()).toBe(false)
  })
})
