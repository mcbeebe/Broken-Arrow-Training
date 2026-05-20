/* eslint-disable react-hooks/immutability --
 * react-three-fiber's idiomatic API is mutation-based: callbacks like
 * useFrame receive the live scene-graph object and update its transform
 * in place. The React 19 hooks plugin's immutability rule conflicts with
 * that contract for this entire file. */
import { useMemo, useRef, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
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
 * Y is elevation (up). Everything is scaled so the terrain extent in
 * meters maps to world units divided by SCALE_METERS_PER_UNIT, giving
 * a manageable scene size for the orbit camera.
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
  const yMeters = elevFt * FEET_TO_METERS * VERTICAL_EXAGGERATION

  return [
    xMeters / SCALE_METERS_PER_UNIT,
    yMeters / SCALE_METERS_PER_UNIT,
    zMeters / SCALE_METERS_PER_UNIT,
  ]
}

function buildTerrainGeometry(terrain: TerrainHeightmap): THREE.BufferGeometry {
  const { width, height, elevationsFt, bounds } = terrain
  const meanLat = (bounds.minLatitude + bounds.maxLatitude) / 2
  const latMeters = (bounds.maxLatitude - bounds.minLatitude) * 111000
  const lonMeters =
    (bounds.maxLongitude - bounds.minLongitude) *
    111000 *
    Math.cos((meanLat * Math.PI) / 180)

  const planeWidth = lonMeters / SCALE_METERS_PER_UNIT
  const planeHeight = latMeters / SCALE_METERS_PER_UNIT

  const geometry = new THREE.PlaneGeometry(
    planeWidth,
    planeHeight,
    width - 1,
    height - 1,
  )
  // PlaneGeometry vertices are laid out row-by-row starting from top-left
  // (i.e. max-y, min-x) when the plane lies in the XY plane before rotation.
  // After we rotate to lie flat (XZ plane), we need to push the Y component
  // (which was Z before rotation) by the elevation. The order matches our
  // row-major elevationsFt: row 0 = northernmost = max latitude.
  const pos = geometry.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const row = Math.floor(i / width)
    const col = i % width
    // Sample row 0 = max latitude (north) which sits at -Z after rotation.
    const sampleIdx = (height - 1 - row) * width + col
    const elevFt = elevationsFt[sampleIdx]
    const elevWorld = (elevFt * FEET_TO_METERS * VERTICAL_EXAGGERATION) / SCALE_METERS_PER_UNIT
    pos.setZ(i, elevWorld)
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
  // Stops chosen to evoke the Sierra at 6,200–9,000 ft.
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
    <mesh geometry={geometry} receiveShadow castShadow>
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
  const projected = useMemo<ProjectedPoint[]>(() => {
    return course.elevationProfile
      .filter(p => p.latitude != null && p.longitude != null)
      .map(p => ({
        point: p,
        position: project(p.latitude!, p.longitude!, p.elevationFt + 40, terrain),
      }))
  }, [course, terrain])

  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(
      projected.map(p => new THREE.Vector3(...p.position)),
      false,
      'centripetal',
      0.5,
    )
    return new THREE.TubeGeometry(curve, Math.max(64, projected.length * 8), 0.08, 8, false)
  }, [projected])

  if (projected.length < 2) return null

  return (
    <>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color="#ea580c"
          emissive="#ea580c"
          emissiveIntensity={0.25}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>
      {projected
        .filter(p => p.point.label)
        .map(p => (
          <Marker key={`${p.point.mile}-${p.point.label}`} position={p.position} label={p.point.label!} />
        ))}
    </>
  )
}

function Marker({ position, label }: { position: [number, number, number]; label: string }) {
  const isPeak = label.includes('HIGH POINT') || label.includes('Peak')
  const isAid = label.includes('Aid')
  const color = isPeak ? '#fbbf24' : isAid ? '#22d3ee' : '#94a3b8'
  return (
    <group position={position}>
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
      </mesh>
      <Html
        center
        position={[0, 1.1, 0]}
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
        {label.replace(' (HIGH POINT)', '')}
      </Html>
    </group>
  )
}

function AutoRotate({ enabled }: { enabled: boolean }) {
  const { camera } = useThree()
  const angle = useRef(0)
  useFrame((_state, delta) => {
    if (!enabled) return
    angle.current += delta * 0.08
    const radius = Math.hypot(camera.position.x, camera.position.z) || 18
    const y = camera.position.y
    camera.position.x = Math.cos(angle.current) * radius
    camera.position.z = Math.sin(angle.current) * radius
    camera.position.y = y
    camera.lookAt(0, 1, 0)
  })
  return null
}

function FitCamera({ terrain }: { terrain: TerrainHeightmap }) {
  const { camera } = useThree()
  const meanLat = (terrain.bounds.minLatitude + terrain.bounds.maxLatitude) / 2
  const latMeters = (terrain.bounds.maxLatitude - terrain.bounds.minLatitude) * 111000
  const lonMeters =
    (terrain.bounds.maxLongitude - terrain.bounds.minLongitude) *
    111000 *
    Math.cos((meanLat * Math.PI) / 180)
  const extent = Math.max(latMeters, lonMeters) / SCALE_METERS_PER_UNIT

  useEffect(() => {
    camera.position.set(extent * 0.9, extent * 0.7, extent * 0.9)
    camera.lookAt(0, 1, 0)
    camera.updateProjectionMatrix()
  }, [camera, extent])

  return null
}

export default function Course3DScene({ course, terrain }: SceneProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 38, near: 0.1, far: 500 }}
      style={{ width: '100%', height: '100%', background: 'linear-gradient(180deg,#dbeafe 0%,#fef3c7 80%,#fde68a 100%)' }}
    >
      <FitCamera terrain={terrain} />
      <AutoRotate enabled />
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[20, 30, 10]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <hemisphereLight args={['#bae6fd', '#92400e', 0.35]} />
      <Terrain terrain={terrain} />
      <RoutePath course={course} terrain={terrain} />
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        minDistance={4}
        maxDistance={80}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 1, 0]}
      />
    </Canvas>
  )
}
