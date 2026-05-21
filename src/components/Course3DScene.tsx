import { useMemo, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import type {
  Course,
  ElevationPoint,
  TerrainHeightmap,
} from '../types/course'

/**
 * The real 3D content. Imported lazily by Course3DPreview so three.js
 * and @react-three/* never land in the main bundle. Test environments
 * (jsdom) won't load this — the parent gates on canvas support before
 * mounting.
 *
 * Coordinate system: terrain is centered at (0, 0, 0). X axis runs
 * west→east, Z axis runs south→north (negated from latitude so larger
 * latitudes go toward -Z, matching map conventions where "up" is north).
 * Y is elevation (up). All elevations are offset by `minElevationFt`
 * so the terrain "floor" sits at y = 0 — otherwise the mesh would
 * float thousands of world units up at altitude and the camera would
 * be staring at empty sky.
 */

const SCALE_METERS_PER_UNIT = 50
const FEET_TO_METERS = 0.3048
const VERTICAL_EXAGGERATION = 1.6

interface SceneProps {
  course: Course
  terrain: TerrainHeightmap
}

interface ProjectedPoint {
  position: [number, number, number]
  point: ElevationPoint
}

function elevFtToWorldY(elevFt: number, baselineFt: number): number {
  return ((elevFt - baselineFt) * FEET_TO_METERS * VERTICAL_EXAGGERATION) / SCALE_METERS_PER_UNIT
}

function project(
  lat: number,
  lon: number,
  elevFt: number,
  terrain: TerrainHeightmap,
): [number, number, number] {
  const { bounds } = terrain
  const meanLat = (bounds.minLatitude + bounds.maxLatitude) / 2
  const latMetersPerDeg = 111000
  const lonMetersPerDeg = 111000 * Math.cos((meanLat * Math.PI) / 180)

  const xMeters = (lon - (bounds.minLongitude + bounds.maxLongitude) / 2) * lonMetersPerDeg
  const zMeters = ((bounds.minLatitude + bounds.maxLatitude) / 2 - lat) * latMetersPerDeg

  return [
    xMeters / SCALE_METERS_PER_UNIT,
    elevFtToWorldY(elevFt, terrain.minElevationFt),
    zMeters / SCALE_METERS_PER_UNIT,
  ]
}

function sceneMetrics(terrain: TerrainHeightmap) {
  const meanLat = (terrain.bounds.minLatitude + terrain.bounds.maxLatitude) / 2
  const latMeters = (terrain.bounds.maxLatitude - terrain.bounds.minLatitude) * 111000
  const lonMeters =
    (terrain.bounds.maxLongitude - terrain.bounds.minLongitude) *
    111000 *
    Math.cos((meanLat * Math.PI) / 180)
  const planeWidth = lonMeters / SCALE_METERS_PER_UNIT
  const planeHeight = latMeters / SCALE_METERS_PER_UNIT
  const extent = Math.max(planeWidth, planeHeight)
  const maxY = elevFtToWorldY(terrain.maxElevationFt, terrain.minElevationFt)
  return { planeWidth, planeHeight, extent, maxY }
}

/** Bounding box of the route polyline in world coordinates. The camera
 *  fits to *this*, not the full terrain extent, so the loop fills the
 *  frame instead of getting lost inside a bigger heightmap. */
function routeBounds(course: Course, terrain: TerrainHeightmap) {
  const pts = course.elevationProfile.filter(
    p => p.latitude != null && p.longitude != null,
  )
  if (pts.length === 0) {
    const { extent, maxY } = sceneMetrics(terrain)
    return { centerX: 0, centerZ: 0, halfSpan: extent / 2, maxY }
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxRouteY = 0
  for (const p of pts) {
    const [x, y, z] = project(p.latitude!, p.longitude!, p.elevationFt, terrain)
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
    if (y > maxRouteY) maxRouteY = y
  }
  const centerX = (minX + maxX) / 2
  const centerZ = (minZ + maxZ) / 2
  // Pad the span so the route doesn't kiss the edge of the frame.
  const halfSpan = Math.max(maxX - minX, maxZ - minZ) / 2 * 1.35
  return { centerX, centerZ, halfSpan, maxY: maxRouteY }
}

function buildTerrainGeometry(terrain: TerrainHeightmap): THREE.BufferGeometry {
  const { width, height, elevationsFt, minElevationFt } = terrain
  const { planeWidth, planeHeight } = sceneMetrics(terrain)

  const geometry = new THREE.PlaneGeometry(
    planeWidth,
    planeHeight,
    width - 1,
    height - 1,
  )
  const pos = geometry.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const row = Math.floor(i / width)
    const col = i % width
    // PlaneGeometry vertices start at top-left (max Y in original XY).
    // After rotateX(-π/2), that maps to min Z = north. The fetched
    // heightmap stores row 0 = min latitude = south, so flip rows.
    const sampleIdx = (height - 1 - row) * width + col
    pos.setZ(i, elevFtToWorldY(elevationsFt[sampleIdx], minElevationFt))
  }
  geometry.rotateX(-Math.PI / 2)
  geometry.computeVertexNormals()

  return geometry
}

function buildTerrainColors(terrain: TerrainHeightmap, geometry: THREE.BufferGeometry): Float32Array {
  const { elevationsFt, minElevationFt, maxElevationFt, width, height } = terrain
  const range = Math.max(1, maxElevationFt - minElevationFt)
  const colors = new Float32Array(geometry.attributes.position.count * 3)
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    const row = Math.floor(i / width)
    const col = i % width
    const sampleIdx = (height - 1 - row) * width + col
    const t = (elevationsFt[sampleIdx] - minElevationFt) / range
    const color = elevationToColor(t)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  return colors
}

function elevationToColor(t: number): THREE.Color {
  // Sage (valley) → tan (mid-slope) → warm rock (ridge) → snow (peak).
  const stops: Array<{ t: number; color: THREE.Color }> = [
    { t: 0.0, color: new THREE.Color('#6b8e6b') },
    { t: 0.4, color: new THREE.Color('#c9a36b') },
    { t: 0.75, color: new THREE.Color('#a26b4a') },
    { t: 1.0, color: new THREE.Color('#f4f4f4') },
  ]
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].t) {
      const span = stops[i].t - stops[i - 1].t
      const local = span === 0 ? 0 : (t - stops[i - 1].t) / span
      return stops[i - 1].color.clone().lerp(stops[i].color, local)
    }
  }
  return stops[stops.length - 1].color.clone()
}

