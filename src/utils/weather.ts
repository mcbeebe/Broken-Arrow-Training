/**
 * Open-Meteo weather client.
 *
 * Client-side only — Open-Meteo's API is CORS-enabled and free, so we
 * call it directly from the browser rather than adding a Vercel
 * serverless function (we're at the Hobby tier's 12-function ceiling).
 * Results are cached in localStorage with appropriate TTLs.
 *
 * Two surfaces:
 * 1. `getDailyForecast` — next 14 days of daily weather for any lat/long.
 *    Cache TTL 6h.
 * 2. `getTypicalClimate` — 10-year archive mean for a specific
 *    month/day (race-day "what to expect" prediction). Cache TTL 30d.
 *
 * Used by useWeather (training-location warn/swap) and
 * RaceConditionsForecast (race-day historical + countdown forecast).
 */

import { isoFromLocalDate } from './planDates'
const FORECAST_API = 'https://api.open-meteo.com/v1/forecast'
const ARCHIVE_API = 'https://archive-api.open-meteo.com/v1/archive'
const GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search'

// v2 → bumped when hourly data was added to ForecastResult so stale
// pre-hourly entries are invalidated immediately rather than waiting
// out the 6h TTL with no hourly chip. Future schema changes that
// expect new fields on the cached result should bump this again.
const LS_FORECAST = 'ba_weather_forecast_v2:'
const LS_CLIMATE = 'ba_weather_climate_v1:'

const FORECAST_TTL_MS = 6 * 60 * 60 * 1000      // 6h
const CLIMATE_TTL_MS = 30 * 24 * 60 * 60 * 1000  // 30d

export interface DailyForecastEntry {
  /** ISO date (YYYY-MM-DD). */
  date: string
  tempHighF: number
  tempLowF: number
  /** Sum of precipitation in inches for the day. */
  precipIn: number
  /** Daily probability of precipitation (0-100). */
  precipProbPct: number
  windMaxMph: number
  windGustMaxMph?: number
  /** WMO weather code — see https://open-meteo.com/en/docs.
   *  0=clear, 1-3=cloudy, 45/48=fog, 51-67=rain, 71-77=snow,
   *  80-86=showers, 95-99=thunderstorm. */
  weatherCode: number
  /** Whether the daily summary suggests a thunderstorm. Computed from
   *  weatherCode 95/96/99 + precipProb >40%. */
  thunderRisk: boolean
}

/**
 * Hourly resolution for the next 7 days at the same location. Lets the
 * day-card chip show the forecast AT the athlete's training time rather
 * than the daily high — a 7am Lake Temescal loop sees Oakland's 55°F
 * morning, not the 77°F daily peak that hits at 4pm.
 */
export interface HourlyForecastEntry {
  /** ISO timestamp (YYYY-MM-DDTHH:00, local time at the forecast location). */
  time: string
  /** Calendar date portion of `time` — pre-extracted for fast lookup. */
  date: string
  /** Hour of day (0-23) at the forecast location. */
  hour: number
  tempF: number
  precipIn: number
  precipProbPct: number
  windMph: number
  weatherCode: number
  /** Inferred thunder risk for this hour (WMO 95/96/99 or high-precip
   *  shower). */
  thunderRisk: boolean
}

export interface ForecastResult {
  fetchedAt: number
  latitude: number
  longitude: number
  daily: DailyForecastEntry[]
  /** Hourly resolution for ~7 days. Open-Meteo's free tier returns 168
   *  hours by default with a 14-day daily call. Empty when the fetch
   *  failed to populate hourly data. */
  hourly: HourlyForecastEntry[]
}

export interface TypicalClimate {
  fetchedAt: number
  latitude: number
  longitude: number
  /** Month/day this aggregate is for (e.g. "06-19"). */
  monthDay: string
  /** Number of years included (typically 10). */
  yearsSampled: number
  meanHighF: number
  meanLowF: number
  meanPrecipIn: number
  /** Fraction of sampled days that had >0.05" precipitation. */
  precipDayFraction: number
  meanWindMph: number
  /** Coarse label that frames the climate at a glance. Derived from
   *  temp + precip means. */
  conditionsLabel: 'hot+dry' | 'hot+humid' | 'warm+dry' | 'warm+wet' | 'cool+wet' | 'cool+dry' | 'cold+wet' | 'cold+dry'
}

function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota */
  }
}

function cToF(c: number): number {
  return c * 9 / 5 + 32
}

function mmToIn(mm: number): number {
  return mm / 25.4
}

function kphToMph(k: number): number {
  return k * 0.621371
}

