/**
 * Stamps dist/sitemap.xml with a `<lastmod>` per URL (initiative 006): the
 * date of the last commit that touched the page's source files
 * (SITEMAP_SOURCES). public/sitemap.xml stays the hand-edited list of URLs;
 * only the built copy carries dates, so a commit that changes no page doesn't
 * move any of them. Needs git history: deploy.yml checks out with
 * `fetch-depth: 0`. In a shallow checkout every date would be the one commit's,
 * so the plugin falls back to the build date, and says so.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { SITEMAP_SOURCES, pathOf, stampSitemap } from './sitemap-lastmod'

/** The latest commit date (YYYY-MM-DD) over these paths, or null when git can't say. */
function lastCommitDate(root: string, paths: readonly string[]): string | null {
  try {
    const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: root, encoding: 'utf8' }).trim()
    if (shallow === 'true') return null
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', ...paths], { cwd: root, encoding: 'utf8' }).trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null
  } catch {
    return null
  }
}

/** Vite plugin: add `<lastmod>` to the built sitemap.xml. */
export function sitemapLastmod(): Plugin {
  let root = process.cwd()
  let outDir = 'dist'
  return {
    name: 'attune-sitemap-lastmod',
    apply: 'build',
    configResolved(config) {
      root = config.root
      outDir = join(config.root, config.build.outDir)
    },
    closeBundle: {
      // After Vite has copied public/ into the output.
      order: 'post',
      handler() {
        const file = join(outDir, 'sitemap.xml')
        if (!existsSync(file)) return
        const today = new Date().toISOString().slice(0, 10)
        let fellBack = false
        const stamped = stampSitemap(readFileSync(file, 'utf8'), loc => {
          const sources = SITEMAP_SOURCES[pathOf(loc)]
          const date = sources ? lastCommitDate(root, sources) : null
          if (!date) fellBack = true
          return date ?? today
        })
        writeFileSync(file, stamped)
        if (fellBack) this.warn('sitemap lastmod: no usable git history for some URLs; used the build date')
      },
    },
  }
}
