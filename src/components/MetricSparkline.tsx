import { sparkGeometry } from '../utils/metricTrend'

interface Props {
  /** Daily values, oldest first. */
  values: number[]
  /** Line and end-dot color (a hex — it's an SVG stroke). */
  color: string
  /** Screen-reader description, e.g. "Fitness, last 14 days: 73.3 to 75.1". */
  label: string
  /** A dashed reference line at this value (Recovery Balance's zero). */
  baseline?: number
  /** A shaded band between these values (Load Ratio's in-range zone). */
  band?: [number, number]
  /** Band fill (a hex). */
  bandColor?: string
  width?: number
  height?: number
}

/**
 * A tiny trend line for a stat tile: no axes, a dot on today, and an
 * optional zero line or in-range band so the shape reads against what
 * matters. Plain SVG — no chart library — so it costs nothing to mount
 * four of them. Renders nothing with fewer than two points.
 */
export default function MetricSparkline({ values, color, label, baseline, band, bandColor = '#16a34a', width = 140, height = 36 }: Props) {
  const include = [...(baseline !== undefined ? [baseline] : []), ...(band ?? [])]
  const g = sparkGeometry(values, { width, height, include })
  if (!g) return null
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      className="block mt-1"
      data-testid="metric-sparkline"
    >
      {band && (
        <rect
          data-testid="sparkline-band"
          x={0}
          y={Math.min(g.y(band[0]), g.y(band[1]))}
          width={width}
          height={Math.abs(g.y(band[0]) - g.y(band[1]))}
          fill={bandColor}
          fillOpacity={0.14}
        />
      )}
      {baseline !== undefined && (
        <line
          data-testid="sparkline-baseline"
          x1={0} x2={width} y1={g.y(baseline)} y2={g.y(baseline)}
          stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3"
        />
      )}
      <path d={g.d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={g.end.x} cy={g.end.y} r={3} fill={color} />
    </svg>
  )
}