function Terrain({ terrain }: { terrain: TerrainHeightmap }) {
  const geometry = useMemo(() => {
    const g = buildTerrainGeometry(terrain)
    const colors = buildTerrainColors(terrain, g)
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return g
  }, [terrain])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        vertexColors
        roughness={0.95}
        metalness={0.0}
        flatShading={false}
      />
    </mesh>
  )
}

function RoutePath({ course, terrain }: { course: Course; terrain: TerrainHeightmap }) {
  const { extent } = sceneMetrics(terrain)
  // Tube radius scales with extent so the route is visible on both
  // tight (~3km) and wide (~10km) courses without manual tuning.
  const tubeRadius = extent * 0.005
  // Float the route slightly above terrain so it isn't z-fighting
  // with the mesh. 30 ft in world units after exaggeration.
  const floatFt = 30

  const projected = useMemo<ProjectedPoint[]>(() => {
    return course.elevationProfile
      .filter(p => p.latitude != null && p.longitude != null)
      .map(p => ({
        point: p,
        position: project(p.latitude!, p.longitude!, p.elevationFt + floatFt, terrain),
      }))
  }, [course, terrain])

  const geometry = useMemo(() => {
    if (projected.length < 2) return null
    const curve = new THREE.CatmullRomCurve3(
      projected.map(p => new THREE.Vector3(...p.position)),
      false,
      'centripetal',
      0.5,
    )
    return new THREE.TubeGeometry(curve, Math.max(64, projected.length * 8), tubeRadius, 8, false)
  }, [projected, tubeRadius])

  if (!geometry) return null

  return (
    <>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color="#ea580c"
          emissive="#ea580c"
          emissiveIntensity={0.35}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>
      {projected
        .filter(p => isMajorLabel(p.point.label))
        .map(p => (
          <Marker
            key={`${p.point.mile}-${p.point.label}`}
            position={p.position}
            label={p.point.label!}
            markerRadius={tubeRadius * 2.5}
          />
        ))}
    </>
  )
}