function isFresh(fetchedAt: number, ttlMs: number): boolean {
  return Date.now() - fetchedAt < ttlMs
}

function thunderRiskFromCode(code: number, precipProb: number): boolean {
  if (code === 95 || code === 96 || code === 99) return true
  // WMO 80-86 are showers; combined with high precip prob = elevated thunder risk
  if ((code >= 80 && code <= 86) && precipProb >= 60) return true
  return false
}

/**
 * Fetch a 14-day daily forecast for the given coordinates. Returns
 * cached result if a recent (<6h) one exists.
 */
export async function getDailyForecast(
  latitude: number,
  longitude: number,
  forceRefresh: boolean = false,
): Promise<ForecastResult | null> {
  const key = `${LS_FORECAST}${latitude.toFixed(3)}:${longitude.toFixed(3)}`
  if (!forceRefresh) {
    const cached = lsGet<ForecastResult>(key)
    // Treat results missing `hourly` (from a stale schema) as a miss so
    // we refetch a complete payload instead of falling back to daily-
    // aggregate chips for the whole TTL window.
    const isComplete = !!cached && Array.isArray(cached.hourly) && cached.hourly.length > 0
    if (cached && isComplete && isFresh(cached.fetchedAt, FORECAST_TTL_MS)) return cached
  }

  // We request hourly resolution alongside daily so the day-card chip
  // can show the forecast AT the athlete's training time. Open-Meteo's
  // free tier reliably returns 168h of hourly data with a 14-day daily
  // call — anything past day-7 is interpolated and we treat it as
  // less reliable in the UI.
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'precipitation_probability_max',
      'windspeed_10m_max',
      'windgusts_10m_max',
      'weathercode',
    ].join(','),
    hourly: [
      'temperature_2m',
      'precipitation',
      'precipitation_probability',
      'windspeed_10m',
      'weathercode',
    ].join(','),
    timezone: 'auto',
    forecast_days: '14',
  })

  try {
    const res = await fetch(`${FORECAST_API}?${params.toString()}`)
    if (!res.ok) return null
    const data = await res.json() as {
      daily?: {
        time?: string[]
        temperature_2m_max?: number[]
        temperature_2m_min?: number[]
        precipitation_sum?: number[]
        precipitation_probability_max?: number[]
        windspeed_10m_max?: number[]
        windgusts_10m_max?: number[]
        weathercode?: number[]
      }
      hourly?: {
        time?: string[]
        temperature_2m?: number[]
        precipitation?: number[]
        precipitation_probability?: number[]
        windspeed_10m?: number[]
        weathercode?: number[]
      }
    }
    const d = data.daily
    if (!d || !d.time) return null
    const daily: DailyForecastEntry[] = d.time.map((date, i) => {
      const code = d.weathercode?.[i] ?? 0
      const precipProb = d.precipitation_probability_max?.[i] ?? 0
      return {
        date,
        tempHighF: cToF(d.temperature_2m_max?.[i] ?? 0),
        tempLowF: cToF(d.temperature_2m_min?.[i] ?? 0),
        precipIn: mmToIn(d.precipitation_sum?.[i] ?? 0),
        precipProbPct: precipProb,
        windMaxMph: kphToMph(d.windspeed_10m_max?.[i] ?? 0),
        windGustMaxMph: d.windgusts_10m_max?.[i] !== undefined
          ? kphToMph(d.windgusts_10m_max[i])
          : undefined,
        weatherCode: code,
        thunderRisk: thunderRiskFromCode(code, precipProb),
      }
    })
    const h = data.hourly
    const hourly: HourlyForecastEntry[] = []
    if (h && h.time) {
      for (let i = 0; i < h.time.length; i++) {
        const t = h.time[i]
        // t = "2026-05-15T07:00" — slice the date and hour cheaply.
        const date = t.slice(0, 10)
        const hour = parseInt(t.slice(11, 13), 10)
        const code = h.weathercode?.[i] ?? 0
        const precipProb = h.precipitation_probability?.[i] ?? 0
        hourly.push({
          time: t,
          date,
          hour: Number.isFinite(hour) ? hour : 0,
          tempF: cToF(h.temperature_2m?.[i] ?? 0),
          precipIn: mmToIn(h.precipitation?.[i] ?? 0),
          precipProbPct: precipProb,
          windMph: kphToMph(h.windspeed_10m?.[i] ?? 0),
          weatherCode: code,
          thunderRisk: thunderRiskFromCode(code, precipProb),
        })
      }
    }
    const result: ForecastResult = {
      fetchedAt: Date.now(),
      latitude,
      longitude,
      daily,
      hourly,
    }
    lsSet(key, result)
    return result
  } catch {
    return null
  }
}

