import { describe, it, expect } from 'vitest'
import { hasTerrainAsset, loadTerrain } from '../data/terrain'

/**
 * The registry only knows about heightmap JSONs that physically exist in
 * `src/data/terrain/`. The 18K heightmap is baked (see
 * broken-arrow-18k-2026.json), the 11K is not yet — these tests pin
 * both behaviors so the renderer's gating stays honest.
 */
describe('terrain registry', () => {
  it('reports presence/absence per course based on baked heightmaps', () => {
    expect(hasTerrainAsset('broken-arrow-18k-2026')).toBe(true)
    expect(hasTerrainAsset('broken-arrow-11k-2026')).toBe(false)
    expect(hasTerrainAsset('does-not-exist')).toBe(false)
  })

  it('loadTerrain resolves to null for unregistered courses', async () => {
    await expect(loadTerrain('broken-arrow-11k-2026')).resolves.toBeNull()
    await expect(loadTerrain('does-not-exist')).resolves.toBeNull()
  })

  it('loadTerrain resolves to a heightmap for registered courses', async () => {
    const terrain = await loadTerrain('broken-arrow-18k-2026')
    expect(terrain).not.toBeNull()
  })
})
