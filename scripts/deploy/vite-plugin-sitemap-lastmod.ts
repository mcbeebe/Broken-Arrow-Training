/**
 * Stamps dist/sitemap.xml with a `<lastmod>` per URL (initiative 006): the
 * date of the last commit that touched the page's source files
 * (SITEMAP_SOURCES). public/sitemap.xml stays the hand-edited list of URLs;
 * only the built copy carries dates, so a commit that changes no page doesn't
 * move any of them. Needs git history: deploy.yml checks out with
 * `fetch-depth: 0`. In a shallow checkout every date would be the one commit's,
 * so on a developer machine the plugin falls back to the build date and says
 * so; in CI (GITHUB_ACTIONS) it fails the build instead, because a deploy
 * that restamps every page with today's date looks like a green workflow
 * and tells search engines that everything changed.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { SITEMAP_SOURCES, pathOf, stampSitemap } from './sitemap-lastmod'

/**
 * The latest commit date (YYYY-MM-DD, the AUTHOR date: rebases and branch
 * updates rewrite committer dates without changing a page) over these paths,
 * or null when git can't say.
 */
function lastCommitDate(root: string, paths: readonly string[]): string | null {
  try {
    const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: root, encoding: 'utf8' }).trim()
    if (shallow === 'true') return null
    const out = execFileSync('git', ['log', '-1', '--format=%as', '--', ...paths], { cwd: root, encoding: 'utf8' }).trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null
  } catch {
    return null
  }
}

/**
 * The `<lastmod>` for one URL: git's date, else today's (a local build), and
 * never a silent stand-in in CI.
 *
 * @param gitDate The date from git history, or null when it can't say.
 * @param today The build date (YYYY-MM-DD).
 * @param strict True in CI, where missing history is an error.
 * @param loc The URL, for the error message.
 * @returns The date to stamp and whether it is the stand-in.
 */
export function resolveLastmod(gitDate: string | null, today: string, strict: boolean, loc: string): { date: string; fellBack: boolean } {
  if (gitDate) return { date: gitDate, fellBack: false }
  if (strict) {
    throw new Error(
      `sitemap lastmod: no usable git history for ${loc}. The build job must check out with fetch-depth: 0 (deploy.yml); ` +
        'stamping the build date on every page would tell search engines everything changed on every deploy.',
    )
  }
  return { date: today, fellBack: true }
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
        const strict = process.env.GITHUB_ACTIONS === 'true'
        const stamped = stampSitemap(readFileSync(file, 'utf8'), loc => {
          const sources = SITEMAP_SOURCES[pathOf(loc)]
          const r = resolveLastmod(sources ? lastCommitDate(root, sources) : null, today, strict, loc)
          if (r.fellBack) fellBack = true
          return r.date
        })
        writeFileSync(file, stamped)
        if (fellBack) this.warn('sitemap lastmod: no usable git history for some URLs; used the build date')
      },
    },
  }
}