/**
 * Fetch the 10-year climate average for a specific month/day at the
 * given coordinates. Used to predict "typical" race-day conditions
 * months out. Cached 30 days because climatology barely shifts on
 * that timescale.
 */
export async function getTypicalClimate(
  latitude: number,
  longitude: number,
  /** Date format YYYY-MM-DD; year is ignored, the same month/day is
   *  sampled across each of the past 10 years. */
  raceDate: string,
): Promise<TypicalClimate | null> {
  const m = raceDate.match(/^\d{4}-(\d{2})-(\d{2})$/)
  if (!m) return null
  const month = m[1]
  const day = m[2]
  const key = `${LS_CLIMATE}${latitude.toFixed(3)}:${longitude.toFixed(3)}:${month}-${day}`
  const cached = lsGet<TypicalClimate>(key)
  if (cached && isFresh(cached.fetchedAt, CLIMATE_TTL_MS)) return cached

  // Sample ±2 days around the target across the past 10 calendar years.
  // Open-Meteo's archive API accepts a date range; we make 10 calls
  // (one per year) to keep each response small and within the API's
  // free-tier sane defaults. Each year's call is a 5-day window so a
  // single rainy day on the target doesn't dominate the mean.
  const nowYear = new Date().getFullYear()
  const requestedYear = parseInt(raceDate.slice(0, 4), 10) || nowYear
  // Sample the 10 years strictly BEFORE the requested race year so we
  // never request data that hasn't happened yet (archive returns
  // nothing for future dates).
  const startYear = requestedYear - 10
  const endYear = requestedYear - 1
  const samples: Array<{
    high: number; low: number; precip: number; wind: number; rained: boolean
  }> = []

  for (let year = startYear; year <= endYear; year++) {
    const targetDate = new Date(year, parseInt(month, 10) - 1, parseInt(day, 10))
    const winStart = new Date(targetDate)
    winStart.setDate(winStart.getDate() - 2)
    const winEnd = new Date(targetDate)
    winEnd.setDate(winEnd.getDate() + 2)
    const fmt = (d: Date) => isoFromLocalDate(d)
    const params = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      start_date: fmt(winStart),
      end_date: fmt(winEnd),
      daily: [
        'temperature_2m_max',
        'temperature_2m_min',
        'precipitation_sum',
        'windspeed_10m_max',
      ].join(','),
      timezone: 'auto',
    })
    try {
      const res = await fetch(`${ARCHIVE_API}?${params.toString()}`)
      if (!res.ok) continue
      const data = await res.json() as {
        daily?: {
          temperature_2m_max?: number[]
          temperature_2m_min?: number[]
          precipitation_sum?: number[]
          windspeed_10m_max?: number[]
        }
      }
      const d = data.daily
      if (!d || !d.temperature_2m_max) continue
      for (let i = 0; i < d.temperature_2m_max.length; i++) {
        const high = cToF(d.temperature_2m_max[i] ?? 0)
        const low = cToF(d.temperature_2m_min?.[i] ?? 0)
        const precip = mmToIn(d.precipitation_sum?.[i] ?? 0)
        const wind = kphToMph(d.windspeed_10m_max?.[i] ?? 0)
        samples.push({ high, low, precip, wind, rained: precip > 0.05 })
      }
    } catch {
      // Skip this year on transient failure; we'll average across whatever did succeed.
    }
  }

  if (samples.length === 0) return null

  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
  const meanHighF = mean(samples.map(s => s.high))
  const meanLowF = mean(samples.map(s => s.low))
  const meanPrecipIn = mean(samples.map(s => s.precip))
  const precipDayFraction = samples.filter(s => s.rained).length / samples.length
  const meanWindMph = mean(samples.map(s => s.wind))

  // Coarse conditions label.
  let conditionsLabel: TypicalClimate['conditionsLabel']
  const hot = meanHighF >= 85
  const warm = meanHighF >= 70 && meanHighF < 85
  const cool = meanHighF >= 50 && meanHighF < 70
  const wet = precipDayFraction >= 0.30 || meanPrecipIn >= 0.10
  if (hot && wet) conditionsLabel = 'hot+humid'
  else if (hot) conditionsLabel = 'hot+dry'
  else if (warm && wet) conditionsLabel = 'warm+wet'
  else if (warm) conditionsLabel = 'warm+dry'
  else if (cool && wet) conditionsLabel = 'cool+wet'
  else if (cool) conditionsLabel = 'cool+dry'
  else if (wet) conditionsLabel = 'cold+wet'
  else conditionsLabel = 'cold+dry'

  const result: TypicalClimate = {
    fetchedAt: Date.now(),
    latitude,
    longitude,
    monthDay: `${month}-${day}`,
    yearsSampled: Math.min(10, Math.ceil(samples.length / 5)),
    meanHighF: Math.round(meanHighF),
    meanLowF: Math.round(meanLowF),
    meanPrecipIn: Math.round(meanPrecipIn * 100) / 100,
    precipDayFraction: Math.round(precipDayFraction * 100) / 100,
    meanWindMph: Math.round(meanWindMph),
    conditionsLabel,
  }
  lsSet(key, result)
  return result
}