/** Keep label clutter low on small screens. Show only the peak, aid
 *  stations, and the start/finish marker — six landmarks compressed
 *  into a sub-300px canvas otherwise stack on top of each other. */
function isMajorLabel(label: string | undefined): boolean {
  if (!label) return false
  return (
    label.includes('HIGH POINT') ||
    label.includes('Peak') ||
    label.includes('Aid') ||
    label.includes('Start') ||
    label.includes('Finish')
  )
}

function shortLabel(label: string): string {
  return label
    .replace(' (HIGH POINT)', '')
    .replace(' Aid Station', '')
    .replace(' (Base Area)', '')
    .replace('! Ring das bell!', '')
}

function Marker({
  position,
  label,
  markerRadius,
}: {
  position: [number, number, number]
  label: string
  markerRadius: number
}) {
  const isPeak = label.includes('HIGH POINT') || label.includes('Peak')
  const isAid = label.includes('Aid')
  const color = isPeak ? '#fbbf24' : isAid ? '#22d3ee' : '#94a3b8'
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[markerRadius, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} />
      </mesh>
      <Html
        center
        position={[0, markerRadius * 4, 0]}
        style={{
          pointerEvents: 'none',
          fontSize: 10,
          fontWeight: 600,
          color: '#0f172a',
          background: 'rgba(255,255,255,0.92)',
          padding: '2px 6px',
          borderRadius: 4,
          whiteSpace: 'nowrap',
          transform: 'translate(-50%, -100%)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
        }}
      >
        {shortLabel(label)}
      </Html>
    </group>
  )
}

interface CameraFitProps {
  centerX: number
  centerZ: number
  targetY: number
  distance: number
}

function FitCamera({ centerX, centerZ, targetY, distance }: CameraFitProps) {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(
      centerX + distance * 0.7,
      targetY + distance * 0.55,
      centerZ + distance * 0.7,
    )
    camera.lookAt(centerX, targetY, centerZ)
    camera.updateProjectionMatrix()
  }, [camera, centerX, centerZ, targetY, distance])
  return null
}

export default function Course3DScene({ course, terrain }: SceneProps) {
  const { extent } = sceneMetrics(terrain)
  const { centerX, centerZ, halfSpan, maxY } = routeBounds(course, terrain)
  // Distance sized so the route's bounding diagonal comfortably fits
  // inside a 38° fov on portrait viewports (where vertical fov is the
  // binding constraint).
  const fitDistance = halfSpan * 3.2
  const targetY = maxY * 0.4
  const minDistance = halfSpan * 0.8
  const maxDistance = extent * 4
  const farPlane = extent * 12

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 38, near: 0.1, far: farPlane }}
      style={{ width: '100%', height: '100%', background: 'linear-gradient(180deg,#dbeafe 0%,#fef3c7 80%,#fde68a 100%)' }}
    >
      <FitCamera centerX={centerX} centerZ={centerZ} targetY={targetY} distance={fitDistance} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[extent * 0.6, extent * 0.9, extent * 0.3]} intensity={1.3} />
      <hemisphereLight args={['#bae6fd', '#92400e', 0.35]} />
      <Terrain terrain={terrain} />
      <RoutePath course={course} terrain={terrain} />
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        minDistance={minDistance}
        maxDistance={maxDistance}
        maxPolarAngle={Math.PI / 2.05}
        target={[centerX, targetY, centerZ]}
        autoRotate
        autoRotateSpeed={0.5}
      />
    </Canvas>
  )
}
