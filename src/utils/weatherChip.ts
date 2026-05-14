/**
 * Small helpers for surfacing the home-location forecast in the UI.
 *
 * The weather block on the CoachSnapshot is already classified into
 * normal / warn / swap severity. These helpers turn a single forecast
 * day into the icon, accent class, and compact label the DayCard chip
 * and Summary weather strip render.
 */

import type { CoachWeatherBlock } from '../types'

export type ForecastDay = NonNullable<CoachWeatherBlock>['daily'][number]

/**
 * Look up the forecast entry for a given ISO date in the snapshot's
 * 14-day window. Returns null when the date is outside the forecast
 * horizon (most plan days will fall outside it past the ~2-week mark).
 */
export function forecastForDate(
  weather: CoachWeatherBlock | null | undefined,
  isoDate: string | null | undefined,
): ForecastDay | null {
  if (!weather || !isoDate) return null
  return weather.daily.find(d => d.date === isoDate) ?? null
}

/**
 * Coarse icon + a verb-free label for the forecast day. The icon is a
 * WMO-code mapping; the temp label is "72°" for the high.
 *
 * Returned `accent` matches the WARN/SWAP doctrine — UI components can
 * use it for chip backgrounds without re-classifying.
 */
export interface WeatherChip {
  icon: string
  tempLabel: string
  /** Short summary like "Heavy rain" / "Thunderstorm" for tooltips. */
  conditionsLabel: string
  /** Background severity for the chip. */
  accent: 'neutral' | 'warn' | 'swap'
  /** WARN-tier reasons concatenated, ready to render inline. Empty for
   *  normal days. */
  warningLabel: string
}

export function describeWeatherCode(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: '☀️', label: 'Clear' }
  if (code >= 1 && code <= 3) return { icon: '🌤', label: 'Partly cloudy' }
  if (code === 45 || code === 48) return { icon: '🌫', label: 'Fog' }
  if (code >= 51 && code <= 57) return { icon: '🌦', label: 'Drizzle' }
  if (code >= 61 && code <= 67) return { icon: '🌧', label: 'Rain' }
  if (code >= 71 && code <= 77) return { icon: '🌨', label: 'Snow' }
  if (code >= 80 && code <= 82) return { icon: '🌧', label: 'Rain showers' }
  if (code === 85 || code === 86) return { icon: '🌨', label: 'Snow showers' }
  if (code === 95 || code === 96 || code === 99) return { icon: '⛈', label: 'Thunderstorm' }
  return { icon: '☁️', label: 'Cloudy' }
}

export function buildWeatherChip(forecast: ForecastDay | null): WeatherChip | null {
  if (!forecast) return null
  // Thunder risk overrides the WMO-code icon — a code-71 (snow) day
  // with thunder embedded would otherwise lose the lightning cue.
  const base = describeWeatherCode(forecast.weatherCode)
  const icon = forecast.thunderRisk ? '⚡' : base.icon
  const conditionsLabel = forecast.thunderRisk ? 'Thunderstorm risk' : base.label
  const tempLabel = `${forecast.tempHighF}°`
  const accent: WeatherChip['accent'] = forecast.severity === 'swap'
    ? 'swap'
    : forecast.severity === 'warn'
      ? 'warn'
      : 'neutral'
  // The reasons list is rich enough on its own; capitalize the first
  // word of each reason for chip-ready display.
  const warningLabel = (forecast.reasons || [])
    .map(r => r.charAt(0).toUpperCase() + r.slice(1))
    .join(' · ')
  return { icon, tempLabel, conditionsLabel, accent, warningLabel }
}
