/**
 * Initiative 003: tokens.ts is the Signal palette from tokens.json, light and
 * dark. A color edited in one and not the other would ship an unchecked pair,
 * so both are pinned to the JSON, and every pair the page puts together
 * (tokens.json `checkedPairs`) is contrast-checked in both palettes here.
 */
import { describe, it, expect } from 'vitest'
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

  it('keeps the deep bands the same in both palettes', () => {
    for (const k of ['deep', 'deepCard', 'deepLine', 'onDeep', 'onDeepMuted', 'accentOnDeep'] as const) {
      expect(SIGNAL_DARK[k]).toBe(SIGNAL[k])
    }
  })

  it('names custom properties in kebab case', () => {
    expect(tokenVar('ground')).toBe('--landing-ground')
    expect(tokenVar('onDeepMuted')).toBe('--landing-on-deep-muted')
    expect(themed('focusRing')).toBe('var(--landing-focus-ring)')
  })
})

const PAIRS = tokens.checkedPairs as unknown as { text: [Name, Name][]; marks: [Name, Name][] }

describe.each([
  ['light', SIGNAL as Record<Name, string>],
  ['dark', SIGNAL_DARK],
] as const)('%s palette contrast', (_mode, palette) => {
  it.each(PAIRS.text)('text %s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(4.5)
  })

  it.each(PAIRS.marks)('mark %s on %s is at least 3:1', (fg, bg) => {
    expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(3)
  })
})

describe('checkedPairs', () => {
  it('names only real tokens', () => {
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

describe('landing components', () => {
  const sources = import.meta.glob<string>(['../../landing/components/*.tsx', '../../landing/LandingPage.tsx'], {
    query: '?raw',
    import: 'default',
    eager: true,
  })

  it('finds the components', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(15)
  })

  it.each(Object.entries(sources))('%s uses no fixed colors (dark mode could not reach them)', (_file, src) => {
    expect(src).not.toMatch(/#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b/)
    expect(src).not.toMatch(/\bSIGNAL(_DARK)?\b/)
  })
})
