import { useMemo } from 'react'

interface RouteMapProps {
  latlng: [number, number][]
  altitude?: number[]
}

/**
 * Lightweight SVG-based route map. Renders the GPS track as a polyline
 * with the app's styling — no tile layer, no map library. Good enough
 * to see the shape of the route at a glance.
 */
export default function RouteMap({ latlng, altitude }: RouteMapProps) {
  const { path, bounds, startPoint, endPoint, highElevPoint } = useMemo(() => {
    if (latlng.length < 2) {
      return { path: '', bounds: null, startPoint: null, endPoint: null, highElevPoint: null }
    }

    const lats = latlng.map(([lat]) => lat)
    const lngs = latlng.map(([, lng]) => lng)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)

    // Add 5% padding
    const latPad = (maxLat - minLat) * 0.05 || 0.001
    const lngPad = (maxLng - minLng) * 0.05 || 0.001

    const W = 400
    const H = 220
    const mapLat = (lat: number) => H - ((lat - (minLat - latPad)) / ((maxLat + latPad) - (minLat - latPad))) * H
    const mapLng = (lng: number) => ((lng - (minLng - lngPad)) / ((maxLng + lngPad) - (minLng - lngPad))) * W

    // Downsample to max ~400 points for perf
    const step = Math.max(1, Math.floor(latlng.length / 400))
    const pts = latlng.filter((_, i) => i % step === 0 || i === latlng.length - 1)

    const path = pts.map(([lat, lng], i) => {
      const x = mapLng(lng).toFixed(2)
      const y = mapLat(lat).toFixed(2)
      return `${i === 0 ? 'M' : 'L'}${x},${y}`
    }).join(' ')

    const startPoint = { x: mapLng(latlng[0][1]), y: mapLat(latlng[0][0]) }
    const endPoint = { x: mapLng(latlng[latlng.length - 1][1]), y: mapLat(latlng[latlng.length - 1][0]) }

    let highElevPoint: { x: number; y: number; elev: number } | null = null
    if (altitude && altitude.length === latlng.length) {
      let maxIdx = 0
      for (let i = 1; i < altitude.length; i++) {
        if (altitude[i] > altitude[maxIdx]) maxIdx = i
      }
      highElevPoint = {
        x: mapLng(latlng[maxIdx][1]),
        y: mapLat(latlng[maxIdx][0]),
        elev: Math.round(altitude[maxIdx] * 3.28084),
      }
    }

    return {
      path,
      bounds: { W, H },
      startPoint,
      endPoint,
      highElevPoint,
    }
  }, [latlng, altitude])

  if (!bounds || !path) {
    return null
  }

  // Compute total distance for display
  const totalMiles = useMemo(() => {
    if (latlng.length < 2) return 0
    let meters = 0
    for (let i = 1; i < latlng.length; i++) {
      const [lat1, lng1] = latlng[i - 1]
      const [lat2, lng2] = latlng[i]
      const dLat = (lat2 - lat1) * Math.PI / 180
      const dLng = (lng2 - lng1) * Math.PI / 180
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2
      const d = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 6371000
      meters += d
    }
    return meters / 1609.344
  }, [latlng])

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-100 dark:border-slate-700">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Route</p>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">
          {totalMiles.toFixed(1)} mi
        </span>
      </div>
      <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-2">
        <svg
          viewBox={`0 0 ${bounds.W} ${bounds.H}`}
          className="w-full h-auto"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Glow/halo behind route for visibility */}
          <path
            d={path}
            stroke="#0d9488"
            strokeWidth="5"
            strokeOpacity="0.2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Main route line */}
          <path
            d={path}
            stroke="#0d9488"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Start marker (green) */}
          {startPoint && (
            <>
              <circle cx={startPoint.x} cy={startPoint.y} r="6" fill="#22c55e" stroke="white" strokeWidth="2" />
              <text x={startPoint.x} y={startPoint.y + 3} textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">S</text>
            </>
          )}
          {/* End marker (red flag) */}
          {endPoint && (
            <>
              <circle cx={endPoint.x} cy={endPoint.y} r="6" fill="#ef4444" stroke="white" strokeWidth="2" />
              <text x={endPoint.x} y={endPoint.y + 3} textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">F</text>
            </>
          )}
          {/* High elevation marker (orange triangle) */}
          {highElevPoint && (
            <g>
              <polygon
                points={`${highElevPoint.x},${highElevPoint.y - 7} ${highElevPoint.x - 6},${highElevPoint.y + 3} ${highElevPoint.x + 6},${highElevPoint.y + 3}`}
                fill="#f59e0b"
                stroke="white"
                strokeWidth="1.5"
              />
              <text
                x={highElevPoint.x}
                y={highElevPoint.y - 10}
                textAnchor="middle"
                fontSize="9"
                fill="#b45309"
                fontWeight="bold"
              >
                {highElevPoint.elev}'
              </text>
            </g>
          )}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2">
        <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="w-2 h-2 rounded-full bg-green-500" /> Start
        </span>
        <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="w-2 h-2 rounded-full bg-red-500" /> Finish
        </span>
        {highElevPoint && (
          <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
            <span className="w-0 h-0" style={{ borderLeft: '3px solid transparent', borderRight: '3px solid transparent', borderBottom: '5px solid #f59e0b' }} />
            High point
          </span>
        )}
      </div>
    </div>
  )
}
