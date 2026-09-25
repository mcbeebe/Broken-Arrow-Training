/**
 * One color per load series, shared by the chart line, its legend chip and
 * its stat card so the three can never disagree.
 *
 * Field bug (2026-09-24): the lines read the athlete's theme palette while
 * the chips and cards were fixed Tailwind colors, so on the Ocean theme
 * Fitness drew purple, Fatigue amber and 7d Load teal under blue / red /
 * amber chips. These are identities, not branding, so they no longer
 * follow the theme.
 *
 * Validated with the dataviz palette checker (light on #ffffff, dark on
 * slate-800 #1e293b): lightness band, chroma, red–green colour-blind
 * separation and 3:1 contrast all pass. Recovery is teal rather than green
 * because green beside Fatigue's red failed the deuteranopia check.
 */

export type LoadSeries = 'ctl' | 'atl' | 'tsb' | 'load'

export interface SeriesColor {
  /** Tailwind hue + step the hex is taken from (for the chip and card). */
  hue: 'blue' | 'red' | 'teal' | 'amber'
  light: { step: number; hex: string }
  dark: { step: number; hex: string }
  /** Active legend chip: fill matches the line in both modes; the label
   *  is white or slate-950, whichever clears 4.5:1 on that fill (white on
   *  teal-600 is 3.7:1, on amber-600 3.2:1). */
  chipOn: string
  chipOff: string
  /** Stat-card value text in the series color (the cards whose value is
   *  the series itself; Recovery Balance colors by zone). */
  text?: string
  /** The short line swatch beside a stat card's label. */
  swatch: string
}

export const LOAD_SERIES_COLORS: Record<LoadSeries, SeriesColor> = {
  ctl: {
    hue: 'blue',
    light: { step: 600, hex: '#2563eb' },
    dark: { step: 500, hex: '#3b82f6' },
    chipOn: 'bg-blue-600 border-blue-600 dark:bg-blue-500 dark:border-blue-500 text-white dark:text-slate-950',
    chipOff: 'border-blue-300 text-blue-600 dark:text-blue-400',
    text: 'text-blue-600 dark:text-blue-400',
    swatch: 'bg-blue-600 dark:bg-blue-500',
  },
  atl: {
    hue: 'red',
    light: { step: 600, hex: '#dc2626' },
    dark: { step: 500, hex: '#ef4444' },
    chipOn: 'bg-red-600 border-red-600 dark:bg-red-500 dark:border-red-500 text-white dark:text-slate-950',
    chipOff: 'border-red-300 text-red-600 dark:text-red-400',
    text: 'text-red-600 dark:text-red-400',
    swatch: 'bg-red-600 dark:bg-red-500',
  },
  tsb: {
    hue: 'teal',
    light: { step: 600, hex: '#0d9488' },
    dark: { step: 600, hex: '#0d9488' },
    chipOn: 'bg-teal-600 border-teal-600 text-slate-950',
    chipOff: 'border-teal-300 text-teal-700 dark:text-teal-400',
    swatch: 'bg-teal-600',
  },
  load: {
    hue: 'amber',
    light: { step: 600, hex: '#d97706' },
    dark: { step: 600, hex: '#d97706' },
    chipOn: 'bg-amber-600 border-amber-600 text-slate-950',
    chipOff: 'border-amber-300 text-amber-700 dark:text-amber-400',
    swatch: 'bg-amber-600',
  },
}

/** The line color for a series in the current mode. */
export function seriesHex(series: LoadSeries, isDark: boolean): string {
  const c = LOAD_SERIES_COLORS[series]
  return isDark ? c.dark.hex : c.light.hex
}
