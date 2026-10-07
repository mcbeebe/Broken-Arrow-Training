/**
 * The Signal palette, from docs/initiatives/003-landing-page/tokens.json (the
 * approved palette). tailwind.landing.config.js maps these to `landing-*`
 * classes; components use them directly only where a class can't express the
 * value (the readiness ring's gradient). A test keeps this in step with the
 * JSON, whose every text pair was contrast-checked.
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
