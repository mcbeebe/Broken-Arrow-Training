/**
 * Light or dark for the landing page. The device setting decides, unless the
 * visitor picked the other one with the header toggle; that pick is kept in
 * localStorage and written to `data-theme` on <html>, which the CSS reads
 * (tailwind.landing.config.js). index.html applies a saved pick before first
 * paint with the same key, so the page never flashes the wrong theme.
 *
 * A pick that matches the device is forgotten rather than saved, so a visitor
 * who toggles back follows their device again, day and night.
 */

export type Theme = 'light' | 'dark'

/** localStorage key; index.html's inline script reads the same one. */
export const THEME_KEY = 'attune.landing.theme'

/** The media query for a device in dark mode. */
export const DARK_QUERY = '(prefers-color-scheme: dark)'

/** The visitor's saved pick, or null. Storage can throw (private modes, blocked storage). */
export function readStoredTheme(storage: Pick<Storage, 'getItem'> | undefined): Theme | null {
  try {
    const v = storage?.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

/** The theme the page shows: the saved pick, else the device's. */
export function resolveTheme(stored: Theme | null, deviceDark: boolean): Theme {
  return stored ?? (deviceDark ? 'dark' : 'light')
}

/** Whether the device prefers dark. False where matchMedia is missing (old browsers, jsdom). */
export function deviceIsDark(win: Pick<Window, 'matchMedia'> | undefined): boolean {
  return typeof win?.matchMedia === 'function' && win.matchMedia(DARK_QUERY).matches
}

/**
 * Show `theme` and remember it, unless it is what the device shows anyway:
 * then forget the pick and clear `data-theme`, so the CSS follows the device.
 */
export function applyTheme(
  theme: Theme,
  deviceDark: boolean,
  root: Pick<HTMLElement, 'setAttribute' | 'removeAttribute'>,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined,
): void {
  const followsDevice = theme === (deviceDark ? 'dark' : 'light')
  if (followsDevice) root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  try {
    if (followsDevice) storage?.removeItem(THEME_KEY)
    else storage?.setItem(THEME_KEY, theme)
  } catch {
    // Storage blocked: the switch still holds for this visit.
  }
}
