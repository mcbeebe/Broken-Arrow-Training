/** A typo'd source path would date a URL from nothing (git log prints nothing for it), so each must exist. */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { SITEMAP_SOURCES } from '../../../scripts/deploy/sitemap-lastmod'

// vitest runs from the repo root (jsdom's URL can't be turned into a file path, so no import.meta.url here)
const repoPath = (source: string): string => resolve(process.cwd(), source)

describe('SITEMAP_SOURCES', () => {
  it.each(Object.entries(SITEMAP_SOURCES))('%s names files that exist', (_path, sources) => {
    for (const source of sources) {
      expect(existsSync(repoPath(source)), source).toBe(true)
    }
  })
})
