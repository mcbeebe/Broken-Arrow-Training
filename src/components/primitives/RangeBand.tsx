/**
 * Styling presets for the "suggested range" overlay on top of time-series
 * charts (Strava's purple dotted band pattern). A number alone says nothing;
 * a number sitting above or below an expected band tells the user whether
 * they went too hard, not hard enough, or right where they should be.
 *
 * Recharts identifies chart children by component type, so a hand-rolled
 * wrapper around <ReferenceArea> wouldn't be recognized. We export the
 * styling props instead; consumers spread them onto a <ReferenceArea>:
 *
 *   import { ReferenceArea } from 'recharts'
 *   import { rangeBandStyle } from './primitives/RangeBand'
 *
 *   <ReferenceArea y1={120} y2={160} {...rangeBandStyle('suggested')} />
 */

export type RangeBandVariant = 'suggested' | 'safe' | 'risky'

interface RangeBandStyle {
  fill: string
  fillOpacity: number
  stroke: string
  strokeDasharray: string
  strokeOpacity: number
  ifOverflow: 'extendDomain' | 'hidden' | 'visible' | 'discard'
}

const STYLES: Record<RangeBandVariant, RangeBandStyle> = {
  suggested: {
    fill: '#A78BFA',
    fillOpacity: 0.12,
    stroke: '#7C3AED',
    strokeDasharray: '4 4',
    strokeOpacity: 0.55,
    ifOverflow: 'extendDomain',
  },
  safe: {
    fill: '#34D399',
    fillOpacity: 0.10,
    stroke: '#059669',
    strokeDasharray: '4 4',
    strokeOpacity: 0.5,
    ifOverflow: 'extendDomain',
  },
  risky: {
    fill: '#FB923C',
    fillOpacity: 0.10,
    stroke: '#EA580C',
    strokeDasharray: '4 4',
    strokeOpacity: 0.5,
    ifOverflow: 'extendDomain',
  },
}

export function rangeBandStyle(variant: RangeBandVariant = 'suggested'): RangeBandStyle {
  return STYLES[variant]
}

/**
 * Returns a Recharts <Legend>-friendly entry describing the band so the
 * caller can render a tiny key beside the chart ("- - Suggested Range").
 */
export function rangeBandLegendEntry(variant: RangeBandVariant = 'suggested', label = 'Suggested range') {
  const s = STYLES[variant]
  return { value: label, type: 'line' as const, color: s.stroke }
}
