/**
 * Initiative 003: tokens.ts is the Signal palette from tokens.json, light and
 * dark. A color edited in one and not the other would ship an unchecked pair,
 * so both are pinned to the JSON, and every pair the page puts together
 * (tokens.json `checkedPairs`) is contrast-checked in both palettes here.
 */
import { beforeAll, describe, it, expect } from 'vitest'
import type { Config } from 'tailwindcss'
import tokens from '../../../docs/initiatives/003-landing-page/tokens.json'
import { SIGNAL, SIGNAL_DARK, themed, tokenVar } from '../../landing/tokens'

type Name = keyof typeof SIGNAL

/** WCAG 2.x relative luminance of a #RRGGBB color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x contrast ratio. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('contrast()', () => {
  it('agrees with known WCAG values', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
    // tokens.json colorRules: signal on white is 3.56:1.
    expect(contrast('#EA580C', '#FFFFFF')).toBeCloseTo(3.56, 2)
  })
})

describe('tokens.ts', () => {
  it('is the approved palette', () => {
    expect(tokens.palette.approved).toBe('signal')
  })

  it('matches tokens.json’s Signal palette exactly', () => {
    expect(SIGNAL).toEqual(tokens.palette.signal)
  })

  it('matches tokens.json’s dark Signal palette exactly, key for key', () => {
    expect(SIGNAL_DARK).toEqual(tokens.palette.signalDark)
    expect(Object.keys(SIGNAL_DARK).sort()).toEqual(Object.keys(SIGNAL).sort())
  })

  it.each([
    ['light', SIGNAL as Record<Name, string>],
    ['dark', SIGNAL_DARK],
  ] as const)('keeps the deep bands visibly apart from the ground in %s', (_mode, palette) => {
    // Decorative, so no WCAG minimum; 1.5:1 is where a band's edge stays visible on a phone.
    expect(contrast(palette.deep, palette.ground)).toBeGreaterThanOrEqual(1.5)
  })

  it('names custom properties in kebab case', () => {
    expect(tokenVar('ground')).toBe('--landing-ground')
    expect(tokenVar('onDeepMuted')).toBe('--landing-on-deep-muted')
    expect(themed('focusRing')).toBe('var(--landing-focus-ring)')
  })
})

const PAIRS = tokens.checkedPairs as unknown as {
  text: [Name, Name][]
  marks: [Name, Name][]
  knownFailures: Record<string, [Name, Name, string][]>
}

const PALETTES = [
  ['signal', SIGNAL as Record<Name, string>],
  ['signalDark', SIGNAL_DARK],
] as const

describe.each(PALETTES)('%s contrast', (key, palette) => {
  const known = (PAIRS.knownFailures[key] ?? []).map(([fg, bg]) => `${fg}/${bg}`)
  const checked = (pairs: [Name, Name][]) => pairs.filter(([fg, bg]) => !known.includes(`${fg}/${bg}`))

  it.each(checked(PAIRS.text))('text %s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(4.5)
  })

  it.each(checked(PAIRS.marks))('mark %s on %s is at least 3:1', (fg, bg) => {
    expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(3)
  })

  it.each(PAIRS.knownFailures[key] ?? [])('known failure %s on %s still fails (delete its entry once fixed)', (fg, bg) => {
    expect(contrast(palette[fg], palette[bg])).toBeLessThan(3)
  })
})

describe('checkedPairs', () => {
  it('names only real tokens and palettes', () => {
    for (const k of Object.keys(PAIRS.knownFailures).filter(k => !k.startsWith('$'))) {
      expect(['signal', 'signalDark']).toContain(k)
    }
    const listed = [...PAIRS.text, ...PAIRS.marks].map(([fg, bg]) => `${fg}/${bg}`)
    for (const [fg, bg] of Object.entries(PAIRS.knownFailures).flatMap(([k, v]) => (k.startsWith('$') ? [] : v))) {
      expect(listed).toContain(`${fg}/${bg}`)
    }
    for (const [fg, bg] of [...PAIRS.text, ...PAIRS.marks]) {
      expect(SIGNAL).toHaveProperty(fg)
      expect(SIGNAL).toHaveProperty(bg)
    }
  })
})

describe('tailwind.landing.config.js', () => {
  const [landingConfig] = Object.values(
    import.meta.glob<Config>('../../../tailwind.landing.config.js', { import: 'default', eager: true }),
  )
  const colors = (landingConfig.theme?.extend?.colors as Record<string, Record<string, string>>).landing

  it('maps every token to its custom property, never a hex value', () => {
    expect(Object.keys(colors)).toHaveLength(Object.keys(SIGNAL).length)
    for (const name of Object.keys(SIGNAL) as Name[]) {
      const cls = tokenVar(name).replace('--landing-', '')
      expect(colors[cls]).toBe(themed(name))
    }
  })
})

describe('landing source', () => {
  // Everything under src/landing except tokens.ts, which defines the palettes.
  const sources: Record<string, string> = import.meta.glob<string>(
    ['../../landing/**/*.{ts,tsx}', '!../../landing/tokens.ts'],
    { query: '?raw', import: 'default', eager: true },
  )

  beforeAll(async () => {
    // Vitest stubs every CSS import to '' (even ?raw), so the stylesheet is read from
    // disk, relative to the repo root that vitest runs from.
    const fsModule = 'node:fs'
    const fs = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (p: string, e: 'utf8') => string }
    sources['../../landing/landing.css'] = fs.readFileSync('src/landing/landing.css', 'utf8')
  })

  const FIXED = [
    ['a hex color', /#(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3,4})\b/],
    ['an rgb()/hsl() color', /\b(?:rgba?|hsla?)\(/],
    ['the SIGNAL hex values', /\bSIGNAL(?:_DARK)?\b/],
    [
      'a Tailwind palette color',
      /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|divide|placeholder|caret|accent|shadow)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)\b/,
    ],
    ['a named CSS color', /\b(?:color|background(?:-color)?|border(?:-color)?|fill|stroke)\s*:\s*(?:white|black)\b/],
  ] as const

  it('finds the page’s files, the stylesheet with its contents', () => {
    const files = Object.keys(sources)
    expect(files.length).toBeGreaterThan(25)
    expect(files.some(f => f.endsWith('tokens.ts'))).toBe(false)
    expect(sources['../../landing/landing.css']).toContain('@tailwind base')
  })

  it('no file uses a fixed color (dark mode could not reach it)', () => {
    const hits = Object.entries(sources).flatMap(([file, src]) =>
      FIXED.filter(([, re]) => re.test(src)).map(([what]) => `${file}: ${what}`),
    )
    expect(hits).toEqual([])
  })

  it.each(FIXED)('the guard catches %s', (_what, re) => {
    const samples = ['#0E1614', 'rgba(0,0,0,0.5)', 'SIGNAL.action', 'text-white', 'color: white']
    expect(samples.some(x => re.test(x))).toBe(true)
  })
})