// ─── Severity classification ──────────────────────────────────
//
// Two-tier ladder (user-confirmed in the Sprint 5 plan):
//   WARN  → coach mentions weather in the insight; day-card chip; plan stays.
//   SWAP  → coach posts a proposal block swapping the day to an indoor
//           equivalent; athlete taps Apply.

export type WeatherSeverity = 'normal' | 'warn' | 'swap'

export interface WeatherSeverityResult {
  severity: WeatherSeverity
  reasons: string[]
}

/**
 * Classify a single forecast day against the WARN/SWAP thresholds.
 * Returns 'normal' / 'warn' / 'swap' plus a list of human-readable
 * reason strings so the prompt (and any UI tooltip) can quote them.
 */
export function classifyDay(entry: DailyForecastEntry): WeatherSeverityResult {
  const swap: string[] = []
  const warn: string[] = []

  // Heat index proxy — use forecast high directly; the LLM has
  // humidity awareness from weatherCode and can refine. >100°F = swap,
  // >95°F = warn.
  if (entry.tempHighF > 100) swap.push(`heat index ${Math.round(entry.tempHighF)}°F`)
  else if (entry.tempHighF > 95) warn.push(`heat ${Math.round(entry.tempHighF)}°F high`)

  // Cold + windchill — Open-Meteo doesn't return windchill directly,
  // but a low-temp/high-wind combo is the proxy.
  const windchillProxy = entry.tempLowF - (entry.windMaxMph * 0.7)
  if (windchillProxy < 20) swap.push(`windchill ~${Math.round(windchillProxy)}°F`)

  // Wind — sustained.
  if (entry.windMaxMph > 35) swap.push(`wind ${Math.round(entry.windMaxMph)} mph`)
  else if (entry.windMaxMph > 25) warn.push(`wind ${Math.round(entry.windMaxMph)} mph`)

  // Precipitation depth (daily total).
  if (entry.precipIn > 1.5) swap.push(`heavy rain ${entry.precipIn.toFixed(1)}"`)
  else if (entry.precipIn > 0.4) warn.push(`rain ${entry.precipIn.toFixed(2)}"`)

  // Thunder risk (lightning strike probability proxy).
  if (entry.thunderRisk && entry.precipProbPct >= 50) {
    swap.push(`thunderstorm risk ${entry.precipProbPct}%`)
  } else if (entry.thunderRisk || entry.precipProbPct >= 40) {
    warn.push(`thunder/precip ${entry.precipProbPct}%`)
  }

  // Snow — WMO 71-77 + 85/86 are snow codes; combined with measurable
  // precip we flag as swap. 2"+ accumulation isn't directly returned,
  // but a high precip-sum on a snow code is the best proxy.
  const snowCode = (entry.weatherCode >= 71 && entry.weatherCode <= 77) ||
                   entry.weatherCode === 85 || entry.weatherCode === 86
  if (snowCode && entry.precipIn > 0.2) swap.push(`snow ${entry.precipIn.toFixed(2)}" eq`)
  else if (snowCode) warn.push('snow forecast')

  if (swap.length > 0) return { severity: 'swap', reasons: swap }
  if (warn.length > 0) return { severity: 'warn', reasons: warn }
  return { severity: 'normal', reasons: [] }
}

/**
 * Classify a single forecast HOUR against WARN/SWAP thresholds. Same
 * doctrine as classifyDay but adapted for instantaneous values:
 *
 * - Daily aggregates have "precip total" and "wind max"; hourly has
 *   raw precipitation depth in that hour and wind at that hour.
 * - The temp at the athlete's training hour is the actual temp they'll
 *   experience, so we apply the heat ladder directly.
 *
 * Thresholds intentionally a touch more lenient than the daily
 * version: a 7am Z2 run in 0.3" of rain is "WARN bring a jacket," not
 * "SWAP go indoors."
 */
