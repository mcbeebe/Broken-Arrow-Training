#!/usr/bin/env node
/**
 * fetch-terrain.mjs — bake a heightmap JSON for a course.
 *
 * Run on a machine with outbound network access to USGS 3DEP / OpenTopoData
 * (the CI/web sandbox has elevation APIs blocked). Output is committed to
 * `src/data/terrain/<courseId>.json` and picked up automatically by the
 * 3D renderer's registry.
 *
 * Usage:
 *   npm run fetch:terrain -- --course broken-arrow-18k-2026 \
 *                            --bbox 39.180,-120.255,39.215,-120.215 \
 *                            --grid 96
 *
 * Flags:
 *   --course   Course id (must match src/data/courses/<id>.ts).
 *   --bbox     "minLat,minLon,maxLat,maxLon" in WGS84.
 *              When omitted, the script reads the course's location and
 *              expands ±2.5km around it as a default extent.
 *   --grid     Samples per side. 96 is a good default — fine enough that
 *              KT-22 / Washeshu show up as distinct ridges, coarse enough
 *              the JSON stays under 200KB.
 *   --source   "opentopodata" (default) | "open-elevation".
 *   --out      Override the output path. Defaults to
 *              src/data/terrain/<courseId>.json.
 *
 * Network requirement: opentopodata.org is rate-limited to 1 req/s and
 * 100 locations per request. A 96×96 grid is 9,216 samples → ~92 requests
 * → ~90 seconds. The script paces itself accordingly.
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { argv, exit } from 'node:process'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')
const DEFAULT_GRID = 96
const METERS_TO_FEET = 3.28084
const REQUEST_CHUNK = 100
const PACE_MS = 1100

function parseArgs(args) {
  const out = {}
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]
    if (!flag.startsWith('--')) continue
    const key = flag.slice(2)
    const value = args[i + 1]
    if (!value || value.startsWith('--')) {
      out[key] = true
    } else {
      out[key] = value
      i++
    }
  }
  return out
}

async function loadCourseLocation(courseId) {
  const path = resolve(REPO_ROOT, 'src/data/courses', `${courseId}.ts`)
  if (!existsSync(path)) {
    throw new Error(`Course file not found: ${path}`)
  }
  const text = await import('node:fs/promises').then(fs =>
    fs.readFile(path, 'utf8'),
  )
  const lat = Number(text.match(/latitude:\s*([\-0-9.]+)/)?.[1])
  const lon = Number(text.match(/longitude:\s*([\-0-9.]+)/)?.[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(
      `Could not parse location.latitude/longitude from ${path}. Pass --bbox explicitly.`,
    )
  }
  return { latitude: lat, longitude: lon }
}

function expandBounds(center, radiusKm) {
  // 1° latitude ≈ 111 km; longitude scales by cos(lat).
  const latDelta = radiusKm / 111
  const lonDelta = radiusKm / (111 * Math.cos((center.latitude * Math.PI) / 180))
  return {
    minLatitude: center.latitude - latDelta,
    maxLatitude: center.latitude + latDelta,
    minLongitude: center.longitude - lonDelta,
    maxLongitude: center.longitude + lonDelta,
  }
}

function parseBbox(raw) {
  const parts = raw.split(',').map(Number)
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n))) {
    throw new Error(`--bbox must be "minLat,minLon,maxLat,maxLon"; got ${raw}`)
  }
  const [minLatitude, minLongitude, maxLatitude, maxLongitude] = parts
  return { minLatitude, minLongitude, maxLatitude, maxLongitude }
}

function gridCoordinates(bounds, n) {
  const coords = []
  for (let row = 0; row < n; row++) {
    const t = n === 1 ? 0 : row / (n - 1)
    const lat = bounds.minLatitude + t * (bounds.maxLatitude - bounds.minLatitude)
    for (let col = 0; col < n; col++) {
      const u = n === 1 ? 0 : col / (n - 1)
      const lon =
        bounds.minLongitude + u * (bounds.maxLongitude - bounds.minLongitude)
      coords.push([lat, lon])
    }
  }
  return coords
}

async function fetchOpenTopoData(coords) {
  const elevations = new Array(coords.length)
  for (let i = 0; i < coords.length; i += REQUEST_CHUNK) {
    const chunk = coords.slice(i, i + REQUEST_CHUNK)
    const locations = chunk.map(([lat, lon]) => `${lat},${lon}`).join('|')
    const url = `https://api.opentopodata.org/v1/ned10m?locations=${encodeURIComponent(locations)}`
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(
        `opentopodata returned ${res.status} for chunk starting at ${i}: ${await res.text()}`,
      )
    }
    const data = await res.json()
    if (!Array.isArray(data.results)) {
      throw new Error(`opentopodata response missing "results" array`)
    }
    data.results.forEach((r, k) => {
      elevations[i + k] = r.elevation
    })
    const done = Math.min(i + REQUEST_CHUNK, coords.length)
    process.stdout.write(`  fetched ${done}/${coords.length}\r`)
    if (i + REQUEST_CHUNK < coords.length) {
      await new Promise(r => setTimeout(r, PACE_MS))
    }
  }
  process.stdout.write('\n')
  return elevations
}

async function fetchOpenElevation(coords) {
  const url = 'https://api.open-elevation.com/api/v1/lookup'
  const elevations = new Array(coords.length)
  for (let i = 0; i < coords.length; i += REQUEST_CHUNK) {
    const chunk = coords.slice(i, i + REQUEST_CHUNK)
    const body = JSON.stringify({
      locations: chunk.map(([lat, lon]) => ({ latitude: lat, longitude: lon })),
    })
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
    if (!res.ok) {
      throw new Error(`open-elevation returned ${res.status}: ${await res.text()}`)
    }
    const data = await res.json()
    data.results.forEach((r, k) => {
      elevations[i + k] = r.elevation
    })
    process.stdout.write(`  fetched ${Math.min(i + REQUEST_CHUNK, coords.length)}/${coords.length}\r`)
  }
  process.stdout.write('\n')
  return elevations
}

function meanResolutionMeters(bounds, grid) {
  const latMeters = (bounds.maxLatitude - bounds.minLatitude) * 111000
  const meanLat = (bounds.minLatitude + bounds.maxLatitude) / 2
  const lonMeters =
    (bounds.maxLongitude - bounds.minLongitude) *
    111000 *
    Math.cos((meanLat * Math.PI) / 180)
  return (latMeters / (grid - 1) + lonMeters / (grid - 1)) / 2
}

async function main() {
  const args = parseArgs(argv.slice(2))
  const courseId = args.course
  if (!courseId) {
    console.error('Missing --course <courseId>')
    exit(2)
  }
  const grid = args.grid ? Number(args.grid) : DEFAULT_GRID
  if (!Number.isFinite(grid) || grid < 16 || grid > 256) {
    console.error(`--grid must be between 16 and 256; got ${args.grid}`)
    exit(2)
  }
  const source = args.source ?? 'opentopodata'

  const bounds = args.bbox
    ? parseBbox(args.bbox)
    : expandBounds(await loadCourseLocation(courseId), 2.5)

  console.log(
    `Baking ${grid}×${grid} heightmap for ${courseId} via ${source}...`,
  )
  console.log(
    `  bounds: ${bounds.minLatitude.toFixed(4)}/${bounds.minLongitude.toFixed(4)} → ${bounds.maxLatitude.toFixed(4)}/${bounds.maxLongitude.toFixed(4)}`,
  )

  const coords = gridCoordinates(bounds, grid)
  const meters =
    source === 'open-elevation'
      ? await fetchOpenElevation(coords)
      : await fetchOpenTopoData(coords)

  if (meters.some(v => v == null || !Number.isFinite(v))) {
    throw new Error('Heightmap contains null/NaN samples — refusing to write.')
  }

  const elevationsFt = meters.map(m => Math.round(m * METERS_TO_FEET))
  const minElevationFt = Math.min(...elevationsFt)
  const maxElevationFt = Math.max(...elevationsFt)

  const heightmap = {
    version: 1,
    courseId,
    bounds,
    width: grid,
    height: grid,
    elevationsFt,
    minElevationFt,
    maxElevationFt,
    source: {
      dataset:
        source === 'open-elevation' ? 'Open-Elevation SRTM' : 'USGS 3DEP NED10m',
      fetchedAt: new Date().toISOString(),
      resolutionMeters: Math.round(meanResolutionMeters(bounds, grid)),
    },
  }

  const outPath =
    args.out ?? resolve(REPO_ROOT, 'src/data/terrain', `${courseId}.json`)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(heightmap) + '\n')
  console.log(
    `Wrote ${outPath} (${(JSON.stringify(heightmap).length / 1024).toFixed(1)} KB, ${minElevationFt}–${maxElevationFt} ft).`,
  )
}

main().catch(err => {
  console.error(`fetch-terrain failed: ${err.message}`)
  exit(1)
})
