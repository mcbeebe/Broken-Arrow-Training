/**
 * The root page's boot: the launch switch and the forward itself. A wrong
 * switch test or a dropped `replace` would strand every installed app on
 * the placeholder, so both directions are pinned here.
 */
import { describe, it, expect, vi } from 'vitest'
import { bootRootPage, GUARD_RAN_FLAG, type RootPageDeps } from '../../landing/boot'

function deps(over: Partial<RootPageDeps> & { search?: string; hash?: string } = {}) {
  const replace = vi.fn()
  const renderLanding = vi.fn()
  const d: RootPageDeps = {
    env: {},
    location: { search: over.search ?? '', hash: over.hash ?? '', replace },
    standalone: false,
    hasSession: false,
    renderLanding,
    ...over,
  }
  return { d, replace, renderLanding }
}

describe('bootRootPage', () => {
  it('switch unset: forwards plain / to the app and renders nothing', () => {
    const { d, replace, renderLanding } = deps()
    expect(bootRootPage(d)).toBe('/app/')
    expect(replace).toHaveBeenCalledWith('/app/')
    expect(renderLanding).not.toHaveBeenCalled()
  })

  it.each(['false', 'TRUE', '1', ''])('switch %j is off: forwards everyone', value => {
    const { d, replace } = deps({ env: { VITE_LANDING_ENABLED: value }, search: '?from=tool-heat', hash: '#join' })
    bootRootPage(d)
    expect(replace).toHaveBeenCalledWith('/app/?from=tool-heat#join')
  })

  it("switch 'true': plain / renders the landing page", () => {
    const { d, replace, renderLanding } = deps({ env: { VITE_LANDING_ENABLED: 'true' } })
    expect(bootRootPage(d)).toBeNull()
    expect(replace).not.toHaveBeenCalled()
    expect(renderLanding).toHaveBeenCalledOnce()
  })

  it("switch 'true': a deep link still forwards with query and hash", () => {
    const { d, replace, renderLanding } = deps({
      env: { VITE_LANDING_ENABLED: 'true' },
      search: '?view=coach',
      hash: '#mike',
    })
    bootRootPage(d)
    expect(replace).toHaveBeenCalledWith('/app/?view=coach#mike')
    expect(renderLanding).not.toHaveBeenCalled()
  })

  it("switch 'true': an installed app and a signed-in visitor forward", () => {
    for (const over of [{ standalone: true }, { hasSession: true }]) {
      const { d, replace } = deps({ env: { VITE_LANDING_ENABLED: 'true' }, ...over })
      bootRootPage(d)
      expect(replace).toHaveBeenCalledWith('/app/')
    }
  })

  it('names the flag the inline fallback in index.html reads', () => {
    expect(GUARD_RAN_FLAG).toBe('__attuneGuardRan')
  })
})
