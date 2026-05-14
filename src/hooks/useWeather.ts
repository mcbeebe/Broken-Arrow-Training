import { useEffect, useState } from 'react'
import type { CoachWeatherBlock, RaceInfo } from '../types'
import {
  classifyDay,
  getDailyForecast,
  getTypicalClimate,
} from '../utils/weather'

/**
 * Sprint 5 — fetches the 14-day forecast at the race location (plus the
 * 10-year typical climate for race day) and surfaces it as a
 * CoachWeatherBlock that App.tsx attaches to the CoachSnapshot.
 *
 * Returns null when race coordinates aren't configured (legacy plans),
 * or while the first fetch is in flight — callers should treat null as
 * "no weather info available, no behavior change."
 *
 * Refreshes on focus and on a 30-minute interval (the Open-Meteo client
 * itself caches 6h in localStorage, so re-runs within the cache window
 * are essentially free).
 */
export function useWeather(race: RaceInfo | undefined): CoachWeatherBlock | null {
  const coords = race?.coordinates
  const raceDate = race?.date
  const [block, setBlock] = useState<CoachWeatherBlock | null>(null)

  useEffect(() => {
    if (!coords) {
      setBlock(null)
      return
    }
    let cancelled = false

    async function run() {
      const forecast = await getDailyForecast(coords!.latitude, coords!.longitude)
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
        label: coords!.label || `${coords!.latitude.toFixed(2)}, ${coords!.longitude.toFixed(2)}`,
        latitude: coords!.latitude,
        longitude: coords!.longitude,
        fetchedAt: forecast.fetchedAt,
        daily: dailyClassified,
      }

      // Race-day climatology when we have a parseable race date.
      const isoRaceDate = toIsoDate(raceDate)
      if (isoRaceDate) {
        const inForecastWindow = dailyClassified.some(d => d.date === isoRaceDate)
        const raceDay: CoachWeatherBlock['raceDay'] = {
          date: isoRaceDate,
          inForecastWindow,
        }
        // Only spend a quota slot on the archive call when the race is
        // more than 7 days out and not in the live forecast window.
        // Inside that window the live forecast supersedes the aggregate.
        const daysUntilRace = (new Date(isoRaceDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        if (!inForecastWindow && daysUntilRace > 7) {
          const climate = await getTypicalClimate(
            coords!.latitude,
            coords!.longitude,
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
  }, [coords, raceDate])

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
