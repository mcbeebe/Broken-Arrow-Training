/**
 * T1 — the legibility floor.
 *
 * Two defects the persona audit found, guarded here so they cannot return:
 * a white card background that stayed white in dark mode (making the
 * dark:text-white heading on top of it invisible), and type below 10px,
 * which shipped across 15 components and could not be read on a phone in
 * daylight.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { adaptBg, getDarkBg } from '../utils/styles'

// Vite inlines these at transform time — no node types needed.
const COMPONENT_SOURCES = import.meta.glob('../components/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

afterEach(() => { document.documentElement.classList.remove('dark') })

describe('dark-mode card backgrounds', () => {
  it('turns a plain white card into the slate card colour in dark mode', () => {
    // Light mode leaves it alone.
    expect(adaptBg('#FFFFFF')).toBe('#FFFFFF')
    // Dark mode must not return white — the heading on top is dark:text-white.
    document.documentElement.classList.add('dark')
    expect(adaptBg('#FFFFFF')).toBe('#1e293b')
    expect(getDarkBg('#FFFFFF')).not.toMatch(/^#(fff|ffffff)$/i)
  })

  it('never paints a card white without making it dark-aware', () => {
    // The defect was narrower than "an inline background": chart and data
    // colours are legitimately literal. What breaks is a WHITE card that
    // stays white in dark mode, with dark:text-white on top of it. So the
    // rule bans a white literal unless the same expression is either
    // routed through adaptBg or explicitly branches on the dark class.
    const WHITE = /'(white|#fff|#ffffff)'/i
    const DARK_AWARE = /adaptBg|isDark|classList\.contains\('dark'\)/
    const offenders: string[] = []
    for (const [path, src] of Object.entries(COMPONENT_SOURCES)) {
      for (const decl of src.match(/backgroundColor:[^,}\n]+/g) ?? []) {
        if (WHITE.test(decl) && !DARK_AWARE.test(decl)) {
          offenders.push(`${path}: ${decl.trim()}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('has no raw white background literal left on Today', () => {
    const src = COMPONENT_SOURCES['../components/Summary.tsx']
    expect(src).toBeTruthy()
    expect(src).not.toMatch(/backgroundColor:\s*'white'/)
  })
})

describe('type size floor', () => {
  it('ships no type below 10px in any component', () => {
    const offenders = Object.entries(COMPONENT_SOURCES)
      // text-[0px] … text-[9px] — a single digit is by definition under ten.
      .filter(([, src]) => /text-\[[0-9]px\]/.test(src))
      .map(([path]) => path.replace('../components/', ''))
    expect(offenders).toEqual([])
  })
})
