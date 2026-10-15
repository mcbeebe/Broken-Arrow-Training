/**
 * Light or dark on the landing page: the device decides, the header switch
 * overrides it, a saved pick is applied before first paint by index.html, and
 * a pick that matches the device is forgotten so the page follows it again.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import rootHtml from '../../../index.html?raw'
import { SiteHeader } from '../../landing/components/SiteHeader'
import { THEME_TOGGLE } from '../../landing/content'
import { SIGNAL, SIGNAL_DARK } from '../../landing/tokens'
import {
  DARK_QUERY,
  THEME_KEY,
  applyTheme,
  deviceIsDark,
  readStoredTheme,
  resolveTheme,
} from '../../landing/theme'

/** A fake `matchMedia` whose dark-mode answer the test can flip, firing `change`. */
function fakeDevice(dark: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>()
  const mql = {
    get matches() {
      return dark
    },
    media: DARK_QUERY,
    addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.delete(fn),
  }
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia
  return {
    set(next: boolean) {
      dark = next
      listeners.forEach(fn => fn({ matches: next } as MediaQueryListEvent))
    },
    listeners,
  }
}

const originalMatchMedia = window.matchMedia
beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})
afterEach(() => {
  window.matchMedia = originalMatchMedia
})

describe('readStoredTheme', () => {
  it('returns a saved light or dark pick', () => {
    expect(readStoredTheme({ getItem: () => 'dark' })).toBe('dark')
    expect(readStoredTheme({ getItem: () => 'light' })).toBe('light')
  })

  it('ignores anything else, missing storage, and storage that throws', () => {
    expect(readStoredTheme({ getItem: () => null })).toBeNull()
    expect(readStoredTheme({ getItem: () => 'purple' })).toBeNull()
    expect(readStoredTheme(undefined)).toBeNull()
    expect(
      readStoredTheme({
        getItem: () => {
          throw new Error('SecurityError')
        },
      }),
    ).toBeNull()
  })
})

describe('resolveTheme', () => {
  it('follows the device when nothing is picked', () => {
    expect(resolveTheme(null, false)).toBe('light')
    expect(resolveTheme(null, true)).toBe('dark')
  })

  it('lets a pick win over the device', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })
})

describe('deviceIsDark', () => {
  it('reads the dark-mode media query', () => {
    fakeDevice(true)
    expect(deviceIsDark(window)).toBe(true)
    expect(window.matchMedia).toHaveBeenCalledWith(DARK_QUERY)
  })

  it('is false without matchMedia', () => {
    expect(deviceIsDark({} as Window)).toBe(false)
    expect(deviceIsDark(undefined)).toBe(false)
  })
})

describe('applyTheme', () => {
  it('saves and marks a pick that differs from the device', () => {
    applyTheme('dark', false, document.documentElement, localStorage)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
  })

  it('forgets a pick that matches the device, so the page follows it again', () => {
    applyTheme('dark', false, document.documentElement, localStorage)
    applyTheme('light', false, document.documentElement, localStorage)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it('still switches the page when storage throws', () => {
    const broken = {
      setItem: () => {
        throw new Error('QuotaExceeded')
      },
      removeItem: () => {
        throw new Error('QuotaExceeded')
      },
    }
    expect(() => applyTheme('light', true, document.documentElement, broken)).not.toThrow()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})

describe('index.html', () => {
  const pick = /<script data-theme-pick>([\s\S]*?)<\/script>/.exec(rootHtml)?.[1] ?? ''
  const ground = /<style data-theme-ground>([\s\S]*?)<\/style>/.exec(rootHtml)?.[1] ?? ''

  /** Run the inline script against a fake root and storage. */
  function runPick(stored: string | null | Error) {
    const root = { setAttribute: vi.fn() }
    const storage = {
      getItem: () => {
        if (stored instanceof Error) throw stored
        return stored
      },
    }
    new Function('document', 'localStorage', pick)({ documentElement: root }, storage)
    return root.setAttribute
  }

  it('declares that the page supports both schemes', () => {
    expect(rootHtml).toContain('<meta name="color-scheme" content="light dark" />')
  })

  it('applies a saved pick before any module script, with the same key as theme.ts', () => {
    expect(pick).toContain(`'${THEME_KEY}'`)
    expect(rootHtml.indexOf('data-theme-pick')).toBeLessThan(rootHtml.indexOf('type="module"'))
    expect(runPick('dark')).toHaveBeenCalledWith('data-theme', 'dark')
    expect(runPick('light')).toHaveBeenCalledWith('data-theme', 'light')
  })

  it('leaves the device in charge without a valid pick, and survives blocked storage', () => {
    expect(runPick(null)).not.toHaveBeenCalled()
    expect(runPick('purple')).not.toHaveBeenCalled()
    expect(runPick(new Error('SecurityError'))).not.toHaveBeenCalled()
  })

  it('paints each theme’s ground before the CSS arrives, in the palettes’ colors', () => {
    expect(ground).toContain(`background: ${SIGNAL.ground}`)
    expect(ground.match(new RegExp(`background: ${SIGNAL_DARK.ground}`, 'g'))).toHaveLength(2)
    expect(ground).toContain('color-scheme: only light')
    expect(ground).toContain(DARK_QUERY)
  })
})

describe('ThemeToggle in the header', () => {
  const toggle = () => screen.getByRole('button', { name: /Switch to (dark|light) mode/ })

  it('offers dark on a light device, and saves the pick', async () => {
    fakeDevice(false)
    const user = userEvent.setup()
    render(<SiteHeader />)
    expect(toggle()).toHaveAccessibleName(THEME_TOGGLE.toDark)
    await user.click(toggle())
    expect(toggle()).toHaveAccessibleName(THEME_TOGGLE.toLight)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
  })

  it('starts dark on a dark device, and switching back forgets the pick', async () => {
    fakeDevice(true)
    const user = userEvent.setup()
    render(<SiteHeader />)
    expect(toggle()).toHaveAccessibleName(THEME_TOGGLE.toLight)
    await user.click(toggle())
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    await user.click(toggle())
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
    expect(toggle()).toHaveAccessibleName(THEME_TOGGLE.toLight)
  })

  it('starts on a saved pick over the device', () => {
    fakeDevice(true)
    localStorage.setItem(THEME_KEY, 'light')
    render(<SiteHeader />)
    expect(toggle()).toHaveAccessibleName(THEME_TOGGLE.toDark)
  })

  it('follows the device changing while nothing is picked, and stops listening on unmount', () => {
    const device = fakeDevice(false)
    const { unmount } = render(<SiteHeader />)
    expect(toggle()).toHaveAccessibleName(THEME_TOGGLE.toDark)
    act(() => device.set(true))
    expect(toggle()).toHaveAccessibleName(THEME_TOGGLE.toLight)
    unmount()
    expect(device.listeners.size).toBe(0)
  })

  it('keeps a pick when the device changes', async () => {
    const device = fakeDevice(false)
    const user = userEvent.setup()
    render(<SiteHeader />)
    await user.click(toggle())
    act(() => device.set(false))
    expect(toggle()).toHaveAccessibleName(THEME_TOGGLE.toLight)
  })

  it('renders without matchMedia, as light', () => {
    // @ts-expect-error simulating a browser without matchMedia
    window.matchMedia = undefined
    render(<SiteHeader />)
    expect(toggle()).toHaveAccessibleName(THEME_TOGGLE.toDark)
  })
})
