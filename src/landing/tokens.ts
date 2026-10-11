/**
 * The Signal palette, from docs/initiatives/003-landing-page/tokens.json (the
 * approved palette). tailwind.landing.config.js writes both palettes into CSS
 * custom properties and maps them to `landing-*` classes, so components never
 * use these hex values: they use a class, or `themed()` where a class can't
 * express the value (the readiness ring's gradient). That is what lets dark
 * mode reach every color. A test keeps this in step with the JSON and checks
 * every pair the page uses in both palettes.
 */
export const SIGNAL = {
  ground: '#F3F6F4',
  card: '#FFFFFF',
  soft: '#E6EEEA',
  line: '#D3DED9',
  ink: '#14302B',
  muted: '#46595A',
  action: '#0F766E',
  actionText: '#FFFFFF',
  signal: '#EA580C',
  signalText: '#B4410C',
  deep: '#12322E',
  deepCard: '#0C2421',
  deepLine: '#2E5751',
  onDeep: '#FFFFFF',
  onDeepMuted: '#CFE3DC',
  accentOnDeep: '#5EEAD4',
  signalOnDeep: '#FB923C',
  chartBar: '#8FBFB6',
  chartToday: '#EA580C',
  ctaOnDeepBg: '#F97316',
  ctaOnDeepText: '#1C1917',
  error: '#B91C1C',
  inputBorder: '#94A3B8',
  inputBorderSoft: '#CBD5E1',
  focusRing: '#0D9488',
} as const

/**
 * Signal for dark mode (tokens.json `signalDark`): the light grounds turn dark,
 * the deep bands keep their colors. Same keys as SIGNAL.
 */
export const SIGNAL_DARK: Record<keyof typeof SIGNAL, string> = {
  ground: '#0E1614',
  card: '#16211F',
  soft: '#1D2C29',
  line: '#2C3E3A',
  ink: '#E6F0EC',
  muted: '#A7B9B4',
  action: '#2DD4BF',
  actionText: '#042F2B',
  signal: '#FB923C',
  signalText: '#FB923C',
  deep: '#12322E',
  deepCard: '#0C2421',
  deepLine: '#2E5751',
  onDeep: '#FFFFFF',
  onDeepMuted: '#CFE3DC',
  accentOnDeep: '#5EEAD4',
  signalOnDeep: '#FB923C',
  chartBar: '#8FBFB6',
  chartToday: '#EA580C',
  ctaOnDeepBg: '#F97316',
  ctaOnDeepText: '#1C1917',
  error: '#F87171',
  inputBorder: '#6B807B',
  inputBorderSoft: '#3A4D49',
  focusRing: '#5EEAD4',
}

/** The custom property a token lives in: `action` → `--landing-action`. */
export function tokenVar(name: keyof typeof SIGNAL): string {
  return `--landing-${name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`
}

/** A token as a CSS value that follows the active theme, for inline styles. */
export function themed(name: keyof typeof SIGNAL): string {
  return `var(${tokenVar(name)})`
}
