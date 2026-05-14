import { useEffect, useState } from 'react'
import type { RaceInfo } from '../types'
import { getDailyForecast, getTypicalClimate, type DailyForecastEntry, type TypicalClimate } from '../utils/weather'
import { toIsoDate } from '../hooks/useWeather'

interface Props {
  race: RaceInfo
}

/**
 * "What race day usually looks like" + "what the forecast says" surface.
 *
 * Sprint 5 — appears in the Race tab when race coordinates are configured.
 * Two cards stacked:
 *   1. T-14+ days: shows the 10-year typical climate ("typically 72°F,
 *      low wind, dry") so the athlete plans gear and pacing strategy.
 *   2. T-≤14 days: the live forecast for race day (and the 6 days
 *      before, useful for taper/travel planning).
 *
 * Both cards are read-only and gracefully no-op when the network or the
 * Open-Meteo client returns nothing.
 */
export default function RaceConditionsForecast({ race }: Props) {
  const coords = race.coordinates
  const raceIsoDate = toIsoDate(race.date)
  const [typical, setTypical] = useState<TypicalClimate | null>(null)
  const [forecastDay, setForecastDay] = useState<DailyForecastEntry | null>(null)
  const [forecastLeadup, setForecastLeadup] = useState<DailyForecastEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (!coords || !raceIsoDate) {
      setLoading(false)
      return
    }
    setLoading(true)
    ;(async () => {
      // Always try to load the 10-year typical climate — useful at any
      // distance from the race for setting gear / pacing expectations.
      const climate = await getTypicalClimate(coords.latitude, coords.longitude, raceIsoDate)
      if (!cancelled) setTypical(climate)

      // If we're within 14 days of race day, load the live forecast too.
      const daysUntil = (new Date(raceIsoDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
      if (daysUntil <= 14 && daysUntil >= -1) {
        const forecast = await getDailyForecast(coords.latitude, coords.longitude)
        if (!cancelled && forecast) {
          const matchingDay = forecast.daily.find(d => d.date === raceIsoDate) ?? null
          setForecastDay(matchingDay)
          // Up to 6 days of lead-up so the athlete can plan travel/taper.
          const leadup = forecast.daily.filter(d => {
            const t = new Date(d.date).getTime()
            const r = new Date(raceIsoDate).getTime()
            return t < r && (r - t) <= 6 * 24 * 60 * 60 * 1000
          })
          setForecastLeadup(leadup)
        }
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [coords, raceIsoDate])

  if (!coords) return null

  const locationLabel = coords.label || 'race location'
  const daysUntil = raceIsoDate
    ? Math.round((new Date(raceIsoDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3">
      <div>
        <h3 className="font-semibold text-base text-slate-800">Race-day conditions</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          {locationLabel}
          {daysUntil !== null && daysUntil > 0 && ` · T-${daysUntil} days`}
          {daysUntil !== null && daysUntil <= 0 && ` · race day or past`}
        </p>
      </div>

      {loading && <p className="text-sm italic text-slate-400">Checking the forecast…</p>}

      {!loading && forecastDay && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Live forecast</p>
          <p className="text-2xl font-bold text-slate-800">
            {Math.round(forecastDay.tempHighF)}°F
            <span className="text-base font-medium text-slate-500"> / {Math.round(forecastDay.tempLowF)}°F low</span>
          </p>
          <p className="text-sm text-slate-600">
            {describeCode(forecastDay.weatherCode)} · {forecastDay.precipProbPct}% precip · wind {Math.round(forecastDay.windMaxMph)} mph
          </p>
          {forecastDay.thunderRisk && (
            <p className="text-xs font-semibold text-amber-700 bg-amber-100 inline-block px-2 py-0.5 rounded">⚡ Thunderstorm risk</p>
          )}
        </div>
      )}

      {!loading && !forecastDay && typical && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wider text-teal-700">
            Typical for this date (10-year average)
          </p>
          <p className="text-2xl font-bold text-slate-800">
            {typical.meanHighF}°F
            <span className="text-base font-medium text-slate-500"> / {typical.meanLowF}°F low</span>
          </p>
          <p className="text-sm text-slate-600">
            {labelToProse(typical.conditionsLabel)} · {Math.round(typical.precipDayFraction * 100)}% chance of measurable rain · wind {typical.meanWindMph} mph
          </p>
          <p className="text-xs italic text-slate-500">
            Plan kit & pacing for these conditions. Live forecast unlocks at T-14 days.
          </p>
        </div>
      )}

      {!loading && forecastLeadup.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Lead-up days</p>
          <div className="grid grid-cols-3 gap-1.5">
            {forecastLeadup.map(d => (
              <div key={d.date} className="rounded border border-slate-200 px-2 py-1.5 text-center">
                <p className="text-[10px] text-slate-500 uppercase">{new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' })}</p>
                <p className="text-sm font-semibold text-slate-800">{Math.round(d.tempHighF)}°</p>
                <p className="text-[10px] text-slate-500">{d.precipProbPct}% • {Math.round(d.windMaxMph)}mph</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !forecastDay && !typical && (
        <p className="text-sm italic text-slate-400">Couldn't reach the forecast service.</p>
      )}
    </div>
  )
}

/** WMO weather code → short prose description. */
function describeCode(code: number): string {
  if (code === 0) return 'Clear'
  if (code >= 1 && code <= 3) return 'Partly cloudy'
  if (code === 45 || code === 48) return 'Fog'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if (code >= 61 && code <= 67) return 'Rain'
  if (code >= 71 && code <= 77) return 'Snow'
  if (code >= 80 && code <= 82) return 'Rain showers'
  if (code === 85 || code === 86) return 'Snow showers'
  if (code === 95 || code === 96 || code === 99) return 'Thunderstorm'
  return 'Mixed conditions'
}

function labelToProse(label: TypicalClimate['conditionsLabel']): string {
  switch (label) {
    case 'hot+dry': return 'Hot and dry'
    case 'hot+humid': return 'Hot and humid'
    case 'warm+dry': return 'Warm and dry'
    case 'warm+wet': return 'Warm with showers'
    case 'cool+dry': return 'Cool and dry'
    case 'cool+wet': return 'Cool with rain'
    case 'cold+dry': return 'Cold and dry'
    case 'cold+wet': return 'Cold with rain/snow'
  }
}
