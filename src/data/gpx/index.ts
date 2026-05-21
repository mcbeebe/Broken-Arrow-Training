/**
 * GPX registry. Mirror of `src/data/terrain/` but for GPS traces.
 * Drop a course's official GPX into this directory as `<courseId>.gpx`
 * and the 3D renderer picks it up automatically — no schema or code
 * changes required.
 *
 * The file is fetched (not statically imported) so Vite serves it as
 * a raw asset rather than parsing it as JS. That keeps GPX parsing in
 * the runtime renderer chunk, off the main bundle.
 */

const GPX_URLS = import.meta.glob('./*.gpx', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

function keyFor(courseId: string): string {
  return `./${courseId}.gpx`
}

export function hasGpxAsset(courseId: string): boolean {
  return keyFor(courseId) in GPX_URLS
}

export function getGpxUrl(courseId: string): string | null {
  return GPX_URLS[keyFor(courseId)] ?? null
}

export interface GpxPoint {
  latitude: number
  longitude: number
  /** Elevation in meters as stored in the GPX. */
  elevationM: number
}

/**
 * Tiny GPX parser. Reads `<trkpt lat lon><ele>` tuples and ignores
 * everything else. GPX is XML so we use the browser's DOMParser —
 * no external dependency, no schema validation beyond "has trkpts".
 */
export async function loadGpx(courseId: string): Promise<GpxPoint[] | null> {
  const url = getGpxUrl(courseId)
  if (!url) return null
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch GPX for ${courseId}: ${res.status}`)
  }
  const xml = await res.text()
  return parseGpx(xml)
}

export function parseGpx(xml: string): GpxPoint[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const err = doc.querySelector('parsererror')
  if (err) {
    throw new Error(`Invalid GPX: ${err.textContent ?? 'unknown parse error'}`)
  }
  const trkpts = Array.from(doc.getElementsByTagName('trkpt'))
  const points: GpxPoint[] = []
  for (const pt of trkpts) {
    const lat = parseFloat(pt.getAttribute('lat') ?? '')
    const lon = parseFloat(pt.getAttribute('lon') ?? '')
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const eleNode = pt.getElementsByTagName('ele')[0]
    const elevationM = eleNode ? parseFloat(eleNode.textContent ?? '0') : 0
    points.push({ latitude: lat, longitude: lon, elevationM })
  }
  return points
}
