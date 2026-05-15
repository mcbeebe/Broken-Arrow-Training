import { useEffect, useRef, useState } from 'react'
import type { AthleteHomeLocation } from '../hooks/useAthleteLocation'
import { searchPlaces, type PlaceMatch } from '../utils/weather'

interface Props {
  location: AthleteHomeLocation | null
  detecting: boolean
  detectError: string | null
  /** Fallback label to show when home is unset (typically the race
   *  location — "Day-to-day forecasts use {raceLabel} until you tell us
   *  where you train"). */
  raceLabel?: string
  onSave: (loc: Omit<AthleteHomeLocation, 'setAt'>) => void
  onClear: () => void
  onUseBrowser: () => Promise<void>
}

/**
 * "Where do you train?" — Settings → Coach surface for the athlete
 * home location.
 *
 * Lives below the persona editor and About Me. Three ways to set it:
 * 1. Tap "Use my current location" → HTML5 geolocation, reverse-
 *    geocoded for a friendly label.
 * 2. Type a place name → calls Open-Meteo's free geocoding API,
 *    shows up to 5 matches, athlete picks one.
 * 3. Already set → shows current label + lat/long with a Clear button.
 *
 * When the home location differs from the race location, the day-to-
 * day forecast in the CoachSnapshot uses HOME coords; race-day
 * climatology + within-14d forecasts use RACE coords. The coach is
 * told this explicitly so it doesn't conflate training weather with
 * race weather.
 */
export default function AthleteHomeLocation({
  location,
  detecting,
  detectError,
  raceLabel,
  onSave,
  onClear,
  onUseBrowser,
}: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceMatch[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchTimer = useRef<number | null>(null)
  const lastQueryRef = useRef('')

  // Debounce the geocoding call so we don't hammer Open-Meteo on every
  // keystroke. 300 ms is the sweet spot for "felt instant" — long
  // enough that "Oakland" doesn't fire 7 separate queries.
  useEffect(() => {
    if (searchTimer.current !== null) {
      window.clearTimeout(searchTimer.current)
    }
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setSearching(false)
      setSearchError(null)
      return
    }
    searchTimer.current = window.setTimeout(async () => {
      setSearching(true)
      setSearchError(null)
      lastQueryRef.current = trimmed
      const matches = await searchPlaces(trimmed)
      // Discard stale results if the user kept typing.
      if (lastQueryRef.current !== trimmed) return
      setResults(matches)
      setSearching(false)
      if (matches.length === 0) setSearchError('No matches. Try a city + state.')
    }, 300)
    return () => {
      if (searchTimer.current !== null) window.clearTimeout(searchTimer.current)
    }
  }, [query])

  function handlePick(match: PlaceMatch) {
    onSave({
      latitude: match.latitude,
      longitude: match.longitude,
      label: match.label,
      elevationMeters: match.elevation,
      source: 'search',
    })
    setQuery('')
    setResults([])
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <span aria-hidden>📍</span> Where do you train?
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
          Day-to-day forecasts use this location. Race-day weather stays
          tied to your race destination.
        </p>
      </div>

      {location ? (() => {
        // When reverse-geocoding failed and the label is "37.83°, -122.26°",
        // the coord pair in the metadata line is redundant. Skip it; the
        // label itself already conveys the location.
        const labelIsCoords = /^-?\d+(\.\d+)?°,\s*-?\d+(\.\d+)?°$/.test(location.label.trim())
        const metaParts: string[] = []
        if (!labelIsCoords) {
          metaParts.push(`${location.latitude.toFixed(2)}°, ${location.longitude.toFixed(2)}°`)
        }
        if (location.elevationMeters !== undefined) {
          metaParts.push(`${Math.round(location.elevationMeters)} m`)
        }
        metaParts.push(location.source === 'browser' ? 'from browser' : 'searched')
        return (
          <div className="rounded-lg border border-teal-200 dark:border-teal-900 bg-teal-50 dark:bg-teal-950 px-3 py-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-teal-800 dark:text-teal-200 truncate">
                {location.label}
              </p>
              <p className="text-[10px] text-teal-600 dark:text-teal-400 mt-0.5">
                {metaParts.join(' · ')}
              </p>
            </div>
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-medium text-teal-700 dark:text-teal-300 hover:text-teal-900 dark:hover:text-teal-100 shrink-0"
            >
              Clear
            </button>
          </div>
        )
      })() : (
        raceLabel && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-3 py-2">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              Not set — using race location <span className="font-medium text-slate-700 dark:text-slate-300">{raceLabel}</span> for daily forecasts.
            </p>
          </div>
        )
      )}

      <div className="space-y-2">
        <button
          type="button"
          onClick={onUseBrowser}
          disabled={detecting}
          className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg bg-teal-100 text-teal-800 hover:bg-teal-200 dark:bg-teal-900 dark:text-teal-100 dark:hover:bg-teal-800 disabled:opacity-60 transition-colors"
        >
          {detecting ? (
            <>
              <span className="inline-block w-3 h-3 rounded-full border-2 border-teal-700 border-t-transparent animate-spin" />
              Detecting…
            </>
          ) : (
            <>📡 {location ? 'Update' : 'Use'} my current location</>
          )}
        </button>
        {detectError && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">{detectError}</p>
        )}

        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Or search: 'Oakland, CA'"
            className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-400"
          />
          {searching && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 inline-block w-3 h-3 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
          )}
        </div>
        {results.length > 0 && (
          <ul className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 max-h-44 overflow-y-auto">
            {results.map((m, i) => (
              <li key={`${m.latitude}-${m.longitude}-${i}`}>
                <button
                  type="button"
                  onClick={() => handlePick(m)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <p className="text-sm text-slate-800 dark:text-slate-100">{m.label}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {m.latitude.toFixed(2)}°, {m.longitude.toFixed(2)}°
                    {m.elevation !== undefined && ` · ${Math.round(m.elevation)} m`}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
        {searchError && results.length === 0 && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400">{searchError}</p>
        )}
      </div>
    </div>
  )
}
