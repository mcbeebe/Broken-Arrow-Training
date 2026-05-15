/**
 * Small helpers for surfacing the home-location forecast in the UI.
 *
 * The weather block on the CoachSnapshot is already classified into
 * normal / warn / swap severity. These helpers turn a single forecast
 * day OR a single forecast hour into the icon, accent class, and
 * compact label the DayCard chip and Summary weather strip render.
 */

import type { CoachWeatherBlock } from '../types'

export type ForecastDay = NonNullable<CoachWeatherBlock>['daily'][number]
export type ForecastHour = NonNullable<NonNullable<CoachWeatherBlock>['hourly']>[number]

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
 * Look up the hourly forecast closest to a target hour on a given
 * date. Used when the athlete has a preferred training time — the
 * chip then reflects what the weather is AT that hour, not the daily
 * high. Returns null outside the ~7-day hourly horizon.
 */
export function forecastForHour(
  weather: CoachWeatherBlock | null | undefined,
  isoDate: string | null | undefined,
  hour: number,
): ForecastHour | null {
  if (!weather || !isoDate || !weather.hourly) return null
  let best: ForecastHour | null = null
  let bestDistance = Infinity
  for (const h of weather.hourly) {
    if (h.date !== isoDate) continue
    const distance = Math.abs(h.hour - hour)
    if (distance < bestDistance) {
      bestDistance = distance
      best = h
    }
  }
  return best
}

/** Format hour-of-day as "6am" / "12pm" / "5pm" for chip labels. */
export function formatHourLabel(hour: number): string {
  if (hour === 0) return '12am'
  if (hour === 12) return '12pm'
  if (hour < 12) return `${hour}am`
  return `${hour - 12}pm`
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
  /** When the chip reflects a specific hour (vs daily aggregate), the
   *  hour-of-day label "6am" / "5pm" so the UI can show "🌅 6am ·
   *  55°" instead of just "55°". Absent for daily-aggregate chips. */
  hourLabel?: string
  /** True when the chip is sourced from per-hour data (athlete's
   *  preferred training time), false for daily aggregate. */
  isHourly: boolean
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
  return { icon, tempLabel, conditionsLabel, accent, warningLabel, isHourly: false }
}

/**
 * Same as buildWeatherChip but for a specific hour. Used when the
 * athlete has picked a preferred training time — the chip then shows
 * what the weather is at THAT hour ("🌅 8am · 64°"), and the WARN /
 * SWAP severity reflects the conditions during the planned workout,
 * not the daily peak.
 */
export function buildWeatherChipFromHour(
  forecast: ForecastHour | null,
): WeatherChip | null {
  if (!forecast) return null
  const base = describeWeatherCode(forecast.weatherCode)
  const icon = forecast.thunderRisk ? '⚡' : base.icon
  const conditionsLabel = forecast.thunderRisk ? 'Thunderstorm risk' : base.label
  const tempLabel = `${forecast.tempF}°`
  const accent: WeatherChip['accent'] = forecast.severity === 'swap'
    ? 'swap'
    : forecast.severity === 'warn'
      ? 'warn'
      : 'neutral'
  const warningLabel = (forecast.reasons || [])
    .map(r => r.charAt(0).toUpperCase() + r.slice(1))
    .join(' · ')
  return {
    icon,
    tempLabel,
    conditionsLabel,
    accent,
    warningLabel,
    hourLabel: formatHourLabel(forecast.hour),
    isHourly: true,
  }
}

/**
 * Convenience for callers that have a preferred hour — picks the
 * hourly chip when within the 7-day hourly horizon, falls back to the
 * daily aggregate when outside it. Returns null when neither has data
 * for the date.
 */
export function buildWeatherChipForDate(
  weather: CoachWeatherBlock | null | undefined,
  isoDate: string | null | undefined,
  preferredHour: number | null,
): WeatherChip | null {
  if (preferredHour !== null) {
    const hourly = forecastForHour(weather, isoDate, preferredHour)
    if (hourly) return buildWeatherChipFromHour(hourly)
  }
  const daily = forecastForDate(weather, isoDate)
  return buildWeatherChip(daily)
}
