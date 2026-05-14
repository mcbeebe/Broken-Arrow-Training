import { useEffect, useState } from 'react'
import type { CoachWeatherBlock, RaceInfo } from '../types'
import type { AthleteHomeLocation } from './useAthleteLocation'
import {
  classifyDay,
  getDailyForecast,
  getTypicalClimate,
} from '../utils/weather'

/**
 * Sprint 5 — fetches the 14-day forecast at the athlete's training
 * location + the 10-year typical climate for race day + (when race is
 * within 14 days) a live forecast for the race location too. Returns a
 * CoachWeatherBlock that App.tsx attaches to the CoachSnapshot.
 *
 * Two locations, intentionally separate:
 * - Training location (`home`): drives daily WARN/SWAP behavior. The
 *   athlete trains here; weather here is what changes today's workout.
 * - Race location (`race.coordinates`): only used for the race-day
 *   surface (climatology + within-14d single-day forecast). The
 *   athlete might be flying in.
 *
 * When `home` is null we fall back to race coordinates so legacy
 * setups (no home configured yet) get the prior Sprint 5 behavior.
 */
export function useWeather(
  race: RaceInfo | undefined,
  home: AthleteHomeLocation | null,
): CoachWeatherBlock | null {
  const raceCoords = race?.coordinates
  const raceDate = race?.date
  // Training-location coords: prefer the explicitly configured home,
  // otherwise fall back to race coordinates (legacy behavior).
  const trainLat = home?.latitude ?? raceCoords?.latitude
  const trainLng = home?.longitude ?? raceCoords?.longitude
  const trainLabel = home?.label
    ?? raceCoords?.label
    ?? (typeof trainLat === 'number' && typeof trainLng === 'number'
        ? `${trainLat.toFixed(2)}, ${trainLng.toFixed(2)}`
        : '')
  const isHomeLocation = !!home
  const [block, setBlock] = useState<CoachWeatherBlock | null>(null)

  useEffect(() => {
    if (typeof trainLat !== 'number' || typeof trainLng !== 'number') {
      setBlock(null)
      return
    }
    let cancelled = false

    async function run() {
      const forecast = await getDailyForecast(trainLat!, trainLng!)
      if (cancelled || !forecast) return

      const dailyClassified = forecast.daily.map(d => {
        const { severity, reasons } = classifyDay(d)
        return {
          date: d.date,
          tempHighF: Math.round(d.tempHighF),
          tempLowF: Math.round(d.tempLowF),
          precipIn: Math.round(d.precipIn * 100) / 100,
          precipProbPct: d.precipProbPct,
          windMaxMph: Math.round(d.windMaxMph),
          windGustMaxMph: d.windGustMaxMph !== undefined ? Math.round(d.windGustMaxMph) : undefined,
          weatherCode: d.weatherCode,
          thunderRisk: d.thunderRisk,
          severity,
          reasons,
        }
      })

      const out: CoachWeatherBlock = {
        label: trainLabel,
        latitude: trainLat!,
        longitude: trainLng!,
        fetchedAt: forecast.fetchedAt,
        isHomeLocation,
        daily: dailyClassified,
      }

      // Race-day surface. Requires a parseable race date AND race
      // coordinates (if they're missing we can't fetch climate /
      // race-location forecast).
      const isoRaceDate = toIsoDate(raceDate)
      if (isoRaceDate && raceCoords) {
        const daysUntilRace = (new Date(isoRaceDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        const inForecastWindow = daysUntilRace >= -1 && daysUntilRace <= 14
        const raceDay: NonNullable<CoachWeatherBlock['raceDay']> = {
          date: isoRaceDate,
          label: raceCoords.label,
          inForecastWindow,
        }
        // 1. Climatology — only spend a quota slot when the race is
        //    more than 7 days out (inside that window the live forecast
        //    is more useful than a 10-year average).
        if (daysUntilRace > 7) {
          const climate = await getTypicalClimate(
            raceCoords.latitude,
            raceCoords.longitude,
            isoRaceDate,
          )
          if (cancelled) return
          if (climate) {
            raceDay.typical = {
              meanHighF: climate.meanHighF,
              meanLowF: climate.meanLowF,
              meanPrecipIn: climate.meanPrecipIn,
              precipDayFraction: climate.precipDayFraction,
              meanWindMph: climate.meanWindMph,
              conditionsLabel: climate.conditionsLabel,
              yearsSampled: climate.yearsSampled,
            }
          }
        }
        // 2. Live race-location forecast, when within 14 days. Skipped
        //    when home == race (training daily already covers race
        //    location), to avoid burning a quota slot.
        const homeEqualsRace =
          typeof home?.latitude === 'number' &&
          Math.abs(home.latitude - raceCoords.latitude) < 0.01 &&
          Math.abs((home.longitude ?? 0) - raceCoords.longitude) < 0.01
        if (inForecastWindow && (!homeEqualsRace || !home)) {
          // When home is unset, the training daily IS the race forecast
          // (same coords); reuse it instead of fetching twice.
          if (!home) {
            const match = forecast.daily.find(d => d.date === isoRaceDate)
            if (match) {
              raceDay.forecast = {
                tempHighF: Math.round(match.tempHighF),
                tempLowF: Math.round(match.tempLowF),
                precipIn: Math.round(match.precipIn * 100) / 100,
                precipProbPct: match.precipProbPct,
                windMaxMph: Math.round(match.windMaxMph),
                weatherCode: match.weatherCode,
                thunderRisk: match.thunderRisk,
              }
            }
          } else {
            const raceForecast = await getDailyForecast(raceCoords.latitude, raceCoords.longitude)
            if (cancelled) return
            const match = raceForecast?.daily.find(d => d.date === isoRaceDate)
            if (match) {
              raceDay.forecast = {
                tempHighF: Math.round(match.tempHighF),
                tempLowF: Math.round(match.tempLowF),
                precipIn: Math.round(match.precipIn * 100) / 100,
                precipProbPct: match.precipProbPct,
                windMaxMph: Math.round(match.windMaxMph),
                weatherCode: match.weatherCode,
                thunderRisk: match.thunderRisk,
              }
            }
          }
        }
        out.raceDay = raceDay
      }

      if (!cancelled) setBlock(out)
    }

    run()

    // Refresh on focus + every 30 minutes (client cache makes re-runs cheap).
    function onFocus() { run() }
    window.addEventListener('focus', onFocus)
    const interval = window.setInterval(run, 30 * 60 * 1000)

    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
      window.clearInterval(interval)
    }
  // We pass coords + the lat/lng directly; including the entire `home`
  // object would re-run every time the wrapping memory re-renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainLat, trainLng, trainLabel, isHomeLocation, raceCoords?.latitude, raceCoords?.longitude, raceCoords?.label, raceDate, home?.latitude, home?.longitude])

  return block
}

/**
 * Parse the human race-date string ("Friday, June 19, 2026") into a
 * canonical YYYY-MM-DD. Returns null for unparseable input so the
 * caller can skip the climate call.
 */
export function toIsoDate(raw: string | undefined): string | null {
  if (!raw) return null
  // Strip the leading day-of-week if present so Date.parse can handle it.
  const cleaned = raw.replace(/^[A-Za-z]+,\s*/, '')
  const d = new Date(cleaned)
  if (Number.isNaN(d.getTime())) return null
  // Use local timezone components — race date is a calendar date, not
  // a timestamp; we want "June 19" regardless of UTC offset.
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
