import { useEffect, useRef } from 'react'
// Cesium loads its workers + fonts at runtime from CESIUM_BASE_URL.
// vite.config.ts copies node_modules/cesium/Build/Cesium/{Workers,Assets,Widgets,ThirdParty}
// to dist/cesium/, so we point CESIUM_BASE_URL at <baseHref>cesium/.
// This MUST happen before the Cesium module is evaluated, hence the
// conditional set on the global before the imports below resolve.
const baseHref = import.meta.env.BASE_URL ?? '/'
;(globalThis as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL =
  `${baseHref}cesium/`

import {
  Viewer,
  Ion,
  ArcGisMapServerImageryProvider,
  Terrain,
  Cartesian3,
  Color,
  HeightReference,
  Math as CesiumMath,
  HeadingPitchRange,
  LabelStyle,
  VerticalOrigin,
  Cartesian2,
  PolylineDashMaterialProperty,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import type { Course, ElevationPoint, TerrainHeightmap } from '../types/course'
import { hasGpxAsset, loadGpx, type GpxPoint } from '../data/gpx'

const FEET_TO_METERS = 0.3048
// Where the route line sits relative to ground. 6m clamp lifts it just
// enough to be visible without floating ridiculously above the trail.
const ROUTE_HEIGHT_OFFSET_M = 6

interface SceneProps {
  course: Course
  /** Heightmap is no longer used for rendering (Cesium World Terrain
   *  draws the actual mountain) but the loader keeps passing it for
   *  API compatibility with Course3DPreview. */
  terrain?: TerrainHeightmap
}

interface RoutePoint {
  latitude: number
  longitude: number
  /** Height in meters above ellipsoid. */
  heightM: number
}

/**
 * Cesium-backed 3D course viewer. Renders the real mountain (Cesium
 * World Terrain or the free ArcGIS terrain) draped with satellite
 * imagery, then overlays the course GPX trace on top. Replaces the
 * three.js prototype, which couldn't match the visual quality of
 * Strava's 3D maps no matter how much we tuned the height ramp.
 *
 * Imported lazily by Course3DPreview so Cesium (~2MB gz) lives in a
 * dedicated chunk that only loads when a user taps "See your course".
 */
export default function Course3DScene({ course }: SceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<Viewer | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    // If a CESIUM_ION_TOKEN was provided at build time, use the full
    // Cesium ion stack (Bing aerial + World Terrain). Otherwise fall
    // back to ArcGIS's free providers — slightly lower-fidelity but
    // no signup, no rate limit on our scale.
    const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN
    if (ionToken) {
      Ion.defaultAccessToken = ionToken
    }

    const viewer = new Viewer(containerRef.current, {
      // ArcGIS World Imagery: free, no token. Cesium ion's default
      // Bing imagery still works without a token at very low scale
      // but ArcGIS is the safe choice for production.
      baseLayer: undefined,
      // Strip every default UI affordance — the preview is meant to
      // feel like a single object, not a Google Earth window. Users
      // get drag/pinch via the canvas itself.
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      vrButton: false,
      shouldAnimate: false,
    })
    viewerRef.current = viewer

    // Imagery — set after construction so we can fail gracefully if
    // a network problem makes the layer unavailable.
    ArcGisMapServerImageryProvider.fromUrl(
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
    )
      .then(provider => {
        if (cancelled || viewer.isDestroyed()) return
        viewer.imageryLayers.removeAll()
        viewer.imageryLayers.addImageryProvider(provider)
      })
      .catch(() => {
        // Default Cesium imagery stays in place; not fatal.
      })

    // Terrain — Cesium World Terrain if we have an ion token, else
    // ArcGIS World Elevation. Both are vertically accurate within a
    // few meters at Sierra resolutions.
    const terrainPromise = ionToken
      ? Terrain.fromWorldTerrain()
      : null
    if (terrainPromise) {
      viewer.scene.setTerrain(terrainPromise)
    }

    // Hide the credit container; Cesium attribution lives in the app
    // about page.
    viewer.cesiumWidget.creditContainer.parentElement?.querySelector<HTMLDivElement>(
      '.cesium-widget-credits',
    )?.style.setProperty('display', 'none')

    // Disable scene-mode picker keyboard shortcuts that fight the
    // overall preview UX (e.g. spacebar pauses).
    viewer.clock.shouldAnimate = false

    loadCourseRoute(course)
      .then(points => {
        if (cancelled || viewer.isDestroyed() || points.length < 2) return
        drawRoute(viewer, points)
        drawMarkers(viewer, course)
        flyToRoute(viewer, points)
      })
      .catch(err => {
        // Surfacing errors in the dev console is enough — the parent
        // shell already renders a generic failure strip if the lazy
        // chunk fails to mount.
        console.error('Course3DScene: failed to render route', err)
      })

    return () => {
      cancelled = true
      if (!viewer.isDestroyed()) viewer.destroy()
      viewerRef.current = null
    }
  }, [course])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    />
  )
}

