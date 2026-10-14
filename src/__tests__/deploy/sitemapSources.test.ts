/** A typo'd source path would date a URL from nothing (git log prints nothing for it), so each must exist. */
import { describe, it, expect } from 'vitest'
import { SITEMAP_SOURCES } from '../../../scripts/deploy/sitemap-lastmod'

const files = Object.keys(import.meta.glob(['/index.html', '/tools/*.html', '/src/tools/*', '/src/landing/**/*'], { query: '?url' }))

describe('SITEMAP_SOURCES', () => {
  it.each(Object.entries(SITEMAP_SOURCES))('%s names files that exist', (_path, sources) => {
    for (const source of sources) {
      const path = `/${source}`
      expect(files.some(f => f === path || f.startsWith(`${path}/`)), source).toBe(true)
    }
  })
})
