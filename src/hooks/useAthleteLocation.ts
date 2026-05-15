import { useCallback, useEffect, useState } from 'react'

/**
 * Athlete home (training) location.
 *
 * Drives the day-to-day forecast in `useWeather` — what does *today's*
 * easy run look like at the place the athlete actually trains, vs. the
 * race destination. Stored in localStorage per-athlete; when unset,
 * `useWeather` falls back to the race coordinates (legacy behavior).
 */

export interface AthleteHomeLocation {
  latitude: number
  longitude: number
  /** Composite label for display ("Oakland, California, US"). */
  label: string
  /** Approximate elevation in meters; nice-to-have for prompt context
   *  ("you live near sea level, race is at 6,200 ft"). */
  elevationMeters?: number
  /** Timestamp the athlete saved this location. Just for transparency
   *  in the panel; not used in any logic. */
  setAt: number
  /** Source: 'browser' = HTML5 geolocation, 'search' = picked from
   *  geocoding results. Used for telemetry / UI hints. */
  source: 'browser' | 'search'
}

const LS_PREFIX = 'ba_athlete_home_v1:'

function lsKey(athleteId: string): string {
  return `${LS_PREFIX}${athleteId}`
}

function read(athleteId: string): AthleteHomeLocation | null {
  try {
    const raw = localStorage.getItem(lsKey(athleteId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as AthleteHomeLocation
    if (typeof parsed.latitude !== 'number' || typeof parsed.longitude !== 'number') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function write(athleteId: string, loc: AthleteHomeLocation | null) {
  try {
    if (loc === null) {
      localStorage.removeItem(lsKey(athleteId))
    } else {
      localStorage.setItem(lsKey(athleteId), JSON.stringify(loc))
    }
  } catch {
    /* quota */
  }
}

export interface UseAthleteLocationReturn {
  location: AthleteHomeLocation | null
  /** True while a `useBrowserLocation` call is in flight. */
  detecting: boolean
  detectError: string | null
  save: (loc: Omit<AthleteHomeLocation, 'setAt'>) => void
  clear: () => void
  /** Request the browser's HTML5 geolocation (with user permission)
   *  and save the result. Updates `detecting` while in flight and
   *  populates `detectError` on failure. */
  useBrowserLocation: () => Promise<void>
}

export function useAthleteLocation(athleteId: string): UseAthleteLocationReturn {
  const [location, setLocation] = useState<AthleteHomeLocation | null>(() => read(athleteId))
  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState<string | null>(null)

  // Re-read when athleteId changes (athlete switch).
  useEffect(() => {
    setLocation(read(athleteId))
    setDetectError(null)
  }, [athleteId])

  const save = useCallback((loc: Omit<AthleteHomeLocation, 'setAt'>) => {
    const next: AthleteHomeLocation = { ...loc, setAt: Date.now() }
    write(athleteId, next)
    setLocation(next)
    setDetectError(null)
  }, [athleteId])

  const clear = useCallback(() => {
    write(athleteId, null)
    setLocation(null)
    setDetectError(null)
  }, [athleteId])

  const useBrowserLocation = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setDetectError("This browser doesn't support location services.")
      return
    }
    setDetecting(true)
    setDetectError(null)
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          maximumAge: 5 * 60 * 1000,  // accept up to 5 min stale fix
          timeout: 15_000,
        })
      })
      // Round to 2 decimals (~1 km precision) so the forecast cache key
      // stays stable across re-fetches and we don't leak precise
      // coordinates into localStorage.
      const lat = Math.round(pos.coords.latitude * 100) / 100
      const lng = Math.round(pos.coords.longitude * 100) / 100
      // Reverse-geocode for a friendly label. Open-Meteo's free
      // geocoding API doesn't expose a reverse endpoint, so we use
      // OpenStreetMap's Nominatim — CORS-friendly, free, no auth, with
      // a 1-req/sec polite-use rate limit (we only hit it on explicit
      // "Use my current location" taps so the cap is fine).
      let label = `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`
        const reverseRes = await fetch(url, {
          headers: { Accept: 'application/json' },
        })
        if (reverseRes.ok) {
          const json = await reverseRes.json() as {
            address?: {
              city?: string; town?: string; village?: string; suburb?: string;
              state?: string; country_code?: string
            }
            display_name?: string
          }
          const a = json.address || {}
          // City > town > village > suburb is Nominatim's canonical
          // priority for the "where am I" answer.
          const place = a.city || a.town || a.village || a.suburb
          const parts = [
            place,
            a.state,
            a.country_code ? a.country_code.toUpperCase() : undefined,
          ].filter(Boolean) as string[]
          if (parts.length) {
            label = parts.join(', ')
          } else if (json.display_name) {
            // Fallback: first comma-segment of Nominatim's display name.
            label = json.display_name.split(',')[0].trim()
          }
        }
      } catch {
        /* keep the coord fallback */
      }
      const next: AthleteHomeLocation = {
        latitude: lat,
        longitude: lng,
        label,
        elevationMeters: pos.coords.altitude !== null && pos.coords.altitude !== undefined
          ? Math.round(pos.coords.altitude)
          : undefined,
        setAt: Date.now(),
        source: 'browser',
      }
      write(athleteId, next)
      setLocation(next)
    } catch (e) {
      const err = e as GeolocationPositionError | Error
      let msg = 'Could not get your location.'
      if ('code' in err) {
        if (err.code === 1) msg = 'Location permission denied. Enable it in browser settings, or use the search field instead.'
        else if (err.code === 2) msg = 'Location unavailable. Use the search field instead.'
        else if (err.code === 3) msg = 'Location request timed out. Try again, or use the search field.'
      }
      setDetectError(msg)
    } finally {
      setDetecting(false)
    }
  }, [athleteId])

  return { location, detecting, detectError, save, clear, useBrowserLocation }
}