/** Prefer the real GPX trace; fall back to hand-traced course
 *  waypoints when no GPX has been dropped in yet. */
async function loadCourseRoute(course: Course): Promise<RoutePoint[]> {
  if (hasGpxAsset(course.id)) {
    const gpx = await loadGpx(course.id)
    if (gpx && gpx.length >= 2) return gpx.map(gpxToRoutePoint)
  }
  return course.elevationProfile
    .filter(p => p.latitude != null && p.longitude != null)
    .map(profileToRoutePoint)
}

function gpxToRoutePoint(p: GpxPoint): RoutePoint {
  return {
    latitude: p.latitude,
    longitude: p.longitude,
    heightM: p.elevationM,
  }
}

function profileToRoutePoint(p: ElevationPoint): RoutePoint {
  return {
    latitude: p.latitude!,
    longitude: p.longitude!,
    heightM: p.elevationFt * FEET_TO_METERS,
  }
}

function drawRoute(viewer: Viewer, points: RoutePoint[]): void {
  const positions = points.flatMap(p => [p.longitude, p.latitude])
  viewer.entities.add({
    name: 'Course route',
    polyline: {
      positions: Cartesian3.fromDegreesArray(positions),
      width: 5,
      // clampToGround uses terrain elevation so the line follows the
      // actual mountain surface — what Strava does. The dash material
      // softens the line so it doesn't visually overpower at distance.
      clampToGround: true,
      material: Color.fromCssColorString('#ea580c'),
      depthFailMaterial: new PolylineDashMaterialProperty({
        color: Color.fromCssColorString('#ea580c').withAlpha(0.6),
        dashLength: 12,
      }),
    },
  })
}

const KEY_LABEL_KEYWORDS = ['HIGH POINT', 'Peak', 'Aid', 'Start', 'Finish']

function isKeyWaypoint(label: string | undefined): boolean {
  if (!label) return false
  return KEY_LABEL_KEYWORDS.some(kw => label.includes(kw))
}

function shortLabel(label: string): string {
  return label
    .replace(' (HIGH POINT)', '')
    .replace(' Aid Station', '')
    .replace(' (Base Area)', '')
    .replace('! Ring das bell!', '')
}

function drawMarkers(viewer: Viewer, course: Course): void {
  const keyPoints = course.elevationProfile.filter(
    p => isKeyWaypoint(p.label) && p.latitude != null && p.longitude != null,
  )
  for (const wp of keyPoints) {
    const isPeak = wp.label!.includes('HIGH POINT') || wp.label!.includes('Peak')
    const isAid = wp.label!.includes('Aid')
    const tint = isPeak
      ? Color.fromCssColorString('#fbbf24')
      : isAid
        ? Color.fromCssColorString('#22d3ee')
        : Color.fromCssColorString('#94a3b8')

    viewer.entities.add({
      position: Cartesian3.fromDegrees(
        wp.longitude!,
        wp.latitude!,
        wp.elevationFt * FEET_TO_METERS,
      ),
      point: {
        pixelSize: 10,
        color: tint,
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: shortLabel(wp.label!),
        font: '600 12px -apple-system, system-ui, sans-serif',
        fillColor: Color.fromCssColorString('#0f172a'),
        backgroundColor: Color.WHITE.withAlpha(0.92),
        showBackground: true,
        backgroundPadding: new Cartesian2(8, 4),
        pixelOffset: new Cartesian2(0, -22),
        verticalOrigin: VerticalOrigin.BOTTOM,
        style: LabelStyle.FILL,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scale: 0.9,
      },
    })
  }
}

function flyToRoute(viewer: Viewer, points: RoutePoint[]): void {
  // Compute the route bbox so we can frame it tightly. viewer.flyTo on
  // the entity collection auto-computes a bounding sphere, but the
  // resulting camera distance is overly tight at the route's altitude
  // band — overriding `range` gives consistent framing.
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity
  for (const p of points) {
    if (p.latitude < minLat) minLat = p.latitude
    if (p.latitude > maxLat) maxLat = p.latitude
    if (p.longitude < minLon) minLon = p.longitude
    if (p.longitude > maxLon) maxLon = p.longitude
  }
  const centerLat = (minLat + maxLat) / 2
  const latMeters = (maxLat - minLat) * 111000
  const lonMeters =
    (maxLon - minLon) * 111000 * Math.cos((centerLat * Math.PI) / 180)
  const extentM = Math.max(latMeters, lonMeters)
  // Distance from the route center; tuned so the entire loop fits on
  // a portrait viewport at the chosen pitch.
  const range = Math.max(2500, extentM * 1.8 + ROUTE_HEIGHT_OFFSET_M)

  viewer.flyTo(viewer.entities, {
    duration: 1.2,
    offset: new HeadingPitchRange(
      CesiumMath.toRadians(30),
      CesiumMath.toRadians(-35),
      range,
    ),
  })
}
