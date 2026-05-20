import type { TerrainHeightmap } from '../../types/course'

/**
 * Terrain registry. Heightmap JSON files live in this directory as
 * `<courseId>.json` and are produced by `npm run fetch:terrain`. We use
 * Vite's `import.meta.glob` with `eager: false` so the JSON is not bundled
 * into the main chunk — the 3D renderer dynamically imports the asset for
 * a specific course only when the user opens the preview.
 *
 * If no heightmap exists for a course, `loadTerrain()` returns null and
 * the renderer hides itself. The 2D elevation profile remains the default
 * surface; the 3D preview is a progressive enhancement gated on data.
 */

type TerrainLoader = () => Promise<{ default: TerrainHeightmap }>

const MODULES = import.meta.glob<{ default: TerrainHeightmap }>(
  './*.json',
) as Record<string, TerrainLoader>

function keyFor(courseId: string): string {
  return `./${courseId}.json`
}

/** True when a heightmap JSON for the given course exists at build time. */
export function hasTerrainAsset(courseId: string): boolean {
  return keyFor(courseId) in MODULES
}

/** Load and validate the heightmap for a course. Resolves to null when
 *  no asset is registered. Throws when the asset exists but fails
 *  schema validation — corrupt data should fail loudly, not silently. */
export async function loadTerrain(
  courseId: string,
): Promise<TerrainHeightmap | null> {
  const loader = MODULES[keyFor(courseId)]
  if (!loader) return null
  const mod = await loader()
  const data = mod.default
  validate(data, courseId)
  return data
}

function validate(data: TerrainHeightmap, courseId: string): void {
  if (data.version !== 1) {
    throw new Error(
      `Terrain heightmap for ${courseId} has unsupported version ${data.version} (expected 1).`,
    )
  }
  if (data.courseId !== courseId) {
    throw new Error(
      `Terrain heightmap courseId mismatch: file claims ${data.courseId}, registered as ${courseId}.`,
    )
  }
  const expected = data.width * data.height
  if (data.elevationsFt.length !== expected) {
    throw new Error(
      `Terrain heightmap for ${courseId} has ${data.elevationsFt.length} samples; expected ${expected} (${data.width}×${data.height}).`,
    )
  }
}
