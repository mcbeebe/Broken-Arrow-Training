/**
 * The bottom bar has five slots and Settings lives behind the gear. The
 * approved order is Today · Plan · Progress · Coach · Journal — asserted so
 * a future tab cannot quietly evict the Journal.
 */
import { describe, it, expect } from 'vitest'

const APP = Object.values(import.meta.glob('../App.tsx', {
  query: '?raw', import: 'default', eager: true,
}))[0] as string

describe('the bottom navigation', () => {
  it('carries the approved five tabs, in order', () => {
    const ids = [...APP.matchAll(/\{ id: '([a-z]+)', label: '([A-Za-z]+)'/g)]
      .map(m => [m[1], m[2]])
    expect(ids).toEqual([
      ['today', 'Today'],
      ['plan', 'Plan'],
      ['progress', 'Progress'],
      ['coach', 'Coach'],
      ['journal', 'Journal'],
    ])
  })

  it('keeps Settings out of the bar', () => {
    expect(APP).not.toMatch(/\{ id: 'settings', label: 'Settings' \}/)
  })

  it('no longer refers to the old tab ids', () => {
    expect(APP).not.toMatch(/view === 'summary'/)
    expect(APP).not.toMatch(/view === 'dashboard'/)
    expect(APP).not.toMatch(/setView\('summary'\)/)
    expect(APP).not.toMatch(/setView\('dashboard'\)/)
  })
})
