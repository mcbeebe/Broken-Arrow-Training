import { describe, it, expect } from 'vitest'
import { hasTerrainAsset, loadTerrain } from '../data/terrain'

/**
 * The registry only knows about heightmap JSONs that physically exist
 * in `src/data/terrain/`. This PR ships the infrastructure but no
 * baked terrain data — that arrives in a follow-up PR when `npm run
 * fetch:terrain` is run on a machine with network access. These tests
 * pin the no-data behavior so the renderer reliably hides itself.
 */
describe('terrain registry', () => {
  it('returns false when no heightmap is registered for a course', () => {
    expect(hasTerrainAsset('broken-arrow-18k-2026')).toBe(false)
    expect(hasTerrainAsset('broken-arrow-11k-2026')).toBe(false)
  })

  it('loadTerrain resolves to null for unregistered courses', async () => {
    await expect(loadTerrain('broken-arrow-18k-2026')).resolves.toBeNull()
    await expect(loadTerrain('does-not-exist')).resolves.toBeNull()
  })
})