export function classifyHour(entry: HourlyForecastEntry): WeatherSeverityResult {
  const swap: string[] = []
  const warn: string[] = []

  if (entry.tempF > 100) swap.push(`heat ${Math.round(entry.tempF)}°F`)
  else if (entry.tempF > 92) warn.push(`heat ${Math.round(entry.tempF)}°F`)

  if (entry.tempF < 15) swap.push(`cold ${Math.round(entry.tempF)}°F`)
  else if (entry.tempF < 28) warn.push(`cold ${Math.round(entry.tempF)}°F`)

  // Windchill proxy: temp - 0.7 * wind. Hourly wind is closer to what
  // the athlete actually experiences (vs. daily max which may peak at
  // 3pm).
  const windchillProxy = entry.tempF - (entry.windMph * 0.7)
  if (windchillProxy < 15) swap.push(`windchill ~${Math.round(windchillProxy)}°F`)

  if (entry.windMph > 30) swap.push(`wind ${Math.round(entry.windMph)} mph`)
  else if (entry.windMph > 20) warn.push(`wind ${Math.round(entry.windMph)} mph`)

  if (entry.precipIn > 0.4) swap.push(`heavy rain ${entry.precipIn.toFixed(2)}" this hr`)
  else if (entry.precipIn > 0.1) warn.push(`rain ${entry.precipIn.toFixed(2)}" this hr`)

  if (entry.thunderRisk && entry.precipProbPct >= 50) {
    swap.push(`thunderstorm risk ${entry.precipProbPct}%`)
  } else if (entry.thunderRisk || entry.precipProbPct >= 60) {
    warn.push(`thunder/precip ${entry.precipProbPct}%`)
  }

  const snowCode = (entry.weatherCode >= 71 && entry.weatherCode <= 77) ||
                   entry.weatherCode === 85 || entry.weatherCode === 86
  if (snowCode && entry.precipIn > 0.05) swap.push(`snow forecast`)
  else if (snowCode) warn.push('snow forecast')

  if (swap.length > 0) return { severity: 'swap', reasons: swap }
  if (warn.length > 0) return { severity: 'warn', reasons: warn }
  return { severity: 'normal', reasons: [] }
}

/**
 * Find the hourly entry closest to a target hour-of-day on a given
 * date. Returns null when no entry exists for that date (outside the
 * 7-day hourly horizon).
 */
export function findHourEntry(
  hourly: HourlyForecastEntry[] | undefined,
  date: string,
  hour: number,
): HourlyForecastEntry | null {
  if (!hourly) return null
  let best: HourlyForecastEntry | null = null
  let bestDistance = Infinity
  for (const h of hourly) {
    if (h.date !== date) continue
    const distance = Math.abs(h.hour - hour)
    if (distance < bestDistance) {
      bestDistance = distance
      best = h
    }
  }
  return best
}


// ─── Geocoding (athlete home location) ──────────────────────────
//
// Used by the Settings → Coach → "Where do you train?" surface to
// resolve a typed place name into coordinates. Open-Meteo's geocoding
// API is CORS-friendly and free — same posture as the forecast and
// archive endpoints.

export interface PlaceMatch {
  name: string
  admin1?: string        // state / province
  countryCode?: string
  country?: string
  latitude: number
  longitude: number
  elevation?: number     // meters
  /** Composite label for the picker: "Oakland, California, US". */
  label: string
}

/** Search for places matching a free-text query. Returns up to 5
 *  matches sorted by Open-Meteo's relevance ranking. */
export async function searchPlaces(query: string): Promise<PlaceMatch[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  const params = new URLSearchParams({
    name: trimmed,
    count: '5',
    language: 'en',
    format: 'json',
  })
  try {
    const res = await fetch(`${GEOCODING_API}?${params.toString()}`)
    if (!res.ok) return []
    const data = await res.json() as {
      results?: Array<{
        name?: string
        admin1?: string
        country?: string
        country_code?: string
        latitude?: number
        longitude?: number
        elevation?: number
      }>
    }
    const results = data.results || []
    return results
      .filter(r => typeof r.latitude === 'number' && typeof r.longitude === 'number')
      .map(r => {
        const parts = [r.name, r.admin1, r.country_code].filter(Boolean) as string[]
        return {
          name: r.name || '',
          admin1: r.admin1,
          country: r.country,
          countryCode: r.country_code,
          latitude: r.latitude!,
          longitude: r.longitude!,
          elevation: r.elevation,
          label: parts.join(', '),
        }
      })
  } catch {
    return []
  }
}
